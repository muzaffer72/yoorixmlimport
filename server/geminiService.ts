import { GoogleGenAI } from "@google/genai";

export interface GeminiModel {
  name: string;
  displayName: string;
  description?: string;
  supportedGenerationMethods: string[];
}

export class GeminiService {
  private client: GoogleGenAI | null = null;
  
  constructor(apiKey?: string) {
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  // API anahtarını test et ve mevcut modelleri getir
  async testApiKeyAndGetModels(apiKey: string): Promise<GeminiModel[]> {
    try {
      const testClient = new GoogleGenAI({ apiKey });
      
      // Gerçek API'den model listesini al
      let availableModels: GeminiModel[] = [];
      
      try {
        // API'den model listesini getir - farklı yöntemler dene
        let modelList;
        
        try {
          modelList = await testClient.models.list();
        } catch (e) {
          // Alternatif yöntem
          try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (response.ok) {
              const data = await response.json();
              modelList = data.models;
            }
          } catch (fetchError) {
            console.log("Fetch ile model listesi alınamadı:", fetchError);
          }
        }
        
        if (modelList && Array.isArray(modelList)) {
          availableModels = modelList
            .filter((model: any) => {
              // Sadece generateContent destekleyen modelleri al
              const methods = model.supportedGenerationMethods || [];
              return methods.includes('generateContent');
            })
            .map((model: any) => ({
              name: model.name?.replace('models/', '') || model,
              displayName: model.displayName || model.name?.replace('models/', '') || model,
              description: model.description || "",
              supportedGenerationMethods: model.supportedGenerationMethods || ["generateContent"]
            }));
        }
      } catch (listError: any) {
        console.log("Model listesi alınamadı, varsayılan modeller kullanılıyor:", listError.message);
      }

      // Eğer API'den model listesi alınamadıysa, en güncel varsayılan modelleri kullan
      if (availableModels.length === 0) {
        availableModels = [
          {
            name: "gemini-2.0-flash-exp",
            displayName: "Gemini 2.0 Flash (Experimental)",
            description: "En yeni ve hızlı model",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "gemini-1.5-pro-latest",
            displayName: "Gemini 1.5 Pro (Latest)",
            description: "En güncel Pro model",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "gemini-1.5-pro",
            displayName: "Gemini 1.5 Pro", 
            description: "Gelişmiş analiz için optimize edilmiş",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "gemini-1.5-flash-latest",
            displayName: "Gemini 1.5 Flash (Latest)",
            description: "En güncel Flash model",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "gemini-1.5-flash",
            displayName: "Gemini 1.5 Flash",
            description: "Hızlı ve verimli model",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "gemini-1.5-flash-8b",
            displayName: "Gemini 1.5 Flash 8B",
            description: "Küçük ve hızlı model",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "gemini-1.0-pro-latest",
            displayName: "Gemini 1.0 Pro (Latest)",
            description: "En güncel 1.0 Pro model",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "gemini-1.0-pro",
            displayName: "Gemini 1.0 Pro",
            description: "Stabil ve güvenilir model",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "gemini-pro",
            displayName: "Gemini Pro",
            description: "Genel amaçlı model",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "gemini-pro-vision",
            displayName: "Gemini Pro Vision",
            description: "Görsel analiz destekli model",
            supportedGenerationMethods: ["generateContent"]
          }
        ];
      }

      // API anahtarını test etmek için basit bir çağrı yapalım
      try {
        await testClient.models.generateContent({
          model: availableModels[0]?.name || "gemini-1.5-flash",
          contents: "Test"
        });
      } catch (error: any) {
        // API anahtarı geçersizse hata fırlat
        if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("401") || error.message?.includes("403")) {
          throw new Error("Geçersiz API anahtarı");
        }
        // Diğer hatalar için (rate limit vs.) modelleri yine de döndür
      }

      return availableModels;
    } catch (error: any) {
      if (error.message === "Geçersiz API anahtarı") {
        throw error;
      }
      throw new Error("API anahtarı test edilirken hata oluştu: " + error.message);
    }
  }

  // Kategori eşleştirme için Gemini'yi kullan
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

    const prompt = `
Sen bir e-ticaret kategori uzmanısın. XML'den gelen kategori isimlerini mevcut yerel kategorilerle eşleştirmen gerekiyor.

XML Kategorileri:
${xmlCategories.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

Mevcut Yerel Kategoriler:
${localCategories.map((cat, i) => `${i + 1}. ${cat.name} (ID: ${cat.id})`).join('\n')}

Her XML kategorisi için:
1. En uygun yerel kategoriyi bul
2. Eşleştirme güven skorunu (0-1 arası) belirle
3. Eşleştirme nedenini açıkla

Lütfen şu JSON formatında yanıt ver:
{
  "mappings": [
    {
      "xmlCategory": "XML kategori adı",
      "suggestedCategoryId": "yerel_kategori_id veya null",
      "confidence": 0.95,
      "reasoning": "Eşleştirme nedeni"
    }
  ]
}

Önemli kurallar:
- Sadece çok emin olduğun eşleştirmeler için yüksek confidence ver
- Belirsiz durumlar için düşük confidence kullan
- Hiç uygun kategori yoksa suggestedCategoryId'yi null yap
- Türkçe karakter uyumluluğunu dikkate al
- Anlam benzerliğine odaklan, tam kelime eşleşmesi aramaya gerek yok
`;

    try {
      const response = await this.client.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      let responseText = response.text || "{}";
      
      // JSON temizleme - bazen Gemini ekstra karakterler ekliyor
      responseText = responseText.trim();
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      }
      if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Bozuk string'leri düzelt
      responseText = responseText.replace(/\\n/g, '\\\\n');
      responseText = responseText.replace(/\n/g, '\\n');
      responseText = responseText.replace(/\r/g, '\\r');
      responseText = responseText.replace(/\t/g, '\\t');
      
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error("JSON parse error, attempting to fix:", parseError);
        // Son çare: JSON'u manuel olarak düzelt
        responseText = responseText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        result = JSON.parse(responseText);
      }
      
      // Sonuçları dönüştür
      const mappings = (result.mappings || []).slice(0, 50).map((mapping: any) => {
        const suggestedCategory = mapping.suggestedCategoryId 
          ? localCategories.find(cat => cat.id === mapping.suggestedCategoryId) || null
          : null;

        return {
          xmlCategory: mapping.xmlCategory || "",
          suggestedCategory,
          confidence: Math.min(Math.max(mapping.confidence || 0, 0), 1), // 0-1 arası sınırla
          reasoning: (mapping.reasoning || "Açıklama yok").substring(0, 200) // Uzun açıklamaları kısalt
        };
      });

      return mappings;
    } catch (error: any) {
      console.error("Gemini API error:", error);
      throw new Error("Yapay zeka eşleştirme sırasında hata oluştu: " + error.message);
    }
  }
}

// Global instance
let geminiService: GeminiService | null = null;

export function getGeminiService(): GeminiService {
  if (!geminiService) {
    const apiKey = process.env.GEMINI_API_KEY;
    geminiService = new GeminiService(apiKey);
  }
  return geminiService;
}

export function updateGeminiService(apiKey: string): GeminiService {
  geminiService = new GeminiService(apiKey);
  return geminiService;
}