// Test dosyası - Gemini API'nin doğru çalışıp çalışmadığını kontrol et
const { GoogleGenerativeAI } = require('@google/genai');

async function testGeminiAPI() {
  // Bu API anahtarı geçici test için
  const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyB_your_api_key';
  
  if (!API_KEY || API_KEY === 'AIzaSyB_your_api_key') {
    console.log('❌ GEMINI_API_KEY environment variable gerekli');
    return;
  }

  const client = new GoogleGenerativeAI(API_KEY);
  
  try {
    console.log('🤖 Gemini API test ediliyor...');
    
    // Doğru API kullanımı
    const result = await client.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: 'Test - sadece "OK" de'
    });
    
    const text = result.text || result.response?.text() || 'Yanıt alınamadı';
    console.log('✅ API test başarılı!');
    console.log('📝 Yanıt:', text);
    
  } catch (error) {
    console.error('❌ API test hatası:', error.message);
    console.error('Detay:', error);
  }
}

testGeminiAPI();
