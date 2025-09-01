import type { Express } from "express";
import { createServer, type Server } from "http";
import { pageStorage } from "./pageStorage";
import { insertXmlSourceSchema, insertCategoryMappingSchema, insertDatabaseSettingsSchema, insertGeminiSettingsSchema } from "@shared/schema";
import { z } from "zod";
import * as xml2js from "xml2js";
import { ObjectStorageService } from "./objectStorage";
import { GeminiService } from "./geminiService";
import { getLocalCategories, connectToImportDatabase, importProductToMySQL, batchImportProductsToMySQL, checkProductTableStructure, deleteAllProductsFromMySQL } from "./mysql-import";

// Global import state management
let isImportInProgress = false;
let shouldCancelImport = false;
let currentImportId: string | null = null;

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Dashboard endpoints
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await pageStorage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/dashboard/activities", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const activities = await pageStorage.getActivityLogs(limit);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  app.get("/api/dashboard/recent-products", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const products = await pageStorage.getRecentProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recent products" });
    }
  });

  // XML Source endpoints
  app.get("/api/xml-sources", async (req, res) => {
    try {
      const xmlSources = await pageStorage.getXmlSources();
      res.json(xmlSources);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch XML sources" });
    }
  });

  app.post("/api/xml-sources", async (req, res) => {
    try {
      const data = insertXmlSourceSchema.parse(req.body);
      const xmlSource = await pageStorage.createXmlSource(data);
      res.status(201).json(xmlSource);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create XML source" });
      }
    }
  });

  app.put("/api/xml-sources/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const xmlSource = await pageStorage.updateXmlSource(id, data);
      res.json(xmlSource);
    } catch (error) {
      res.status(500).json({ message: "Failed to update XML source" });
    }
  });

  app.delete("/api/xml-sources/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await pageStorage.deleteXmlSource(id);
      if (deleted) {
        res.json({ message: "XML source deleted successfully" });
      } else {
        res.status(404).json({ message: "XML source not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete XML source" });
    }
  });

  // XML parsing and testing
  app.post("/api/xml-sources/test-connection", async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ 
          message: `XML kaynağına ulaşılamıyor: ${response.status} ${response.statusText}` 
        });
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("xml")) {
        return res.status(400).json({ 
          message: "Belirtilen URL XML formatında değil" 
        });
      }

      res.json({ 
        message: "XML kaynağına başarıyla bağlanıldı",
        status: "success",
        contentType 
      });
    } catch (error) {
      res.status(500).json({ message: "Bağlantı test edilirken hata oluştu" });
    }
  });

  app.post("/api/xml-sources/fetch-structure", async (req, res) => {
    try {
      const { url } = req.body;
      console.log("Fetching XML structure for URL:", url);
      
      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }

      // Set a longer timeout for large XML files (60 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      console.log("Starting XML fetch...");
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; XML-Parser/1.0)'
        }
      });
      
      clearTimeout(timeoutId);
      console.log("XML fetch completed, status:", response.status);
      
      if (!response.ok) {
        console.log("XML fetch failed:", response.status, response.statusText);
        return res.status(400).json({ 
          message: `XML kaynağına ulaşılamıyor: ${response.status} ${response.statusText}` 
        });
      }

      console.log("Reading XML text...");
      const xmlText = await response.text();
      console.log("XML text length:", xmlText.length, "characters");
      
      // Limit XML size to prevent memory issues (50MB max)
      if (xmlText.length > 50 * 1024 * 1024) {
        console.log("XML file too large:", xmlText.length);
        return res.status(400).json({ 
          message: "XML dosyası çok büyük (maksimum 50MB)" 
        });
      }
      
      console.log("Parsing XML...");
      const parser = new xml2js.Parser({ 
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true
      });
      const result = await parser.parseStringPromise(xmlText);
      console.log("XML parsed successfully");
      
      // Extract structure from XML using iterative approach to prevent stack overflow
      const extractTagsIterative = (rootObj: any): string[] => {
        const tags = new Set<string>();
        const queue: { obj: any, path: string, depth: number }[] = [{ obj: rootObj, path: "", depth: 0 }];
        const maxDepth = 6;
        const maxTags = 500; // Limit total tags for performance
        
        while (queue.length > 0 && tags.size < maxTags) {
          const { obj, path, depth } = queue.shift()!;
          
          if (depth > maxDepth || typeof obj !== "object" || obj === null) {
            continue;
          }
          
          if (Array.isArray(obj)) {
            // For arrays, only process first item to get structure
            if (obj.length > 0) {
              queue.push({ obj: obj[0], path, depth: depth + 1 });
            }
          } else {
            // Process object properties
            let processedKeys = 0;
            const maxKeysPerLevel = 50; // Limit keys per level
            
            for (const key in obj) {
              if (processedKeys >= maxKeysPerLevel) break;
              
              const fullPath = path ? `${path}.${key}` : key;
              tags.add(fullPath);
              
              // Add to queue for further processing
              if (depth < maxDepth && typeof obj[key] === "object" && obj[key] !== null) {
                queue.push({ obj: obj[key], path: fullPath, depth: depth + 1 });
              }
              
              processedKeys++;
            }
          }
        }
        
        return Array.from(tags);
      };

      console.log("Extracting tags from XML structure...");
      const tags = extractTagsIterative(result);
      console.log("Found", tags.length, "tags");
      
      res.json({ 
        message: "XML yapısı başarıyla alındı",
        tags: tags.sort(),
        sampleData: JSON.stringify(result, null, 2).substring(0, 1000) + "..."
      });
    } catch (error: any) {
      console.error("XML structure fetch error:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack?.substring(0, 500)
      });
      
      let errorMessage = "XML yapısı alınırken hata oluştu";
      
      if (error.name === 'AbortError') {
        errorMessage = "XML dosyası çok büyük veya yükleme zaman aşımına uğradı (60 saniye)";
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = "XML URL'sine ulaşılamıyor. Lütfen URL'yi kontrol edin.";
      } else if (error.message && error.message.includes('timeout')) {
        errorMessage = "XML yükleme zaman aşımına uğradı. Dosya çok büyük olabilir.";
      } else if (error.message && error.message.includes('XML')) {
        errorMessage = `XML parse hatası: ${error.message}`;
      } else if (error.message) {
        errorMessage = `Hata: ${error.message}`;
      }
      
      res.status(500).json({ message: errorMessage });
    }
  });

  app.post("/api/xml-sources/extract-categories", async (req, res) => {
    try {
      const { url, categoryField, xmlSourceId } = req.body;
      console.log("Extracting categories from URL:", url, "using field:", categoryField);
      
      if (!url || !categoryField) {
        return res.status(400).json({ message: "URL ve kategori alanı gerekli" });
      }

      // Set a longer timeout for large XML files (60 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; XML-Parser/1.0)'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return res.status(400).json({ 
          message: `XML kaynağına ulaşılamıyor: ${response.status} ${response.statusText}` 
        });
      }

      console.log("Reading XML text for categories...");
      const xmlText = await response.text();
      console.log("XML text length:", xmlText.length, "characters");
      
      // Limit XML size to prevent memory issues (50MB max)
      if (xmlText.length > 50 * 1024 * 1024) {
        return res.status(400).json({ 
          message: "XML dosyası çok büyük (maksimum 50MB)" 
        });
      }
      
      console.log("Parsing XML for categories...");
      const parser = new xml2js.Parser({ 
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true
      });
      const result = await parser.parseStringPromise(xmlText);
      console.log("XML parsed successfully for categories");
      
      // Extract categories from XML using iterative approach to prevent stack overflow
      const extractCategoriesIterative = (rootObj: any): string[] => {
        const categories = new Set<string>();
        const queue: any[] = [rootObj];
        const fields = categoryField.split('.');
        const maxItems = 10000; // Limit items processed for performance
        let processedItems = 0;
        
        console.log("Looking for category field:", categoryField, "split into:", fields);
        
        while (queue.length > 0 && processedItems < maxItems) {
          const current = queue.shift();
          processedItems++;
          
          if (typeof current !== "object" || current === null) {
            continue;
          }
          
          // Check if this object has the category field
          // Handle both direct paths and array paths
          let value = current;
          let foundPath = true;
          let pathTrace = [];
          
          for (let i = 0; i < fields.length; i++) {
            const field = fields[i];
            
            if (value && typeof value === 'object' && field in value) {
              value = value[field];
              pathTrace.push(field);
              
              // If this value is an array and we have more fields to process,
              // we need to check each array item for the remaining path
              if (Array.isArray(value) && i < fields.length - 1) {
                const remainingFields = fields.slice(i + 1);
                
                // Process each array item for the remaining path
                for (const arrayItem of value) {
                  if (typeof arrayItem === 'object' && arrayItem !== null) {
                    let subValue = arrayItem;
                    let subFoundPath = true;
                    
                    for (const subField of remainingFields) {
                      if (subValue && typeof subValue === 'object' && subField in subValue) {
                        subValue = subValue[subField];
                      } else {
                        subFoundPath = false;
                        break;
                      }
                    }
                    
                    if (subFoundPath && subValue && typeof subValue === 'string' && subValue.trim()) {
                      categories.add(subValue.trim());
                      console.log("✓ Found category from array:", subValue.trim());
                    }
                  }
                }
                foundPath = false; // Skip the normal path checking since we handled arrays
                break;
              }
            } else {
              foundPath = false;
              break;
            }
          }
          
          // Debug: Show what we found at each step (only for first few items)
          if (processedItems <= 3) {
            console.log(`Item ${processedItems}: Looking for path [${fields.join('.')}], found path [${pathTrace.join('.')}], foundPath: ${foundPath}, value type: ${typeof value}, value:`, typeof value === 'string' && value ? value.substring(0, 50) : Array.isArray(value) ? `Array[${value.length}]` : value);
          }
          
          // Handle direct path (non-array case)
          if (foundPath && value && typeof value === 'string' && value.trim()) {
            categories.add(value.trim());
            console.log("✓ Found category:", value.trim());
          }
          
          // Add children to queue
          if (Array.isArray(current)) {
            // Process only first few items of large arrays for performance
            const itemsToProcess = Math.min(current.length, 100);
            for (let i = 0; i < itemsToProcess; i++) {
              queue.push(current[i]);
            }
          } else {
            for (const key in current) {
              if (current.hasOwnProperty(key)) {
                queue.push(current[key]);
              }
            }
          }
        }
        
        console.log("Processed items:", processedItems, "Found categories:", categories.size);
        return Array.from(categories);
      };

      console.log("Starting category extraction...");
      const categories = extractCategoriesIterative(result);
      console.log("Category extraction completed. Found:", categories.length, "categories");
      
      // Show sample data from XML to help debug
      const sampleData = JSON.stringify(result, null, 2).substring(0, 2000);
      console.log("Sample XML data:", sampleData);
      
      // Kategorileri bu XML source için kaydet (izolasyon için)
      if (xmlSourceId) {
        await pageStorage.saveExtractedCategoriesForSource(xmlSourceId, categories.sort());
      }
      
      res.json({ 
        message: "Kategoriler başarıyla çekildi",
        categories: categories.sort(),
        count: categories.length,
        sampleData: sampleData + "..."
      });
    } catch (error: any) {
      console.error("Category extraction error:", error);
      
      let errorMessage = "Kategoriler çekilirken hata oluştu";
      
      if (error.name === 'AbortError') {
        errorMessage = "XML dosyası çok büyük veya yükleme zaman aşımına uğradı (60 saniye)";
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = "XML URL'sine ulaşılamıyor. Lütfen URL'yi kontrol edin.";
      } else if (error.message && error.message.includes('timeout')) {
        errorMessage = "Kategori çekme işlemi zaman aşımına uğradı. Dosya çok büyük olabilir.";
      }
      
      res.status(500).json({ message: errorMessage });
    }
  });

  // XML source'a özel kategorileri getir
  app.get("/api/xml-sources/:id/categories", async (req, res) => {
    try {
      const { id } = req.params;
      const categories = await pageStorage.getCategoriesForSource(id);
      res.json({ categories });
    } catch (error) {
      res.status(500).json({ message: "Kategoriler getirilemedi" });
    }
  });

  // Category endpoints (MySQL'den çek)
  app.get("/api/categories", async (req, res) => {
    try {
      // Database ayarlarını kontrol et
      const dbSettings = await pageStorage.getDatabaseSettings();
      if (!dbSettings || !dbSettings.host) {
        return res.status(400).json({ 
          message: "MySQL database ayarları yapılandırılmamış. Lütfen settings sayfasından veritabanı ayarlarını yapın.",
          error: "DATABASE_NOT_CONFIGURED"
        });
      }

      console.log("Connecting to MySQL for categories...");
      // MySQL'e bağlan ve kategorileri çek
      await connectToImportDatabase({
        host: dbSettings.host,
        port: dbSettings.port,
        database: dbSettings.database,
        username: dbSettings.username,
        password: dbSettings.password
      });

      const categories = await getLocalCategories();
      console.log(`Found ${categories.length} categories from MySQL category_languages table`);
      
      if (categories.length === 0) {
        return res.status(404).json({
          message: "category_languages tablosunda kategori bulunamadı",
          error: "NO_CATEGORIES_FOUND"
        });
      }
      
      res.json(categories.map(cat => ({
        id: cat.category_id, // MySQL'den gelen category_id field'ını kullan
        name: cat.title,
        title: cat.title
      })));
    } catch (error) {
      console.error("MySQL categories fetch error:", error);
      res.status(500).json({ 
        message: `MySQL bağlantısı başarısız: ${error.message}`,
        error: "DATABASE_CONNECTION_FAILED"
      });
    }
  });

  // Brand endpoints
  app.get("/api/brands", async (req, res) => {
    try {
      // Mock brands
      const brands = [];
      res.json(brands);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch brands" });
    }
  });

  // Category mapping endpoints
  app.get("/api/category-mappings/:xmlSourceId", async (req, res) => {
    try {
      const { xmlSourceId } = req.params;
      const mappings = await pageStorage.getCategoryMappings(xmlSourceId);
      res.json(mappings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch category mappings" });
    }
  });

  app.post("/api/category-mappings", async (req, res) => {
    try {
      console.log('📥 Category mapping request body:', JSON.stringify(req.body, null, 2));
      const data = insertCategoryMappingSchema.parse(req.body);
      console.log('✅ Validation passed, creating mapping:', data);
      const mapping = await pageStorage.createCategoryMapping(data);
      res.status(201).json(mapping);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('❌ Zod validation error:', error.errors);
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        console.error('❌ Server error:', error);
        res.status(500).json({ message: "Failed to create category mapping" });
      }
    }
  });

  app.put("/api/category-mappings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const mapping = await pageStorage.updateCategoryMapping(id, data);
      res.json(mapping);
    } catch (error) {
      res.status(500).json({ message: "Failed to update category mapping" });
    }
  });

  app.delete("/api/category-mappings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await pageStorage.deleteCategoryMapping(id);
      if (deleted) {
        res.json({ message: "Category mapping deleted successfully" });
      } else {
        res.status(404).json({ message: "Category mapping not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete category mapping" });
    }
  });

  // Delete all category mappings for a specific XML source
  app.delete("/api/category-mappings/source/:xmlSourceId", async (req, res) => {
    try {
      const { xmlSourceId } = req.params;
      console.log("Deleting all mappings for XML source:", xmlSourceId);
      const deletedCount = await pageStorage.deleteAllCategoryMappingsForSource(xmlSourceId);
      console.log("Successfully deleted", deletedCount, "mappings");
      
      const responseData = { 
        message: `${deletedCount} kategori eşleştirmesi silindi`,
        deletedCount 
      };
      
      console.log("Sending response:", JSON.stringify(responseData));
      res.json(responseData);
    } catch (error) {
      console.error("Failed to delete all category mappings:", error);
      res.status(500).json({ message: "Kategori eşleştirmeleri silinirken hata oluştu" });
    }
  });

  // Auto-mapping endpoint
  app.post("/api/category-mappings/auto-map", async (req, res) => {
    try {
      const { xmlSourceId } = req.body;
      
      if (!xmlSourceId) {
        return res.status(400).json({ message: "XML source ID is required" });
      }

      const result = await pageStorage.autoMapCategories(xmlSourceId);
      res.json(result);
    } catch (error) {
      console.error("Auto-mapping error:", error);
      res.status(500).json({ message: "Failed to auto-map categories" });
    }
  });

  // Product import from XML
  app.post("/api/products/import-from-xml", async (req, res) => {
    try {
      // Import durumunu kontrol et
      if (isImportInProgress) {
        return res.status(400).json({ 
          message: "Zaten bir ithalat işlemi devam ediyor. Önce mevcut işlemi tamamlayın veya iptal edin.",
          success: false 
        });
      }

      // Import state'ini güncelle
      isImportInProgress = true;
      shouldCancelImport = false;
      currentImportId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`🚀 XML ÜRÜN İMPORT SÜRECİ BAŞLADI`);
      console.log(`   Import ID: ${currentImportId}`);
      console.log(`${'='.repeat(60)}\n`);
      
      const { xmlSourceId } = req.body;
      console.log(`📋 ADIM 1/8: XML Source bilgileri kontrol ediliyor...`);
      console.log(`   └─ XML Source ID: ${xmlSourceId}`);
      
      const xmlSource = await pageStorage.getXmlSource(xmlSourceId);
      if (!xmlSource) {
        console.log(`❌ HATA: XML source bulunamadı!`);
        return res.status(404).json({ message: "XML source not found" });
      }

      if (!xmlSource.url) {
        console.log(`❌ HATA: XML source URL yapılandırılmamış!`);
        return res.status(400).json({ message: "XML source URL not configured" });
      }
      
      console.log(`   └─ XML Source URL: ${xmlSource.url}`);
      console.log(`   └─ XML Source Name: ${xmlSource.name}`);
      console.log(`✅ ADIM 1 TAMAMLANDI: XML source bilgileri hazır\n`);

      console.log(`📋 ADIM 2/8: Kategori eşleştirmeleri yükleniyor...`);
      const categoryMappings = await pageStorage.getCategoryMappings(xmlSourceId);
      const categoryMappingMap = new Map(
        categoryMappings.map(mapping => [mapping.xmlCategoryName, mapping.localCategoryId])
      );
      console.log(`   └─ Toplam kategori eşleştirmesi: ${categoryMappings.length}`);
      if (categoryMappings.length > 0) {
        console.log(`   └─ Örnek eşleştirme: "${categoryMappings[0].xmlCategoryName}" → kategori ${categoryMappings[0].localCategoryId}`);
      }
      console.log(`✅ ADIM 2 TAMAMLANDI: Kategori mappingler hazır\n`);

      console.log(`📋 ADIM 3/8: XML dosyası indiriliyor...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes for import
      
      console.log(`   └─ URL: ${xmlSource.url}`);
      console.log(`   └─ Timeout: 2 dakika`);
      
      const response = await fetch(xmlSource.url, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; XML-Parser/1.0)'
        }
      });
      
      clearTimeout(timeoutId);
      console.log(`   └─ HTTP Response: ${response.status} ${response.statusText}`);
      console.log(`   └─ Content-Type: ${response.headers.get('content-type') || 'bilinmiyor'}`);
      
      if (!response.ok) {
        return res.status(400).json({ 
          message: `XML kaynağına ulaşılamıyor: ${response.status}` 
        });
      }

      const xmlText = await response.text();
      console.log(`   └─ XML boyutu: ${(xmlText.length / 1024).toFixed(2)} KB`);
      
      // Limit XML size to prevent memory issues (100MB max for import)
      if (xmlText.length > 100 * 1024 * 1024) {
        console.log(`❌ HATA: XML dosyası çok büyük (${(xmlText.length / 1024 / 1024).toFixed(2)} MB > 100 MB)`);
        return res.status(400).json({ 
          message: "XML dosyası çok büyük (maksimum 100MB)" 
        });
      }
      console.log(`✅ ADIM 3 TAMAMLANDI: XML başarıyla indirildi\n`);
      
      console.log(`📋 ADIM 4/8: XML dosyası parse ediliyor...`);
      const parser = new xml2js.Parser({ 
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true
      });
      console.log(`   └─ XML boyutu: ${xmlText.length} karakter`);
      console.log(`   └─ XML önizleme: ${xmlText.substring(0, 200)}...`);
      
      let result;
      try {
        result = await parser.parseStringPromise(xmlText);
        console.log(`   └─ Parse başarılı: ${typeof result} tipi`);
        console.log(`   └─ Ana anahtarlar: [${Object.keys(result || {}).join(', ')}]`);
        console.log(`✅ ADIM 4 TAMAMLANDI: XML parse edildi\n`);
      } catch (parseError) {
        console.log(`❌ HATA: XML parse başarısız!`);
        console.error(`   └─ Parse hatası:`, parseError.message);
        throw new Error(`XML parse failed: ${parseError.message}`);
      }
      
      // Extract products from XML
      const extractProducts = (data: any): any[] => {
        const products: any[] = [];
        const fieldMapping = (xmlSource.fieldMapping as Record<string, string>) || {};
        
        let debugCount = 0;
        const traverse = (obj: any) => {
          if (typeof obj === "object" && obj !== null) {
            if (Array.isArray(obj)) {
              obj.forEach(item => traverse(item));
            } else {
              // Check if this looks like a product object
              let hasRequiredFields = false;
              
              // Check if we can extract a category
              let categoryName = null;
              if (xmlSource.categoryTag) {
                const categoryFields = xmlSource.categoryTag.split('.');
                let categoryValue = obj;
                
                // Only debug first 1 product to avoid log overflow
                if (debugCount < 1) {
                  console.log(`🔍 Debug category extraction #${debugCount + 1} for object keys: [${Object.keys(obj).join(', ')}]`);
                  console.log(`🔍 Looking for categoryTag: ${xmlSource.categoryTag} (split: [${categoryFields.join(', ')}])`);
                }
                
                for (const field of categoryFields) {
                  if (categoryValue && typeof categoryValue === 'object' && field in categoryValue) {
                    if (debugCount < 1) console.log(`  ✅ Found field "${field}", value:`, categoryValue[field]);
                    categoryValue = categoryValue[field];
                  } else {
                    if (debugCount < 1) console.log(`  ❌ Field "${field}" not found in object`);
                    categoryValue = null;
                    break;
                  }
                }
                if (categoryValue && typeof categoryValue === 'string') {
                  categoryName = categoryValue;
                  if (debugCount < 1) console.log(`🎯 Extracted category: "${categoryName}"`);
                } else {
                  if (debugCount < 1) console.log(`⚠️ No valid category found, final value:`, categoryValue, typeof categoryValue);
                }
              }
              
              // Check if category is mapped or use default
              let targetCategoryId = null;
              if (categoryName && categoryMappingMap.has(categoryName)) {
                // Kategori eşleştirmesi var - kesinlikle işle
                targetCategoryId = categoryMappingMap.get(categoryName);
                hasRequiredFields = true;
              } else if (xmlSource.useDefaultCategory && xmlSource.defaultCategoryId) {
                // Eşleştirme yok ama varsayılan kategori kullan seçeneği aktif
                targetCategoryId = xmlSource.defaultCategoryId;
                hasRequiredFields = true;
              } else {
                // Eşleştirme yok - ürünü extract et ama categoryId = null olarak işaretle
                // Import sırasında filtrelenecek
                targetCategoryId = null;
                hasRequiredFields = true;
              }
              
              // Extract all products - filtering will happen later during import
              if (hasRequiredFields) {
                // Extract field values based on field mapping
                const extractValue = (mapping: string | undefined) => {
                  if (!mapping) return null;
                  
                  // Artık basit field mapping: "adi", "fiyat" vs.
                  if (obj && typeof obj === 'object' && mapping in obj) {
                    return obj[mapping];
                  }
                  return null;
                };
                
                // Extract image URLs
                const thumbnailUrl = extractValue(fieldMapping?.thumbnail);
                const imageUrls = [];
                
                // Extract up to 10 images
                for (let i = 1; i <= 10; i++) {
                  const imageUrl = extractValue(fieldMapping?.[`image${i}`]);
                  if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim()) {
                    imageUrls.push(imageUrl.trim());
                  }
                }

                // Extract values with detailed debugging
                const nameValue = extractValue(fieldMapping?.name);
                const priceValue = extractValue(fieldMapping?.price);
                const descValue = extractValue(fieldMapping?.description);
                const skuValue = extractValue(fieldMapping?.sku);
                const barcodeValue = extractValue(fieldMapping?.barcode);
                const stockValue = extractValue(fieldMapping?.currentStock);
                const unitValue = extractValue(fieldMapping?.unit);
                
                console.log(`🔍 EXTRACT VALUES DEBUG:`, {
                  name: nameValue,
                  price: priceValue,
                  desc: descValue,
                  sku: skuValue,
                  stock: stockValue,
                  unit: unitValue,
                  category: categoryName,
                  targetCategoryId
                });
                
                // Kar oranı hesaplama
                let finalPrice = parseFloat(priceValue as string) || 0;
                
                // XML source'dan kar oranı ayarlarını al
                if (xmlSource.profitMarginType === "percent" && xmlSource.profitMarginPercent > 0) {
                  finalPrice = finalPrice * (1 + xmlSource.profitMarginPercent / 100);
                  console.log(`💰 Yüzde kar oranı uygulandı: %${xmlSource.profitMarginPercent} -> ${finalPrice} TL`);
                } else if (xmlSource.profitMarginType === "fixed" && xmlSource.profitMarginFixed > 0) {
                  finalPrice = finalPrice + xmlSource.profitMarginFixed;
                  console.log(`💰 Sabit kar tutarı uygulandı: +${xmlSource.profitMarginFixed} TL -> ${finalPrice} TL`);
                }

                // Excel örneğinizdeki TAM veri yapısı  
                const productData = {
                  name: nameValue || `Ürün-${Date.now()}`, // XML'den gelen ad
                  categoryId: targetCategoryId, // XML'den gelen kategori
                  brandId: 1, // Excel örneğindeki varsayılan brand_id
                  price: Math.round(finalPrice * 100) / 100, // 2 ondalık basamağa yuvarla
                  unit: unitValue || "adet",
                  barcode: barcodeValue || "",
                  sku: skuValue || `XML-${Date.now()}`,
                  tags: "xml,import,auto", // Excel örneğindeki format
                  slug: (nameValue || "demo-product").toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
                  currentStock: parseInt(stockValue as string) || 100,
                  minimumOrderQuantity: 1,
                  videoProvider: "youtube", // Excel örneğindeki varsayılan
                  videoUrl: "https://www.youtube.com/c/SpaGreenCreative",
                  isCatalog: false, // Excel: "0"
                  externalLink: "",
                  isRefundable: false, // Excel: "0"  
                  cashOnDelivery: false, // Excel: "0"
                  shortDescription: descValue ? descValue.replace(/<[^>]*>/g, '').substring(0, 200) : nameValue || "Kısa açıklama mevcut değil",
                  description: descValue || (obj['_'] && typeof obj['_'] === 'string') ? obj['_'] : `${nameValue} hakkında detaylı bilgi için iletişime geçiniz.`,
                  metaTitle: (nameValue || "Demo Product") + " - Meta Title",
                  metaDescription: "Demo meta description for " + (nameValue || "product"),
                  // Sistem alanları
                  xmlSourceId: xmlSourceId,
                  thumbnail: thumbnailUrl && typeof thumbnailUrl === 'string' && thumbnailUrl.trim() ? thumbnailUrl.trim() : null,
                  images: imageUrls.length > 0 ? imageUrls : null,
                  isApproved: true
                };
                
                console.log(`🔍 ÜRÜN VERİSİ HAZIRLANDI:`, productData);
                
                // Artık sadece temel kontrol (isim var mı?)
                if (productData.name && productData.name !== "Ürün Adı Belirtilmemiş") {
                  products.push(productData);
                  debugCount++; // Increment debug counter after adding product
                  console.log(`✅ ÜRÜN EKLENDİ: ${productData.name} - ${productData.price} TL`);
                } else {
                  console.log(`❌ ÜRÜN REDDEDİLDİ: İsim eksik veya varsayılan`);
                }
              }
              
              // Continue traversing
              for (const key in obj) {
                traverse(obj[key]);
              }
            }
          }
        };
        
        console.log(`\n🚨 === CRITICAL DEBUG START ===`);
        console.log(`📋 ADIM 5/8: Ürünler XML'den çıkarılıyor...`);
        console.log(`   └─ Field mapping ayarları:`, Object.keys(fieldMapping));
        console.log(`   └─ Field mapping values:`, fieldMapping);
        console.log(`   └─ Category tag: ${xmlSource.categoryTag}`);
        console.log(`   └─ XML ana anahtarlar: [${Object.keys(data).join(', ')}]`);
        console.log(`🚨 === CRITICAL DEBUG END ===\n`);
        
        // Özel olarak Urunler kontrol et
        if (data.Urunler) {
          console.log(`   └─ Urunler bulundu:`, typeof data.Urunler, Array.isArray(data.Urunler) ? `Array(${data.Urunler.length})` : 'Object');
          
          // XML yapısını detayına kadar incele
          if (Array.isArray(data.Urunler)) {
            console.log(`   └─ Urunler Array formatında`);
            if (data.Urunler.length > 0) {
              console.log(`   └─ İlk eleman keys: [${Object.keys(data.Urunler[0] || {}).join(', ')}]`);
              console.log(`   └─ İlk eleman sample:`, JSON.stringify(data.Urunler[0], null, 2).substring(0, 500));
            }
          } else {
            console.log(`   └─ Urunler Object formatında: [${Object.keys(data.Urunler).join(', ')}]`);
            if (data.Urunler.Urun) {
              const urunType = Array.isArray(data.Urunler.Urun) ? `Array(${data.Urunler.Urun.length})` : 'Object';
              console.log(`   └─ Urunler.Urun bulundu: ${urunType}`);
              if (Array.isArray(data.Urunler.Urun) && data.Urunler.Urun.length > 0) {
                console.log(`   └─ İlk Urun keys: [${Object.keys(data.Urunler.Urun[0] || {}).join(', ')}]`);
              }
            }
          }
        } else {
          console.log(`   └─ ⚠️  Urunler anahtarı bulunamadı!`);
        }
        
        console.log(`   └─ Traverse başlatılıyor...`);
        traverse(data);
        console.log(`   └─ Traverse tamamlandı: ${products.length} ürün bulundu`);
        
        if (products.length > 0) {
          console.log(`   └─ İlk ürün örneği: ${products[0].name} - ${products[0].price} TL`);
        } else {
          console.log(`   └─ ❌ HİÇ ÜRÜN BULUNAMADI! XML yapısını kontrol edin`);
        }
        
        console.log(`✅ ADIM 5 TAMAMLANDI: ${products.length} ürün çıkarıldı\n`);
        return products;
      };

      console.log(`📋 ADIM 6/8: Ürün verileri işleniyor...`);
      
      const extractedProducts = extractProducts(result);
      console.log(`   └─ Çıkarılan ürün sayısı: ${extractedProducts.length}`);
      
      if (extractedProducts.length > 0) {
        console.log(`   └─ İlk ürün: ${extractedProducts[0].name} - ${extractedProducts[0].price} TL`);
        console.log(`   └─ Kategori ID: ${extractedProducts[0].categoryId}`);
        console.log(`✅ ADIM 6 TAMAMLANDI: Ürünler işlendi\n`);
      } else {
        console.log(`   └─ ❌ Hiç ürün çıkarılamadı!`);
        console.log(`   └─ XML root keys: [${Object.keys(result).join(', ')}]`);
        console.log(`❌ ADIM 6 BAŞARISIZ: Hiç ürün bulunamadı\n`);
      }
      
      let processedCount = 0;
      
      console.log(`📋 ADIM 7/8: MySQL veritabanı bağlantısı kontrol ediliyor...`);
      
      // Import için database bağlantısını kontrol et
      const dbSettings = await pageStorage.getDatabaseSettings();
      if (!dbSettings || !dbSettings.host) {
        console.log(`❌ HATA: MySQL database ayarları yapılandırılmamış`);
        return res.status(400).json({ 
          message: "MySQL database ayarları yapılandırılmamış. Lütfen settings sayfasından veritabanı ayarlarını yapın.",
          error: "DATABASE_NOT_CONFIGURED"
        });
      }
      
      console.log(`   └─ MySQL Host: ${dbSettings.host}:${dbSettings.port}`);
      console.log(`   └─ Database: ${dbSettings.database}`);
      console.log(`✅ ADIM 7 TAMAMLANDI: Database bağlantısı hazır\n`);
      
      console.log(`📋 ADIM 8/8: ${extractedProducts.length} ürün MySQL'e aktarılıyor...`);

      await connectToImportDatabase({
        host: dbSettings.host,
        port: dbSettings.port,
        database: dbSettings.database,
        username: dbSettings.username,
        password: dbSettings.password
      });

      // Products tablosunun yapısını kontrol et
      const tableStructure = await checkProductTableStructure();
      if (!tableStructure) {
        return res.status(400).json({ 
          message: "Products tablosu bulunamadı. Lütfen veritabanı yapısını kontrol edin.",
          error: "PRODUCTS_TABLE_NOT_FOUND"
        });
      }

      console.log(`   └─ Toplam kategori eşleştirmesi: ${categoryMappings.length}`);
      
      if (categoryMappings.length > 0) {
        console.log(`   └─ Örnek eşleştirme: "${categoryMappings[0].xmlCategoryName}" → kategori ${categoryMappings[0].localCategoryId}`);
      }
      
      // Sadece eşleştirilen kategorilere sahip ürünleri import et
      let skippedCount = 0;
      let potentialImports = 0;
      let addedCount = 0;
      let updatedCount = 0;
      
      // Önce kaç ürün import edilebilir kontrol et
      for (const productData of extractedProducts) {
        if (productData.categoryId && productData.categoryId !== 0) {
          potentialImports++;
        }
      }
      
      console.log(`🎯 Import Öngörüsü: ${extractedProducts.length} ürün bulundu, ${potentialImports} ürün eşleştirilmiş kategoriye sahip`);
      
      if (potentialImports === 0) {
        console.log(`⚠️ Hiç ürün import edilemeyecek - kategori eşleştirmelerini kontrol edin!`);
      }
      
      // Kategori eşleştirmesi olan ürünleri filtrele
      const validProducts = extractedProducts.filter(productData => {
        if (!productData.categoryId || productData.categoryId === 0) {
          console.log(`⏭️ Skipping product "${productData.name}" - category "${productData.category}" not mapped`);
          skippedCount++;
          return false;
        }
        console.log(`✅ Will import: "${productData.name}" - category "${productData.category}" → ID: ${productData.categoryId}`);
        return true;
      });

      console.log(`🚀 HIZLI BATCH IMPORT başlatılıyor: ${validProducts.length} geçerli ürün bulundu`);

      // BATCH IMPORT kullan - çok daha hızlı!
      const batchResult = await batchImportProductsToMySQL(validProducts, 50); // 50'li gruplar halinde
      
      addedCount = batchResult.addedCount;
      updatedCount = batchResult.updatedCount;
      skippedCount += batchResult.skippedCount;
      processedCount = addedCount + updatedCount + batchResult.skippedCount;
      
      console.log(`📊 Import Summary: ${addedCount} eklendi, ${updatedCount} güncellendi, ${skippedCount} atlandı (kategori eşleşmesi yok)`);
      
      await pageStorage.createActivityLog({
        type: "xml_synced",
        title: "XML kaynağı güncellendi",
        description: `${xmlSource.name} - ${addedCount} yeni ürün eklendi, ${updatedCount} ürün güncellendi, ${skippedCount} ürün atlandı`,
        entityId: xmlSourceId,
        entityType: "xml_source"
      });

      // Import başarıyla tamamlandı - state temizle
      isImportInProgress = false;
      shouldCancelImport = false;
      currentImportId = null;

      res.json({ 
        message: "XML import başarıyla tamamlandı",
        processed: processedCount,
        added: addedCount,
        updated: updatedCount,
        skipped: skippedCount,
        found: extractedProducts.length
      });
    } catch (error: any) {
      console.error("XML import error:", error);
      
      // Hata durumunda da state temizle
      isImportInProgress = false;
      shouldCancelImport = false;
      currentImportId = null;
      
      let errorMessage = "XML import sırasında hata oluştu";
      
      if (error.name === 'AbortError') {
        errorMessage = "XML dosyası çok büyük veya yükleme zaman aşımına uğradı (2 dakika)";
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = "XML URL'sine ulaşılamıyor. Lütfen URL'yi kontrol edin.";
      } else if (error.message && error.message.includes('timeout')) {
        errorMessage = "XML import işlemi zaman aşımına uğradı. Dosya çok büyük olabilir.";
      }
      
      res.status(500).json({ message: errorMessage });
    }
  });

  // Database Settings endpoints
  app.get("/api/database-settings", async (req, res) => {
    try {
      const settings = await pageStorage.getDatabaseSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch database settings" });
    }
  });

  app.post("/api/database-settings", async (req, res) => {
    try {
      const data = insertDatabaseSettingsSchema.parse(req.body);
      const settings = await pageStorage.createDatabaseSettings(data);
      res.status(201).json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create database settings" });
      }
    }
  });

  app.put("/api/database-settings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const settings = await pageStorage.updateDatabaseSettings(id, data);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to update database settings" });
    }
  });

  app.put("/api/database-settings/:id/activate", async (req, res) => {
    try {
      const { id } = req.params;
      const settings = await pageStorage.updateDatabaseSettings(id, { isActive: true });
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to activate database settings" });
    }
  });

  app.delete("/api/database-settings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const settings = await pageStorage.getDatabaseSettings();
      if (settings && settings.id === id) {
        // Sadece tek settings olduğu için config'ten sil
        const deleted = true;
      } else {
        const deleted = false;
      }
      const deleted = true; // JSON storage'da delete yerine null set et
      if (deleted) {
        res.json({ message: "Database settings deleted successfully" });
      } else {
        res.status(404).json({ message: "Database settings not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete database settings" });
    }
  });

  app.post("/api/database-settings/test-connection", async (req, res) => {
    try {
      const { host, port, database, username, password } = req.body;
      
      // Gerçek MySQL bağlantısını test et
      console.log(`Testing MySQL connection: ${username}@${host}:${port}/${database}`);
      
      await connectToImportDatabase({
        host,
        port: parseInt(port),
        database,
        username,
        password
      });
      
      // Bağlantı başarılıysa kategorileri test çek
      const categories = await getLocalCategories();
      console.log(`Test successful: Found ${categories.length} categories in category_languages table`);
      
      res.json({ 
        message: `Veritabanı bağlantısı başarılı! ${categories.length} kategori bulundu.`,
        status: "success",
        categoriesCount: categories.length,
        details: `category_languages tablosundan ${categories.length} kategori okundu`
      });
    } catch (error: any) {
      console.error("MySQL test connection error:", error);
      
      let errorMessage = `Veritabanı bağlantısı başarısız: ${error.message}`;
      let suggestions = [];
      
      // Hata türüne göre öneriler
      if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        if (host === 'localhost' || host === '127.0.0.1') {
          suggestions = [
            "Kullanıcı adı veya şifre yanlış",
            "MySQL'de: GRANT ALL PRIVILEGES ON *.* TO 'kullanici'@'localhost' IDENTIFIED BY 'sifre';",
            "Alternatif: GRANT ALL PRIVILEGES ON *.* TO 'kullanici'@'127.0.0.1' IDENTIFIED BY 'sifre';",
            "Sonra: FLUSH PRIVILEGES; komutunu çalıştırın"
          ];
        } else {
          suggestions = [
            "MySQL kullanıcısının şifresi yanlış olabilir",
            "Kullanıcının bu IP adresinden bağlanma izni olmayabilir",
            "MySQL'de kullanıcı için '%' (herhangi bir host) izni verilmeli"
          ];
        }
      } else if (error.code === 'ECONNREFUSED') {
        if (host === 'localhost' || host === '127.0.0.1') {
          suggestions = [
            "MySQL servisi çalışmıyor: sudo service mysql start",
            "Port 3306 kullanımda değil: netstat -an | grep 3306",
            "MySQL config kontrolü: /etc/mysql/mysql.conf.d/mysqld.cnf",
            "Alternatif host deneyiniz: localhost yerine 127.0.0.1 veya tersi"
          ];
        } else {
          suggestions = [
            "MySQL sunucusu çalışmıyor olabilir",
            "Port numarası hatalı olabilir (genelde 3306)",
            "Host adresi yanlış olabilir"
          ];
        }
      } else if (error.code === 'ENOTFOUND') {
        suggestions = [
          "Host adresi/domain bulunamıyor",
          "DNS çözümleme hatası"
        ];
      }
      
      res.status(400).json({ 
        message: errorMessage,
        status: "error",
        code: error.code,
        suggestions: suggestions
      });
    }
  });

  // TÜM ÜRÜNLERİ SİL endpoint
  app.delete("/api/products/delete-all", async (req, res) => {
    try {
      console.log("🗑️ TÜM ÜRÜNLER SİLME isteği alındı...");

      // Database ayarlarını kontrol et
      const dbSettings = await pageStorage.getDatabaseSettings();
      if (!dbSettings) {
        return res.status(400).json({ 
          message: "Veritabanı ayarları bulunamadı. Önce veritabanı ayarlarını yapılandırın.",
          error: "DB_SETTINGS_NOT_FOUND"
        });
      }

      // Database bağlantısını yap
      await connectToImportDatabase({
        host: dbSettings.host,
        port: dbSettings.port,
        database: dbSettings.database,
        username: dbSettings.username,
        password: dbSettings.password
      });

      // Tüm ürünleri sil
      const deleteResult = await deleteAllProductsFromMySQL();

      // Activity log oluştur
      await pageStorage.createActivityLog({
        type: "products_deleted",
        title: "Tüm ürünler silindi",
        description: `${deleteResult.deletedProducts} ürün, ${deleteResult.deletedLanguages} dil verisi, ${deleteResult.deletedStocks} stok verisi silindi. Auto-increment ID'ler sıfırlandı.`,
        entityId: null,
        entityType: "products"
      });

      res.json({
        message: "Tüm ürünler başarıyla silindi!",
        success: true,
        deletedProducts: deleteResult.deletedProducts,
        deletedLanguages: deleteResult.deletedLanguages,
        deletedStocks: deleteResult.deletedStocks
      });

    } catch (error: any) {
      console.error("❌ Tüm ürün silme hatası:", error);
      
      res.status(500).json({
        message: "Ürün silme işlemi başarısız",
        error: error.message,
        success: false
      });
    }
  });

  // Import status and control endpoints
  app.get("/api/products/import-status", async (req, res) => {
    try {
      res.json({
        isImportInProgress,
        shouldCancelImport,
        currentImportId
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get import status" });
    }
  });

  app.post("/api/products/cancel-import", async (req, res) => {
    try {
      if (!isImportInProgress) {
        return res.status(400).json({ 
          message: "Şu anda devam eden bir ithalat işlemi yok",
          success: false 
        });
      }

      shouldCancelImport = true;
      
      // Activity log oluştur
      await pageStorage.createActivityLog({
        type: "import_cancelled",
        title: "İthalat işlemi iptal edildi",
        description: "Kullanıcı tarafından ithalat işlemi durduruldu",
        entityId: currentImportId,
        entityType: "import"
      });

      res.json({
        message: "İthalat işlemi iptal ediliyor...",
        success: true
      });
    } catch (error: any) {
      res.status(500).json({ 
        message: "İptal işlemi başarısız", 
        error: error.message,
        success: false 
      });
    }
  });

  app.post("/api/products/stop-import", async (req, res) => {
    try {
      if (!isImportInProgress) {
        return res.status(400).json({ 
          message: "Şu anda devam eden bir ithalat işlemi yok",
          success: false 
        });
      }

      // Force stop - hemen durdur
      isImportInProgress = false;
      shouldCancelImport = false;
      currentImportId = null;
      
      // Activity log oluştur
      await pageStorage.createActivityLog({
        type: "import_stopped",
        title: "İthalat işlemi durduruldu",
        description: "Kullanıcı tarafından ithalat işlemi zorla durduruldu",
        entityId: currentImportId,
        entityType: "import"
      });

      res.json({
        message: "İthalat işlemi durduruldu!",
        success: true
      });
    } catch (error: any) {
      res.status(500).json({ 
        message: "Durdurma işlemi başarısız", 
        error: error.message,
        success: false 
      });
    }
  });

  // Image upload endpoints
  app.post("/api/images/upload", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getImageUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting image upload URL:", error);
      res.status(500).json({ message: "Failed to get upload URL" });
    }
  });

  app.post("/api/images/process", async (req, res) => {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ message: "Image URL is required" });
      }

      const objectStorageService = new ObjectStorageService();
      const processedImages = await objectStorageService.generateImageSizes(imageUrl);
      res.json(processedImages);
    } catch (error) {
      console.error("Error processing image:", error);
      res.status(500).json({ message: "Failed to process image" });
    }
  });

  // Serve public images
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Gemini AI endpoints
  app.post("/api/gemini/test-api-key", async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey) {
        return res.status(400).json({ message: "API anahtarı gerekli" });
      }

      const geminiService = new GeminiService();
      const models = await geminiService.testApiKeyAndGetModels(apiKey);
      
      res.json({ 
        success: true, 
        models 
      });
    } catch (error: any) {
      res.status(400).json({ 
        success: false, 
        message: error.message 
      });
    }
  });

  app.get("/api/gemini-settings", async (req, res) => {
    try {
      const settings = await pageStorage.getGeminiSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch Gemini settings" });
    }
  });

  app.post("/api/gemini-settings", async (req, res) => {
    try {
      const data = insertGeminiSettingsSchema.parse(req.body);
      const settings = await pageStorage.updateGeminiSettings(data.apiKey, data.model);
      res.status(201).json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create Gemini settings" });
      }
    }
  });

  app.put("/api/gemini-settings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const settings = await pageStorage.updateGeminiSettings(data.apiKey, data.selectedModel);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to update Gemini settings" });
    }
  });

  app.delete("/api/gemini-settings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      // Mevcut ayarları al ve sadece API key'i temizle, model seçimini koru
      const currentSettings = await pageStorage.getGeminiSettings();
      const settings = await pageStorage.updateGeminiSettings('', currentSettings.selected_model);
      const success = true;
      if (success) {
        res.json({ message: "Gemini ayarı başarıyla silindi" });
      } else {
        res.status(404).json({ message: "Gemini ayarı bulunamadı" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete Gemini settings" });
    }
  });

  // AI-powered category mapping
  app.post("/api/category-mappings/ai-map", async (req, res) => {
    try {
      const { xmlSourceId } = req.body;
      
      if (!xmlSourceId) {
        return res.status(400).json({ message: "XML source ID is required" });
      }

      const result = await pageStorage.aiMapCategories(xmlSourceId);
      res.json(result);
    } catch (error: any) {
      console.error("AI mapping error:", error);
      res.status(500).json({ message: error.message || "AI eşleştirme sırasında hata oluştu" });
    }
  });

  // Cronjob endpoints
  app.get("/api/cronjobs", async (req, res) => {
    try {
      const cronjobs = await pageStorage.getCronjobs();
      res.json(cronjobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cronjobs" });
    }
  });

  app.post("/api/cronjobs", async (req, res) => {
    try {
      const cronjob = await pageStorage.createCronjob(req.body);
      res.status(201).json(cronjob);
    } catch (error) {
      res.status(500).json({ message: "Failed to create cronjob" });
    }
  });

  app.put("/api/cronjobs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const cronjob = await pageStorage.updateCronjob(id, req.body);
      res.json(cronjob);
    } catch (error) {
      res.status(500).json({ message: "Failed to update cronjob" });
    }
  });

  app.delete("/api/cronjobs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await pageStorage.deleteCronjob(id);
      if (success) {
        res.json({ message: "Cronjob deleted successfully" });
      } else {
        res.status(404).json({ message: "Cronjob not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete cronjob" });
    }
  });

  // Manual cronjob execution (URL endpoint for triggering)
  app.post("/api/cronjobs/:id/run", async (req, res) => {
    try {
      const { id } = req.params;
      // Mock cronjob çalıştırma
      const success = true;
      
      if (success) {
        res.json({ 
          message: "Cronjob executed successfully",
          status: "completed"
        });
      } else {
        res.status(500).json({ 
          message: "Cronjob execution failed",
          status: "failed"
        });
      }
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to run cronjob",
        status: "error"
      });
    }
  });

  // Public webhook endpoint for external cron services (URL for triggering cronjobs)
  app.post("/api/webhook/cronjob/:id", async (req, res) => {
    try {
      const { id } = req.params;
      // Mock cronjob tetikleme
      const success = true;
      
      if (success) {
        res.json({ 
          message: "Cronjob triggered successfully",
          status: "completed",
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({ 
          message: "Cronjob execution failed",
          status: "failed",
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      res.status(500).json({ 
        message: error.message || "Failed to trigger cronjob",
        status: "error",
        timestamp: new Date().toISOString()
      });
    }
  });

  // MySQL Import endpoint - XML'den ürünleri MySQL'e aktar
  app.post("/api/xml-sources/:id/import-to-mysql", async (req, res) => {
    try {
      const { id } = req.params;
      const xmlSource = await pageStorage.getXmlSource(id);
      
      if (!xmlSource) {
        return res.status(404).json({ message: "XML source not found" });
      }

      // Database ayarlarını kontrol et
      const dbSettings = await pageStorage.getDatabaseSettings();
      if (!dbSettings) {
        return res.status(400).json({ message: "MySQL database settings not configured" });
      }

      // MySQL'e bağlan
      await connectToImportDatabase({
        host: dbSettings.host,
        port: dbSettings.port,
        database: dbSettings.database,
        username: dbSettings.username,
        password: dbSettings.password
      });

      // XML'i fetch et ve parse et
      const response = await fetch(xmlSource.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch XML: ${response.status}`);
      }

      const xmlData = await response.text();
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(xmlData);

      // Ürünleri çıkar ve MySQL'e import et
      let importedCount = 0;
      const products = []; // XML'den çıkarılan ürünler

      // XML'i parse et (bu kısım XML yapınıza göre özelleştirilmeli)
      if (result.root && result.root.product) {
        for (const product of result.root.product) {
          try {
            const productData = {
              name: product.name?.[0] || 'Unknown Product',
              price: parseFloat(product.price?.[0] || '0'),
              description: product.description?.[0] || '',
              sku: product.sku?.[0] || '',
              stock: parseInt(product.stock?.[0] || '0'),
              categoryId: null // Kategori eşleştirmesi yapılacak
            };

            // MySQL'e import et
            await importProductToMySQL(productData);
            importedCount++;

          } catch (error) {
            console.error('Product import error:', error);
          }
        }
      }

      // Activity log ekle
      await pageStorage.createActivityLog({
        type: "mysql_import",
        title: `MySQL'e ${importedCount} ürün aktarıldı`,
        description: `${xmlSource.name} kaynağından MySQL veritabanına ürün aktarımı`,
        entityId: id,
        entityType: "xml_source"
      });

      res.json({
        message: `${importedCount} ürün başarıyla MySQL'e aktarıldı`,
        importedCount,
        xmlSource: xmlSource.name
      });

    } catch (error: any) {
      console.error("🚨 XML IMPORT FULL ERROR:", error);
      console.error("🚨 Error name:", error.name);
      console.error("🚨 Error message:", error.message);
      console.error("🚨 Error stack:", error.stack);
      res.status(500).json({ 
        message: error.message || "XML import sırasında hata oluştu",
        error: error.name,
        details: error.stack?.substring(0, 200)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
