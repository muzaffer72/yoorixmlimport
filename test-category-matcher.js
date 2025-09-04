// Test script for CategoryMatcher with Fuse.js
import { CategoryMatcher } from './server/categoryMatcher.ts';

// Test verileri
const testCategories = [
  { id: '1', name: 'Elektronik', parentId: null, description: 'Elektronik ürünler', isActive: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
  { id: '2', name: 'Telefon', parentId: '1', description: 'Akıllı telefonlar', isActive: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
  { id: '3', name: 'Bilgisayar', parentId: '1', description: 'Bilgisayarlar ve laptoplar', isActive: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
  { id: '4', name: 'Giyim', parentId: null, description: 'Giyim eşyaları', isActive: true, sortOrder: 4, createdAt: new Date(), updatedAt: new Date() },
  { id: '5', name: 'Ayakkabı', parentId: '4', description: 'Ayakkabı ve terlik', isActive: true, sortOrder: 5, createdAt: new Date(), updatedAt: new Date() },
];

const xmlCategories = [
  'Elektronik Ürünler',
  'Cep Telefonu',
  'Akıllı Telefon',
  'Laptop',
  'Masaüstü Bilgisayar',
  'Erkek Giyim',
  'Spor Ayakkabı',
  'Çizme',
  'Kamera',
  'Televizyon'
];

console.log('🧪 CategoryMatcher with Fuse.js Test Started\n');

// CategoryMatcher'ı başlat
const matcher = new CategoryMatcher(testCategories);

console.log('✅ CategoryMatcher initialized with', testCategories.length, 'categories');

// Her XML kategorisi için test et
console.log('\n📋 Testing individual category matching:\n');

for (const xmlCat of xmlCategories) {
  const result = matcher.findCategory(xmlCat);
  
  console.log(`🔍 XML Kategori: "${xmlCat}"`);
  if (result.category) {
    console.log(`✅ Eşleşti: "${result.category.name}" (Güven: ${(result.confidence * 100).toFixed(1)}%)`);
  } else {
    console.log(`❌ Eşleşme bulunamadı (Güven: ${(result.confidence * 100).toFixed(1)}%)`);
  }
  
  if (result.alternatives.length > 0) {
    console.log('📝 Alternatifler:');
    result.alternatives.forEach(alt => {
      console.log(`   - ${alt.category.name} (${(alt.confidence * 100).toFixed(1)}%)`);
    });
  }
  
  console.log('');
}

// Toplu eşleştirme testi
console.log('\n📊 Testing batch category mapping:\n');

const mappings = matcher.autoMapCategories(xmlCategories, testCategories);
const categorized = matcher.categorizeByConfidence(mappings);

console.log('📈 Eşleştirme Özeti:');
console.log(`   Toplam: ${mappings.length}`);
console.log(`   Yüksek güven (>80%): ${categorized.high.length}`);
console.log(`   Orta güven (60-80%): ${categorized.medium.length}`);
console.log(`   Düşük güven (40-60%): ${categorized.low.length}`);
console.log(`   Eşleşmedi (<=40%): ${categorized.noMatch.length}`);

console.log('\n🎯 Detaylar:');
console.log('Yüksek güven:', categorized.high.map(m => `${m.xmlCategory} -> ${m.suggestedCategory?.name}`));
console.log('Orta güven:', categorized.medium.map(m => `${m.xmlCategory} -> ${m.suggestedCategory?.name}`));
console.log('Düşük güven:', categorized.low.map(m => `${m.xmlCategory} -> ${m.suggestedCategory?.name}`));
console.log('Eşleşmedi:', categorized.noMatch.map(m => m.xmlCategory));

// Çoklu eşleşme testi
console.log('\n🔍 Testing multiple matches for "Akıllı Telefon":\n');
const multipleResults = matcher.findMultipleCategories('Akıllı Telefon', 3);
multipleResults.forEach((result, index) => {
  console.log(`${index + 1}. ${result.category.name} (${(result.confidence * 100).toFixed(1)}%)`);
  if (result.matches && result.matches.length > 0) {
    result.matches.forEach(match => {
      console.log(`   Eşleşen alan: ${match.key} = "${match.value}"`);
    });
  }
});

console.log('\n✅ Test completed!');
