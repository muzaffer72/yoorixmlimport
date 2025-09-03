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

    // Çok fazla kategori varsa sınırla
    const maxLocalCategories = 100; // En fazla 100 yerel kategori
    const maxXmlCategories = 10;    // En fazla 10 XML kategori bir seferde
    
    const limitedLocalCategories = localCategories.slice(0, maxLocalCategories);
    const limitedXmlCategories = xmlCategories.slice(0, maxXmlCategories);
    
    if (localCategories.length > maxLocalCategories) {
      console.log(`⚠️ Yerel kategoriler ${localCategories.length} -> ${limitedLocalCategories.length} sınırlandı`);
    }
    
    if (xmlCategories.length > maxXmlCategories) {
      console.log(`⚠️ XML kategoriler ${xmlCategories.length} -> ${limitedXmlCategories.length} sınırlandı`);
    }

    const prompt = `Sen bir e-ticaret uzmanısın. XML kategorilerini yerel kategorilerle eşleştir.

XML Kategorileri:
${limitedXmlCategories.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

Yerel Kategoriler:
${limitedLocalCategories.map((cat, i) => `${i + 1}. ${cat.name} (ID: ${cat.id})`).join('\n')}

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

KURALLAR:
- Anlam benzerliğine odaklan
- "Fantazi Sütyen" -> "İç Giyim" gibi eşleştirmeleri yap
- Belirsizse confidence'ı düşük tut
- Uygun yoksa suggestedCategoryId null yap`;

    try {
      const model = this.client.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json"
        }
      });
      
      console.log("🚀 Gemini API çağrısı yapılıyor...");
      const result = await model.generateContent(prompt);
      const response = result.response;
      let responseText = response.text() || "{}";
      
      console.log("📥 Gemini yanıtı alındı:", responseText.substring(0, 200));
      
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
          ? limitedLocalCategories.find(cat => cat.id === mapping.suggestedCategoryId) || null
          : null;

        return {
          xmlCategory: mapping.xmlCategory || "",
          suggestedCategory,
          confidence: Math.min(Math.max(mapping.confidence || 0, 0), 1),
          reasoning: (mapping.reasoning || "Açıklama yok").substring(0, 200)
        };
      });
      
      console.log(`✅ AI Mapping tamamlandı: ${mappings.length} eşleştirme, ${mappings.filter((m: any) => m.suggestedCategory).length} başarılı`);
      return mappings;

    } catch (error: any) {
      console.error("❌ Gemini API hatası detayı:", {
        name: error.name,
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        stack: error.stack?.substring(0, 300)
      });
      
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
