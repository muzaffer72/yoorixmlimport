import { GoogleGenerativeAI } from "@google/generative-ai";

export interface GeminiModel {
  name: string;
  displayName: string;
  description?: string;
  supportedGenerationMethods: string[];
}

export class GeminiService {
  private client: GoogleGenerativeAI | null = null;
  
  constructor(apiKey?: string) {
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
    }
  }

  // API anahtarını test et ve mevcut modelleri getir
  async validateApiKeyAndGetModels(apiKey: string): Promise<GeminiModel[]> {
    try {
      const testClient = new GoogleGenerativeAI(apiKey);
      
      // Basit test - bir model ile deneme yap
      const model = testClient.getGenerativeModel({ model: "gemini-1.5-flash" });
      await model.generateContent("Test connection");
      
      // Başarılıysa sabit model listesi döndür (Google API'sında model listeleme endpoint'i yok)
      return [
        {
          name: "gemini-2.0-flash-exp",
          displayName: "Gemini 2.0 Flash (Experimental)",
          description: "En yeni deneysel model",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "gemini-1.5-flash",
          displayName: "Gemini 1.5 Flash",
          description: "Hızlı ve verimli model",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "gemini-1.5-pro",
          displayName: "Gemini 1.5 Pro", 
          description: "Gelişmiş performans modeli",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "gemini-pro",
          displayName: "Gemini Pro",
          description: "Standart performans modeli",
          supportedGenerationMethods: ["generateContent"]
        }
      ];
    } catch (error: any) {
      console.error("Gemini API validation failed:", error);
      
      // Spesifik hata mesajları
      if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('Invalid API key')) {
        throw new Error("Geçersiz API anahtarı");
      } else if (error.message?.includes('QUOTA_EXCEEDED')) {
        throw new Error("API quota aşıldı");
      } else if (error.status === 403) {
        throw new Error("API erişim izni yok");
      } else {
        throw new Error("API bağlantı hatası: " + error.message);
      }
    }
  }

  // AI bağlantısını kontrol et
  async validateConnection(): Promise<string> {
    if (!this.client) {
      throw new Error("Gemini API anahtarı ayarlanmamış");
    }

    try {
      console.log("🔍 Gemini API bağlantısı kontrol ediliyor...");
      const model = this.client.getGenerativeModel({ 
        model: "gemini-1.5-flash"
      });
      
      const result = await model.generateContent("Merhaba, bu bir bağlantı testidir. Kısa yanıt ver.");
      const response = result.response;
      const text = response.text();
      
      console.log("✅ Gemini API bağlantısı başarılı");
      return text;
    } catch (error: any) {
      console.error("❌ Gemini API bağlantısı başarısız:", error);
      throw new Error("API bağlantı hatası: " + error.message);
    }
  }

  // Kategori eşleştirme için Gemini'yi kullan - SADELEŞTIRILMIŞ
  async mapCategoriesWithAI(
    xmlCategories: string[], 
    localCategories: Array<{id: string, name: string}>,
    modelName: string = "gemini-1.5-flash"
  ): Promise<Array<{
    xmlCategory: string;
    suggestedCategory: {id: string, name: string} | null;
    confidence: number;
    reasoning: string;
  }>> {
    if (!this.client) {
      throw new Error("Gemini API anahtarı ayarlanmamış");
    }

    console.log(`🧠 AI Mapping başlıyor: ${xmlCategories.length} XML kategori, ${localCategories.length} yerel kategori`);

    // Batch işleme için ayarlar
    const maxLocalCategories = localCategories.length; // TÜM yerel kategorileri kullan
    const maxXmlCategoriesPerBatch = 20; // Her seferde 20 XML kategorisi işle (API limit için)
    
    const limitedLocalCategories = localCategories.slice(0, maxLocalCategories);
    
    console.log(`📊 Kategori Durumu: ${xmlCategories.length} XML kategori, ${limitedLocalCategories.length} yerel kategori kontrol edilecek`);
    
    // Eğer XML kategori sayısı fazlaysa batch'lere böl
    const xmlBatches = [];
    for (let i = 0; i < xmlCategories.length; i += maxXmlCategoriesPerBatch) {
      xmlBatches.push(xmlCategories.slice(i, i + maxXmlCategoriesPerBatch));
    }
    
    console.log(`🔄 ${xmlBatches.length} batch'te işlenecek (her batch ${maxXmlCategoriesPerBatch} XML kategorisi)`);
    
    let allMappings: Array<{
      xmlCategory: string;
      suggestedCategory: {id: string, name: string} | null;
      confidence: number;
      reasoning: string;
    }> = [];
    
    // Her batch'i işle
    for (let batchIndex = 0; batchIndex < xmlBatches.length; batchIndex++) {
      const batchXmlCategories = xmlBatches[batchIndex];
      console.log(`🔄 Batch ${batchIndex + 1}/${xmlBatches.length} işleniyor: ${batchXmlCategories.length} kategori`);
      
      const batchMappings = await this.processBatchWithRetry(batchXmlCategories, limitedLocalCategories, modelName);
      allMappings = allMappings.concat(batchMappings);
      
      // Batch'ler arası kısa bekleme (API rate limit için)
      if (batchIndex < xmlBatches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`✅ AI Mapping tamamlandı: ${allMappings.length} eşleştirme, ${allMappings.filter((m: any) => m.suggestedCategory).length} başarılı`);
    return allMappings;
  }
  
  // Batch işleme metodu
  // Retry mekanizması ile batch işleme
  private async processBatchWithRetry(
    xmlCategories: string[],
    localCategories: Array<{id: string, name: string}>,
    modelName: string,
    maxRetries: number = 3
  ): Promise<any[]> {
    const availableModels = ["gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Her denemede farklı model kullan
        const currentModel = attempt === 0 ? modelName : availableModels[attempt % availableModels.length];
        console.log(`🔄 Deneme ${attempt + 1}/${maxRetries}, Model: ${currentModel}`);
        
        return await this.processBatch(xmlCategories, localCategories, currentModel);
        
      } catch (error: any) {
        console.error(`❌ Deneme ${attempt + 1} başarısız:`, error.message);
        
        // Kalıcı hatalar için retry yapma
        if (error.message?.includes('API key') || 
            error.message?.includes('API_KEY_INVALID') ||
            error.message?.includes('quota') ||
            error.message?.includes('QUOTA_EXCEEDED') ||
            error.status === 403) {
          console.log("🚫 Kalıcı hata tespit edildi, retry iptal ediliyor");
          throw error;
        }
        
        // 503 (Service Unavailable) ve 429 (Rate Limit) için retry yap
        if (error.status === 503 || error.status === 429 || 
            error.message?.includes('overloaded') || 
            error.message?.includes('rate limit')) {
          console.log("⏳ Geçici hata, retry yapılacak...");
        }
        
        // Son deneme ise hata fırlat
        if (attempt === maxRetries - 1) {
          throw error;
        }
        
        // Bekleme süresi (exponential backoff)
        const waitTime = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s...
        console.log(`⏱️ ${waitTime}ms bekliyor...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    throw new Error("Tüm retry denemeleri başarısız");
  }

  private async processBatch(
    xmlCategories: string[],
    localCategories: Array<{id: string, name: string}>,
    modelName: string
  ): Promise<Array<{
    xmlCategory: string;
    suggestedCategory: {id: string, name: string} | null;
    confidence: number;
    reasoning: string;
  }>> {
    if (!this.client) {
      throw new Error("Gemini API anahtarı ayarlanmamış");
    }

    const prompt = `Sen bir e-ticaret uzmanısın. XML kategorilerini 3500+ yerel kategorilerle eşleştir.

XML Kategorileri (eşleştirilecek):
${xmlCategories.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

Mevcut Yerel Kategoriler (hedef kategoriler - ${localCategories.length} adet):
${localCategories.map((cat, i) => `${i + 1}. ${cat.name} (ID: ${cat.id})`).join('\n')}

JSON formatında yanıt ver:
{
  "mappings": [
    {
      "xmlCategory": "kategori_adı",
      "suggestedCategoryId": "id_veya_null",
      "confidence": 0.9,
      "reasoning": "açıklama"
    }
  ]
}

ÖNEMLİ KURALLAR:
- ÖNCE TAM EŞLEŞME ara: "Havlu" XML kategorisi varsa "Havlu" yerel kategorisini tercih et
- İSİM BENZERLİĞİNE odaklan: "Banyo Askısı" ile "Banyo Askıları" %95+ eşleşir
- KAPSAMLI EŞLEŞTIRME: "Banyo Aksesuarları" → "Aksesuar" yerine daha spesifik kategori varsa onu seç
- 3500+ kategori arasından EN UYGUN olanı seç, genel kategorileri son seçenek olarak kullan
- Confidence'ı gerçekçi belirle: %90+ sadece çok iyi eşleşmeler için
- Uygun yoksa suggestedCategoryId null yap`;

    try {
      const model = this.client.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json"
        }
      });
      
      console.log(`🚀 Batch Gemini API çağrısı: ${xmlCategories.length} XML, ${localCategories.length} yerel kategori`);
      const result = await model.generateContent(prompt);
      const response = result.response;
      let responseText = response.text() || "{}";
      
      console.log("📥 Batch yanıtı alındı:", responseText.substring(0, 200));
      
      // JSON temizleme
      responseText = responseText.trim();
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      }
      if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      let result_parsed;
      try {
        result_parsed = JSON.parse(responseText);
      } catch (parseError) {
        console.error("❌ JSON parse hatası:", parseError);
        console.log("🔧 Ham yanıt:", responseText);
        throw new Error("AI yanıtı JSON formatında değil");
      }
      
      // Sonuçları dönüştür
      const mappings = (result_parsed.mappings || []).map((mapping: any) => {
        const suggestedCategory = mapping.suggestedCategoryId 
          ? localCategories.find(cat => cat.id === mapping.suggestedCategoryId) || null
          : null;

        return {
          xmlCategory: mapping.xmlCategory || "",
          suggestedCategory,
          confidence: Math.min(Math.max(mapping.confidence || 0, 0), 1),
          reasoning: (mapping.reasoning || "Açıklama yok").substring(0, 200)
        };
      });
      
      console.log(`✅ Batch tamamlandı: ${mappings.length} eşleştirme, ${mappings.filter((m: any) => m.suggestedCategory).length} başarılı`);
      return mappings;

    } catch (error: any) {
      console.error("❌ Batch Gemini API hatası:", error);
      
      // Spesifik hata tiplerini kontrol et
      if (error.message?.includes('API key') || error.message?.includes('API_KEY_INVALID')) {
        throw new Error("Geçersiz Gemini API anahtarı");
      } else if (error.message?.includes('quota') || error.message?.includes('QUOTA_EXCEEDED')) {
        throw new Error("Gemini API quota aşıldı");
      } else if (error.status === 403) {
        throw new Error("Gemini API erişim izni yok");
      } else {
        throw new Error("AI eşleştirme hatası: " + error.message);
      }
    }
  }

  // Basit text generation
  async generateText(
    prompt: string,
    modelName: string = "gemini-1.5-flash"
  ): Promise<string> {
    if (!this.client) {
      throw new Error("Gemini API anahtarı ayarlanmamış");
    }

    try {
      const model = this.client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = result.response;
      return response.text() || "";
    } catch (error: any) {
      console.error("Gemini generateText error:", error);
      throw new Error("Text generation hatası: " + error.message);
    }
  }

  // Ürün açıklama optimizasyonu
  async optimizeShortDescription(
    productName: string,
    originalDescription: string,
    modelName: string = "gemini-1.5-flash"
  ): Promise<string> {
    const prompt = `
Ürün: ${productName}
Orijinal Açıklama: ${originalDescription}

Bu ürün için kısa, etkileyici ve SEO dostu bir açıklama yaz (maksimum 150 karakter):
`;
    return this.generateText(prompt, modelName);
  }

  // Uzun açıklama optimizasyonu
  async optimizeFullDescription(
    productName: string,
    shortDescription: string,
    originalDescription: string,
    modelName: string = "gemini-1.5-flash"
  ): Promise<string> {
    const prompt = `
Ürün: ${productName}
Kısa Açıklama: ${shortDescription}
Orijinal Açıklama: ${originalDescription}

Bu ürün için detaylı, profesyonel ve satışa yönelik uzun açıklama yaz:
`;
    return this.generateText(prompt, modelName);
  }
}
