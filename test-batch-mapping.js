// Test batch category mapping functionality
import { GeminiService } from './server/geminiService.js';

async function testBatchMapping() {
  console.log('🧪 Batch kategori eşleştirme testi başlıyor...');
  
  // Test verileri
  const xmlSourceId = 'test-xml-source';
  const testXmlCategories = [
    'Elektronik',
    'Cep Telefonu',
    'iPhone Kılıf',
    'Bluetooth Kulaklık',
    'Laptop',
    'Gaming Mouse',
    'Kamera',
    'Powerbank',
    'Şarj Aleti',
    'Tablet'
  ];
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('❌ GEMINI_API_KEY environment variable gerekli');
    return;
  }
  
  try {
    const geminiService = new GeminiService(apiKey);
    
    console.log('📊 Test parametreleri:');
    console.log(`├─ XML Source ID: ${xmlSourceId}`);
    console.log(`├─ Test kategorileri: ${testXmlCategories.length}`);
    console.log(`└─ Kategoriler: ${testXmlCategories.join(', ')}`);
    
    // Batch eşleştirme çalıştır
    const result = await geminiService.createBatchCategoryMapping(
      xmlSourceId,
      testXmlCategories,
      'gemini-1.5-flash'
    );
    
    console.log('✅ Batch eşleştirme testi başarılı!');
    console.log('📁 Sonuçlar:');
    console.log(`├─ Dosya: ${result.filePath}`);
    console.log(`├─ Toplam eşleştirme: ${result.totalMappings}`);
    console.log(`├─ Batch sayısı: ${result.batchCount}`);
    console.log(`└─ Ortalama güven: %${(result.avgConfidence * 100).toFixed(1)}`);
    
    // Oluşturulan dosyadan test kategori al
    console.log('\n🔍 Cache test ediliyor...');
    const cachedResult = await geminiService.getCategoryFromSavedMapping(
      xmlSourceId, 
      'Elektronik'
    );
    
    if (cachedResult) {
      console.log('✅ Cache testi başarılı!');
      console.log(`├─ Önerilen kategori: ${cachedResult.suggestedCategory?.name || 'Yok'}`);
      console.log(`├─ Güven skoru: %${(cachedResult.confidence * 100).toFixed(1)}`);
      console.log(`├─ Cache'den: ${cachedResult.fromCache ? 'Evet' : 'Hayır'}`);
      console.log(`└─ Açıklama: ${cachedResult.reasoning.substring(0, 50)}...`);
    } else {
      console.log('❌ Cache testi başarısız - kategori bulunamadı');
    }
    
  } catch (error) {
    console.error('❌ Test hatası:', error.message);
  }
}

// Test'i çalıştır
testBatchMapping();
