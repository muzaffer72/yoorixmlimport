const { GeminiService } = require('./dist/server/geminiService.js');

async function testGeminiApiEndpoint() {
  console.log('🔍 Gemini API endpoint testi başlatılıyor...\n');
  
  // Test API anahtarı (gerçek API anahtarı ile değiştirin)
  const testApiKey = process.env.GEMINI_API_KEY || 'your-api-key-here';
  
  if (testApiKey === 'your-api-key-here') {
    console.log('❌ GEMINI_API_KEY environment variable ayarlanmamış');
    console.log('Kullanım: GEMINI_API_KEY=your-key node test-api-endpoint.js');
    return;
  }
  
  // Normal yapılandırma ile test
  console.log('1️⃣ Normal yapılandırma testi...');
  const normalService = new GeminiService(testApiKey);
  const normalResult = await normalService.testApiConnection();
  
  console.log('Normal yapılandırma sonucu:', {
    success: normalResult.success,
    endpoint: normalResult.endpoint,
    responseTime: `${normalResult.responseTime}ms`,
    error: normalResult.error || 'Yok'
  });
  
  console.log('\n2️⃣ Özel endpoint yapılandırması testi...');
  
  // Özel endpoint ile test
  const customService = new GeminiService(testApiKey, {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    timeout: 10000
  });
  const customResult = await customService.testApiConnection();
  
  console.log('Özel endpoint sonucu:', {
    success: customResult.success,
    endpoint: customResult.endpoint,
    responseTime: `${customResult.responseTime}ms`,
    error: customResult.error || 'Yok'
  });
  
  // Alternatif endpoint'ler test et
  console.log('\n3️⃣ Alternatif endpointler testi...');
  const alternativeResults = await normalService.testAlternativeEndpoints(testApiKey);
  
  console.log('\nTüm endpoint test sonuçları:');
  alternativeResults.forEach((result, index) => {
    console.log(`${index + 1}. ${result.endpoint}`);
    console.log(`   Durum: ${result.success ? '✅ Başarılı' : '❌ Başarısız'}`);
    console.log(`   Süre: ${result.responseTime}ms`);
    if (result.error) {
      console.log(`   Hata: ${result.error}`);
    }
    console.log('');
  });
  
  // En hızlı başarılı endpoint'i bul
  const successfulEndpoints = alternativeResults.filter(r => r.success);
  if (successfulEndpoints.length > 0) {
    const fastest = successfulEndpoints.reduce((prev, current) => 
      prev.responseTime < current.responseTime ? prev : current
    );
    console.log(`🚀 En hızlı endpoint: ${fastest.endpoint} (${fastest.responseTime}ms)`);
  } else {
    console.log('❌ Hiçbir endpoint başarılı değil');
  }
}

// Test'i çalıştır
testGeminiApiEndpoint().catch(console.error);
