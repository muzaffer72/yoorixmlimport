import { CategoryMatcher } from './server/categoryMatcher.js';

// Test kategorileri
const testCategories = [
  {
    id: '1',
    name: 'Elektronik',
    parentId: null,
    description: 'Elektronik ürünler ve aksesuarları',
    isActive: true,
    sortOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '2', 
    name: 'Telefon',
    parentId: '1',
    description: 'Akıllı telefonlar ve cep telefonları',
    isActive: true,
    sortOrder: 2,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '3',
    name: 'Bilgisayar', 
    parentId: '1',
    description: 'Masaüstü bilgisayarlar ve laptoplar',
    isActive: true,
    sortOrder: 3,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '4',
    name: 'Giyim',
    parentId: null, 
    description: 'Erkek ve kadın giyim ürünleri',
    isActive: true,
    sortOrder: 4,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    id: '5',
    name: 'Ayakkabı',
    parentId: '4',
    description: 'Spor ayakkabı, bot, terlik ve sandalet',
    isActive: true,
    sortOrder: 5,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// Test XML kategorileri
const xmlCategories = [
  'Elektronik Ürünler',
  'Cep Telefonu', 
  'Akıllı Telefon',
  'Laptop Bilgisayar',
  'Masaüstü PC',
  'Erkek Giyim',
  'Spor Ayakkabı',
  'Bot ve Çizme',
  'Televizyon',
  'Kamera'
];

console.log('🧪 CategoryMatcher Fuse.js Test\n');

try {
  // CategoryMatcher'ı başlat
  const matcher = new CategoryMatcher(testCategories);
  console.log('✅ CategoryMatcher başarıyla başlatıldı\n');

  // Her XML kategorisi için test
  console.log('📋 Kategori Eşleştirme Testleri:\n');
  
  xmlCategories.forEach((xmlCat, index) => {
    const result = matcher.findCategory(xmlCat);
    
    console.log(`${index + 1}. XML Kategori: "${xmlCat}"`);
    
    if (result.category) {
      const confidencePercent = (result.confidence * 100).toFixed(1);
      console.log(`   ✅ Eşleşti: "${result.category.name}" (${confidencePercent}%)`);
      
      // Güven seviyesi belirtme
      if (result.confidence > 0.8) {
        console.log('   🎯 Yüksek güven - Otomatik eşleştirme önerilir');
      } else if (result.confidence > 0.6) {
        console.log('   ⚠️ Orta güven - Manuel onay önerilir');
      } else if (result.confidence > 0.4) {
        console.log('   🔍 Düşük güven - Alternatifler kontrol edilmeli');
      }
    } else {
      console.log('   ❌ Eşleşme bulunamadı');
    }
    
    // Alternatifler varsa göster
    if (result.alternatives && result.alternatives.length > 0) {
      console.log('   📝 Alternatif öneriler:');
      result.alternatives.forEach((alt, altIndex) => {
        const altConfidence = (alt.confidence * 100).toFixed(1);
        console.log(`      ${altIndex + 1}. ${alt.category.name} (${altConfidence}%)`);
      });
    }
    
    console.log('');
  });

  // Toplu eşleştirme testi
  console.log('📊 Toplu Eşleştirme Analizi:\n');
  
  const mappings = matcher.autoMapCategories(xmlCategories, testCategories);
  const categorized = matcher.categorizeByConfidence(mappings);
  
  console.log(`📈 Sonuçlar:`);
  console.log(`   Toplam kategori: ${mappings.length}`);
  console.log(`   🎯 Yüksek güven (>80%): ${categorized.high.length}`);
  console.log(`   ⚠️ Orta güven (60-80%): ${categorized.medium.length}`);
  console.log(`   🔍 Düşük güven (40-60%): ${categorized.low.length}`);
  console.log(`   ❌ Eşleşmedi (≤40%): ${categorized.noMatch.length}`);

  // Başarı oranı hesapla
  const successfulMatches = categorized.high.length + categorized.medium.length;
  const successRate = ((successfulMatches / mappings.length) * 100).toFixed(1);
  console.log(`\n🏆 Başarı Oranı: ${successRate}% (${successfulMatches}/${mappings.length})`);

  console.log('\n✅ Test tamamlandı!');

} catch (error) {
  console.error('❌ Test hatası:', error);
}
