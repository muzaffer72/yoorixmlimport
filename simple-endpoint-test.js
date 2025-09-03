// Basit Google GenAI endpoint testi
const { GoogleGenAI } = require('@google/genai');

async function testEndpoint() {
  console.log('🔍 Google GenAI API endpoint analizi...\n');
  
  try {
    // Test API anahtarı ile client oluştur
    const client = new GoogleGenAI({ apiKey: 'test-key' });
    console.log('✅ GoogleGenAI client oluşturuldu');
    
    // Client özelliklerini incele
    console.log('\n📊 Client özellikleri:');
    console.log('- typeof client:', typeof client);
    console.log('- constructor name:', client.constructor.name);
    
    // Mevcut özellikleri listele
    const ownProps = Object.getOwnPropertyNames(client);
    console.log('- Own properties:', ownProps);
    
    // Prototype özelliklerini listele  
    const protoProps = Object.getOwnPropertyNames(Object.getPrototypeOf(client));
    console.log('- Prototype properties:', protoProps);
    
    // Client'ı string olarak yazdır (eğer mümkünse)
    try {
      const clientString = client.toString();
      console.log('- Client string representation:', clientString);
    } catch (e) {
      console.log('- Client toString error:', e.message);
    }
    
    // API çağrısı yapmaya çalış ve hata mesajını incele
    console.log('\n🔍 Test API çağrısı yapılıyor...');
    try {
      await client.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: 'test'
      });
      console.log('✅ API çağrısı başarılı');
    } catch (error) {
      console.log('❌ API çağrısı hatası (beklenen):', error.message);
      
      // Hata mesajından endpoint bilgisini çıkarmaya çalış
      if (error.message.includes('https://')) {
        const urlMatch = error.message.match(/https:\/\/[^\s]+/);
        if (urlMatch) {
          console.log('🎯 Tespit edilen endpoint:', urlMatch[0]);
        }
      }
      
      // Hata mesajında endpoint ipuçları ara
      if (error.message.includes('generativelanguage.googleapis.com')) {
        console.log('🎯 Kullanılan API: Google AI Studio / Generative Language API');
        console.log('🎯 Muhtemel endpoint: https://generativelanguage.googleapis.com/v1beta');
      }
      if (error.message.includes('aiplatform.googleapis.com')) {
        console.log('🎯 Kullanılan API: Google Cloud AI Platform');
        console.log('🎯 Muhtemel endpoint: https://aiplatform.googleapis.com/v1');
      }
    }
    
  } catch (error) {
    console.error('❌ Client oluşturma hatası:', error.message);
  }
}

testEndpoint().catch(console.error);
