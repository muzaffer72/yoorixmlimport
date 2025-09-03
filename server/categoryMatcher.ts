import Fuse from 'fuse.js';
import { db } from './db';
import { category_languages } from './db/schema';
import { eq } from 'drizzle-orm';

// Bu arayüz, veritabanından gelen kategori verisinin yapısını tanımlar.
interface LocalCategory {
  id: string;
  name: string;
}

// Veritabanından alınan kategorileri bellekte saklamak için bir önbellek (cache).
// Bu, her istekte veritabanına gitmeyi önleyerek performansı artırır.
let localCategoriesCache: LocalCategory[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 1000 * 60 * 30; // Önbelleği 30 dakika geçerli kıl.

/**
 * Veritabanından yerel kategorileri önbellekleme mekanizmasıyla birlikte getirir.
 * Eğer önbellek taze ise veritabanına gitmez.
 */
async function getLocalCategories(): Promise<LocalCategory[]> {
  const now = Date.now();
  // Önbellek varsa ve hala geçerliyse, önbellekten döndür.
  if (localCategoriesCache && (now - cacheTimestamp < CACHE_DURATION)) {
    return localCategoriesCache;
  }

  try {
    console.log('Veritabanından yerel kategoriler çekiliyor...');
    // Drizzle ORM kullanarak 'category_languages' tablosundan Türkçe kategorileri seç.
    const results = await db
      .select({
        id: category_languages.category_id,
        name: category_languages.name,
      })
      .from(category_languages)
      .where(eq(category_languages.lang, 'tr'))
      .orderBy(category_languages.name);
      
    // Sonuçları LocalCategory arayüzüne uygun formata dönüştür. ID'nin string olduğundan emin ol.
    const categories = results.map(r => ({
        id: String(r.id),
        name: r.name
    }));

    localCategoriesCache = categories; // Yeni veriyi önbelleğe al.
    cacheTimestamp = now; // Önbellek zaman damgasını güncelle.
    console.log(`${categories.length} adet yerel kategori önbelleğe alındı.`);
    return categories;
  } catch (error) {
    console.error('Veritabanından yerel kategorileri çekerken hata oluştu:', error);
    return []; // Hata durumunda boş bir dizi döndür.
  }
}

/**
 * Fuse.js kullanarak verilen bir sorgu için en iyi kategori eşleşmesini bulur.
 * @param queryCategoryName Eşleştirilecek XML kategori adı.
 * @returns En iyi eşleşmeyi ve güven skorunu içeren bir nesne veya null.
 */
export async function findBestCategoryMatch(queryCategoryName: string): Promise<{
  suggestedCategory: { id: string; name: string; } | null;
  confidence: number;
  reasoning: string;
}> {
  // Öncelikle yerel kategorilerin tamamını al.
  const localCategories = await getLocalCategories();
  if (localCategories.length === 0) {
    return {
      suggestedCategory: null,
      confidence: 0,
      reasoning: 'Yerel kategori listesi boş veya yüklenemedi.'
    };
  }

  // Fuse.js'i yapılandır.
  const fuseOptions = {
    includeScore: true, // Sonuçlara bir "skor" dahil et.
    keys: ['name'],     // Sadece 'name' alanında arama yap.
    threshold: 0.6,     // Eşleşme hassasiyeti (0.0 çok katı, 1.0 çok esnek).
  };

  const fuse = new Fuse(localCategories, fuseOptions);
  const results = fuse.search(queryCategoryName);

  // Eğer bir sonuç bulunursa...
  if (results.length > 0) {
    const bestResult = results[0]; // En iyi sonuç her zaman ilk sıradadır.
    const confidence = 1 - (bestResult.score || 0); // Fuse skorunu (0=iyi) güven skoruna (1=iyi) çevir.

    // Güven skoru çok düşükse (örneğin %30'dan az) eşleşme yok say.
    if (confidence < 0.3) {
        return {
            suggestedCategory: null,
            confidence: 0,
            reasoning: `En iyi aday '${bestResult.item.name}' idi ancak güven skoru (${confidence.toFixed(2)}) çok düşüktü.`
        };
    }

    return {
      suggestedCategory: {
        id: bestResult.item.id,
        name: bestResult.item.name,
      },
      confidence: confidence,
      reasoning: `Fuse.js ile bulundu. Skor: ${confidence.toFixed(2)}`
    };
  }

  // Hiç sonuç bulunamazsa.
  return {
    suggestedCategory: null,
    confidence: 0,
    reasoning: 'Fuse.js ile eşleşme bulunamadı.'
  };
}