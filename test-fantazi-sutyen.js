import { CategoryMatcher } from './server/categoryMatcher.js';

// Test kategorileri - Türkçe gerçek örnekler
const testCategories = [
  // Ana kategoriler
  {
    id: '100',
    name: 'Giyim',
    parentId: null,
    description: 'Tüm giyim ürünleri',
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '200',
    name: 'İç Giyim',
    parentId: '100',
    description: 'İç giyim ürünleri',
    isActive: true,
    sortOrder: 2,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '300',
    name: 'Elektronik',
    parentId: null,
    description: 'Elektronik ürünler',
    isActive: true,
    sortOrder: 3,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  
  // Alt kategoriler - Sütyen çeşitleri
  {
    id: '201',
    name: 'Sütyen',
    parentId: '200',
    description: 'Kadın sütyenleri',
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '202',
    name: 'Fantezi Sütyen',
    parentId: '200',
    description: 'Fantezi ve seksi sütyen modelleri',
    isActive: true,
    sortOrder: 2,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '203',
    name: 'Spor Sütyeni',
    parentId: '200',
    description: 'Spor için sütyen',
    isActive: true,
    sortOrder: 3,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '204',
    name: 'Push-up Sütyen',
    parentId: '200',
    description: 'Kaldırıcı sütyen modelleri',
    isActive: true,
    sortOrder: 4,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '205',
    name: 'Fantazi',
    parentId: '200',
    description: 'Fantezi iç giyim',
    isActive: true,
    sortOrder: 5,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '206',
    name: 'Dantelli Sütyen',
    parentId: '200',
    description: 'Dantelli sütyen modelleri',
    isActive: true,
    sortOrder: 6,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// Test XML kategorileri - farklı yazım şekilleri
const xmlTestCategories = [
  'Fantazi Sütyen',      // Tam eşleşme
  'Fantezi Sütyen',      // z/s karışıklığı
  'Fantazi Sutyen',      // ü/u karışıklığı
  'fantazi sütyen',      // küçük harf
  'FANTAZI SÜTYEN',      // büyük harf
  'Fantazi + Sütyen',    // özel karakter
  'Fantazi-Sütyen',      // tire
  'Fantazi & Sütyen',    // ampersand
  'Seksi Sütyen',        // yakın anlam
  'Push Up Sütyen',      // farklı kategori
  'Spor Sütyeni',        // farklı kategori
  'Sütyen Fantazi',      // ters sıra
  'Fantazi',             // tek kelime
  'Sütyen',              // tek kelime
  'Dantel Sütyen',       // yakın kategori
  'İç Giyim Fantazi'     // üst kategori
];

console.log('🧪 Fantazi Sütyen Kategori Eşleştirme Testi\n');

try {
  // CategoryMatcher'ı başlat
  const matcher = new CategoryMatcher(testCategories);
  console.log('✅ CategoryMatcher başlatıldı\n');

  console.log('📋 XML Kategori Eşleştirme Sonuçları:\n');
  console.log('='.repeat(80) + '\n');

  xmlTestCategories.forEach((xmlCat, index) => {
    console.log(`${index + 1}. Test Kategorisi: "${xmlCat}"`);
    console.log('-'.repeat(50));
    
    const result = matcher.findCategory(xmlCat);
    
    if (result.category) {
      const confidencePercent = (result.confidence * 100).toFixed(1);
      console.log(`   🎯 EN İYİ EŞLEŞME: "${result.category.name}"`);
      console.log(`   📊 Güven Skoru: ${confidencePercent}%`);
      
      // Güven seviyesi analizi
      if (result.confidence > 0.9) {
        console.log('   🟢 MÜKEMMELLinked - Neredeyse tam eşleşme');
      } else if (result.confidence > 0.8) {
        console.log('   🟢 YÜKSEK - Otomatik eşleştirilebilir');
      } else if (result.confidence > 0.6) {
        console.log('   🟡 ORTA - Manuel onay önerilir');
      } else if (result.confidence > 0.4) {
        console.log('   🟠 DÜŞÜK - Alternatifler kontrol edilmeli');
      } else {
        console.log('   🔴 ÇOK DÜŞÜK - Manuel eşleştirme gerekli');
      }
    } else {
      console.log('   ❌ EŞLEŞME BULUNAMADI');
    }
    
    // Alternatifleri göster
    if (result.alternatives && result.alternatives.length > 0) {
      console.log('\n   📝 ALTERNATİF ÖNERÍLER:');
      result.alternatives.forEach((alt, altIndex) => {
        const altConfidence = (alt.confidence * 100).toFixed(1);
        console.log(`      ${altIndex + 1}. "${alt.category.name}" (${altConfidence}%)`);
      });
    }
    
    console.log('\n');
  });

  // Çoklu eşleştirme analizi
  console.log('🔍 Çoklu Eşleştirme Analizi - "Fantazi Sütyen"\n');
  console.log('='.repeat(60));
  
  const multipleResults = matcher.findMultipleCategories('Fantazi Sütyen', 5);
  
  multipleResults.forEach((result, index) => {
    const confidence = (result.confidence * 100).toFixed(1);
    console.log(`${index + 1}. "${result.category.name}" - ${confidence}%`);
    
    if (result.matches && result.matches.length > 0) {
      result.matches.forEach(match => {
        if (match.key === 'name') {
          console.log(`   └─ Eşleşen metin: "${match.value}"`);
        }
      });
    }
  });

  // Özet Analiz
  console.log('\n📊 ÖZET ANALİZ\n');
  console.log('='.repeat(50));
  
  const mappings = matcher.autoMapCategories(xmlTestCategories, testCategories);
  const categorized = matcher.categorizeByConfidence(mappings);
  
  console.log(`📈 Sonuçlar:`);
  console.log(`   Toplam test: ${mappings.length}`);
  console.log(`   🟢 Yüksek güven (>80%): ${categorized.high.length}`);
  console.log(`   🟡 Orta güven (60-80%): ${categorized.medium.length}`);  
  console.log(`   🟠 Düşük güven (40-60%): ${categorized.low.length}`);
  console.log(`   🔴 Eşleşmedi (≤40%): ${categorized.noMatch.length}`);

  // Başarılı eşleşmeleri listele
  if (categorized.high.length > 0) {
    console.log('\n🎯 YÜKSEK GÜVEN EŞLEŞMELERİ:');
    categorized.high.forEach(m => {
      const confidence = (m.confidence * 100).toFixed(1);
      console.log(`   "${m.xmlCategory}" → "${m.suggestedCategory?.name}" (${confidence}%)`);
    });
  }

  if (categorized.medium.length > 0) {
    console.log('\n⚠️ ORTA GÜVEN EŞLEŞMELERİ (Manuel Onay):');
    categorized.medium.forEach(m => {
      const confidence = (m.confidence * 100).toFixed(1);
      console.log(`   "${m.xmlCategory}" → "${m.suggestedCategory?.name}" (${confidence}%)`);
    });
  }

  console.log('\n✅ Test tamamlandı!');

} catch (error) {
  console.error('❌ Test hatası:', error);
}
