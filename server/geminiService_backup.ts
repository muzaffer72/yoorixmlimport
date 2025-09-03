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
            name: "gemini-2.5-flash-lite",
            displayName: "Gemini 2.5 Flash Lite",
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
    "name": "gemma-3-1b",
    "displayName": "Gemma 3 1B",
    "description": "Yüksek hız ve verimlilik için optimize edilmiş en küçük Gemma modeli.",
    "supportedGenerationMethods": ["generateContent"]
  },
  {
    "name": "gemma-3-4b",
    "displayName": "Gemma 3 4B",
    "description": "Hız ve performansı dengeleyen, yerel cihazlarda çalışmak üzere tasarlanmış model.",
    "supportedGenerationMethods": ["generateContent"]
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

    // Çok fazla kategori varsa parçalara böl (Gemini limitleri için)
    const maxCategoriesPerRequest = 50; // AI'yi boğmamak için sınırla
    const maxXmlCategoriesPerRequest = 20; // XML kategorilerini de sınırla
    
    console.log(`🔍 AI Mapping: ${xmlCategories.length} XML kategorisi, ${localCategories.length} yerel kategori`);
    
    // XML kategorilerini parçalara böl
    const xmlChunks = [];
    for (let i = 0; i < xmlCategories.length; i += maxXmlCategoriesPerRequest) {
      xmlChunks.push(xmlCategories.slice(i, i + maxXmlCategoriesPerRequest));
    }
    
    // Yerel kategorileri sınırla (en yaygın olanları önce)
    const limitedLocalCategories = localCategories.slice(0, maxCategoriesPerRequest);
    if (localCategories.length > maxCategoriesPerRequest) {
      console.log(`⚠️ Yerel kategoriler ${localCategories.length} -> ${limitedLocalCategories.length} sınırlandı`);
    }
    
    const allMappings = [];
    
    // Her XML chunk'ını işle
    for (let chunkIndex = 0; chunkIndex < xmlChunks.length; chunkIndex++) {
      const xmlChunk = xmlChunks[chunkIndex];
      console.log(`🧩 Chunk ${chunkIndex + 1}/${xmlChunks.length}: ${xmlChunk.length} XML kategorisi işleniyor`);

      const prompt = `
Sen bir e-ticaret kategori uzmanısın. XML'den gelen kategori isimlerini mevcut yerel kategorilerle eşleştirmen gerekiyor.

XML Kategorileri (Bu Chunk):
${xmlChunk.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

Mevcut Yerel Kategoriler:
${limitedLocalCategories.map((cat, i) => `${i + 1}. ${cat.name} (ID: ${cat.id})`).join('\n')}

Her XML kategorisi için:
1. En uygun yerel kategoriyi bul
2. Eşleştirme güven skorunu (0-1 arası) belirle
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
        const model = this.client.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json"
          }
        });
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let responseText = response.text() || "{}";
        
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
        
        let result_parsed;
        try {
          result_parsed = JSON.parse(responseText);
        } catch (parseError) {
          console.error("JSON parse error, attempting to fix:", parseError);
          // Son çare: JSON'u manuel olarak düzelt
          responseText = responseText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
          result_parsed = JSON.parse(responseText);
        }
        
        // Sonuçları dönüştür
        const chunkMappings = (result_parsed.mappings || []).slice(0, 50).map((mapping: any) => {
          const suggestedCategory = mapping.suggestedCategoryId 
            ? limitedLocalCategories.find(cat => cat.id === mapping.suggestedCategoryId) || null
            : null;

          return {
            xmlCategory: mapping.xmlCategory || "",
            suggestedCategory,
            confidence: Math.min(Math.max(mapping.confidence || 0, 0), 1), // 0-1 arası sınırla
            reasoning: (mapping.reasoning || "Açıklama yok").substring(0, 200) // Uzun açıklamaları kısalt
          };
        });
        
        allMappings.push(...chunkMappings);
        
        // Rate limit için kısa bekleme
        if (chunkIndex < xmlChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 saniye bekle
        }
        
      } catch (chunkError: any) {
        console.error(`❌ Chunk ${chunkIndex + 1} AI işleme hatası:`, chunkError.message);
        // Chunk başarısız olursa o chunk'ı null confidence ile ekle
        const fallbackMappings = xmlChunk.map(xmlCategory => ({
          xmlCategory,
          suggestedCategory: null,
          confidence: 0,
          reasoning: `AI işleme hatası: ${chunkError.message}`
        }));
        allMappings.push(...fallbackMappings);
      }
    }

    console.log(`✅ AI Mapping tamamlandı: ${allMappings.length} toplam eşleştirme`);
    return allMappings;

    } catch (error: any) {
      console.error("Gemini API error:", error);
      throw new Error("Yapay zeka eşleştirme sırasında hata oluştu: " + error.message);
    }
  }
        responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Bozuk string'leri düzelt
      responseText = responseText.replace(/\\n/g, '\\\\n');
      responseText = responseText.replace(/\n/g, '\\n');
      responseText = responseText.replace(/\r/g, '\\r');
      responseText = responseText.replace(/\t/g, '\\t');
      
      let result_parsed;
      try {
        result_parsed = JSON.parse(responseText);
      } catch (parseError) {
        console.error("JSON parse error, attempting to fix:", parseError);
        // Son çare: JSON'u manuel olarak düzelt
        responseText = responseText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        result_parsed = JSON.parse(responseText);
      }
      
      // Sonuçları dönüştür
      const mappings = (result_parsed.mappings || []).slice(0, 50).map((mapping: any) => {
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

  // Metin üretimi için genel method
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
      const response = await result.response;
      const text = response.text();
      
      return text || "";
    } catch (error: any) {
      console.error("Gemini generateText error:", error);
      throw new Error("Metin üretimi sırasında hata oluştu: " + error.message);
    }
  }

  // Kısa açıklama için AI optimize et
  async optimizeShortDescription(
    productName: string,
    originalDescription: string,
    modelName: string = "gemini-1.5-flash"
  ): Promise<string> {
    if (!this.client) {
      throw new Error("Gemini API anahtarı ayarlanmamış");
    }

    const prompt = `Sen bir e-ticaret metni uzmanısın. Aşağıdaki ürün için kısa açıklama optimize et:

Ürün Adı: "${productName}"
Orijinal Açıklama: "${originalDescription}"

Göreverin:
1. Maksimum 200 karakterlik kısa açıklama yaz
2. SEO dostu ve çekici olsun
3. Ürünün temel özelliklerini vurgula
4. HTML tag kullanma
5. Müşterilerin dikkatini çekecek şekilde yaz
6. Türkçe dilbilgisi kurallarına uygun olsun
7. Gereksiz kelimeler ekleme, sadece mevcut bilgileri optimize et

Optimizasyon kuralları:
- Ana özellikleri ön plana çıkar
- Faydaları vurgula
- Kısa ve net cümleler kullan
- Aksiyon odaklı kelimeler ekle

Optimize edilmiş kısa açıklama:`;

    try {
      const response = await this.generateText(prompt, modelName);
      const optimized = response.trim();
      
      // 200 karakterden uzunsa kısalt
      if (optimized.length > 200) {
        return optimized.substring(0, 197) + "...";
      }
      
      return optimized;
    } catch (error: any) {
      console.error("Short description optimization error:", error);
      throw error;
    }
  }

  // Tam açıklama için AI optimize et
  async optimizeFullDescription(
    productName: string,
    originalDescription: string,
    modelName: string = "gemini-1.5-flash"
  ): Promise<string> {
    if (!this.client) {
      throw new Error("Gemini API anahtarı ayarlanmamış");
    }

    const prompt = `Sen bir e-ticaret içerik uzmanısın. Aşağıdaki ürün için tam açıklamayı optimize et:

Ürün Adı: "${productName}"
Orijinal Açıklama: "${originalDescription}"

Göreverin:
1. SEO dostu ve kapsamlı açıklama yaz
2. Ürün özelliklerini detaylıca açıkla
3. Kullanım alanlarını belirt
4. Müşteri faydalarını vurgula
5. HTML formatında düzenle (p, ul, li, strong, em etiketleri kullan)
6. Başlıklar ve alt başlıklar ekle
7. Gereksiz bilgi ekleme, mevcut bilgileri genişlet ve düzenle
8. Türkçe dilbilgisi kurallarına uygun olsun

Optimizasyon kuralları:
- Özellikleri liste halinde sun
- Faydaları vurgula
- Teknik detayları açıkla
- Kullanım senaryoları ekle
- SEO anahtar kelimeler ekle
- Okunabilir paragraflar oluştur

Optimize edilmiş tam açıklama:`;

    try {
      const response = await this.generateText(prompt, modelName);
      return response.trim();
    } catch (error: any) {
      console.error("Full description optimization error:", error);
      throw error;
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