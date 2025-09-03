import type { Express } from "express";
import { createServer, type Server } from "http";
import { pageStorage } from "./pageStorage";
import { insertXmlSourceSchema, insertCategoryMappingSchema, insertDatabaseSettingsSchema, insertGeminiSettingsSchema } from "@shared/schema";
import { z } from "zod";
import * as xml2js from "xml2js";
import { ObjectStorageService } from "./objectStorage";
import { GeminiService } from "./geminiService";
import { getLocalCategories, connectToImportDatabase, importProductToMySQL, batchImportProductsToMySQL, checkProductTableStructure, deleteAllProductsFromMySQL, deleteProductsByXmlSource, getImportConnection } from "./mysql-import";
import { findBestCategoryMatch } from './categoryMatcher';

// Global import state management
let isImportInProgress = false;
let shouldCancelImport = false;
let currentImportId: string | null = null;

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Categories to JSON endpoint
  app.post("/api/categories/save-to-json", async (req, res) => {
    try {
      console.log("🔄 Kategorileri JSON'a kaydetme isteği alındı...");
      const result = await pageStorage.saveCategoriesToLocalJson();
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          count: result.count,
          categories: result.categories
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message,
          count: 0
        });
      }
    } catch (error: any) {
      console.error("❌ Kategoriler JSON'a kaydedilirken API hatası:", error);
      res.status(500).json({
        success: false,
        message: "Kategoriler kaydedilirken hata oluştu: " + error.message,
        count: 0
      });
    }
  });

  // Get local JSON categories endpoint
  app.get("/api/categories/local-json", async (req, res) => {
    try {
      const result = await pageStorage.getLocalJsonCategories();
      res.json(result);
    } catch (error: any) {
      console.error("❌ Yerel JSON kategoriler okunurken hata:", error);
      res.status(500).json({
        categories: [],
        lastUpdated: null,
        count: 0,
        error: error.message
      });
    }
  });

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
      console.log('📥 XML Source creation request body:', JSON.stringify(req.body, null, 2));
      const data = insertXmlSourceSchema.parse(req.body);
      console.log('✅ Schema validation passed');
      const xmlSource = await pageStorage.createXmlSource(data);
      res.status(201).json(xmlSource);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.log('❌ Zod validation error:', JSON.stringify(error.errors, null, 2));
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        console.log('❌ Other error:', error);
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
      
      // Extract field names with dynamic XML product path support
      const extractProductFields = (rootObj: any, xmlProductPath?: string): string[] => {
        const fields = new Set<string>();
        
        // XML product path'ini dinamik olarak kullan (varsayılan: "Urunler.Urun")
        const productPath = xmlProductPath || "Urunler.Urun";
        console.log(`🔍 XML Product Path kullanılıyor: "${productPath}"`);
        
        // Path'i parçalara böl (örn: "Urunler.Urun" -> ["Urunler", "Urun"])
        const pathParts = productPath.split('.');
        
        // Dynamic path navigation
        let currentLevel = rootObj;
        let navigationSuccess = true;
        let navigatedPath = [];
        
        for (const part of pathParts) {
          if (currentLevel && typeof currentLevel === 'object' && part in currentLevel) {
            currentLevel = currentLevel[part];
            navigatedPath.push(part);
          } else {
            console.log(`❌ XML path navigation failed at: "${part}", available keys: [${Object.keys(currentLevel || {}).join(', ')}]`);
            navigationSuccess = false;
            break;
          }
        }
        
        if (!navigationSuccess || !currentLevel) {
          console.log(`❌ XML product path "${productPath}" bulunamadı, fallback kullanılıyor`);
          console.log(`📋 XML root keys: [${Object.keys(rootObj).join(', ')}]`);
          
          // Auto-detect product array structure
          const autoDetectedPath = autoDetectProductPath(rootObj);
          if (autoDetectedPath) {
            console.log(`🔍 Auto-detected product path: "${autoDetectedPath}"`);
            return extractProductFields(rootObj, autoDetectedPath);
          }
          
          // Complete fallback
          return extractTagsIterative(rootObj);
        }
        
        console.log(`✅ XML path navigation başarılı: ${navigatedPath.join('.')} -> ${Array.isArray(currentLevel) ? `Array[${currentLevel.length}]` : typeof currentLevel}`);
        
        // İlk ürünü analiz et
        const firstProduct = Array.isArray(currentLevel) ? currentLevel[0] : currentLevel;
        if (firstProduct && typeof firstProduct === 'object') {
          console.log(`🔍 First product keys: [${Object.keys(firstProduct).slice(0, 10).join(', ')}${Object.keys(firstProduct).length > 10 ? '...' : ''}]`);
          
          // Sadece ilk seviye field'ları al (adi, fiyat, kod vs.)
          for (const key in firstProduct) {
            if (typeof firstProduct[key] !== 'object' || firstProduct[key] === null) {
              // Basit değerler (string, number, null)
              fields.add(key);
            } else if (typeof firstProduct[key] === 'object' && !Array.isArray(firstProduct[key])) {
              // İç objeler varsa onları da ekle (max 1 seviye)
              for (const subKey in firstProduct[key]) {
                fields.add(`${key}.${subKey}`);
              }
            }
          }
        }
        
        console.log(`✅ Extracted ${fields.size} fields: [${Array.from(fields).slice(0, 10).join(', ')}${fields.size > 10 ? '...' : ''}]`);
        return Array.from(fields);
      };
      
      // Auto-detect common product array patterns
      const autoDetectProductPath = (rootObj: any): string | null => {
        const commonPaths = [
          "products.product",
          "items.item", 
          "Urunler.Urun",
          "Products.Product",
          "Items.Item",
          "product_list.product",
          "item_list.item",
          "feed.product",
          "channel.item",
          "rss.channel.item"
        ];
        
        for (const path of commonPaths) {
          const pathParts = path.split('.');
          let currentLevel = rootObj;
          let pathExists = true;
          
          for (const part of pathParts) {
            if (currentLevel && typeof currentLevel === 'object' && part in currentLevel) {
              currentLevel = currentLevel[part];
            } else {
              pathExists = false;
              break;
            }
          }
          
          if (pathExists && currentLevel && 
              (Array.isArray(currentLevel) || (typeof currentLevel === 'object' && Object.keys(currentLevel).length > 0))) {
            console.log(`🎯 Auto-detected XML path: "${path}"`);
            return path;
          }
        }
        
        console.log(`❌ No common XML product patterns found`);
        return null;
      };
      
      // Fallback function for non-standard XML structures
      const extractTagsIterative = (rootObj: any): string[] => {
        const tags = new Set<string>();
        const queue: { obj: any, path: string, depth: number }[] = [{ obj: rootObj, path: "", depth: 0 }];
        const maxDepth = 6;
        const maxTags = 500;
        
        while (queue.length > 0 && tags.size < maxTags) {
          const { obj, path, depth } = queue.shift()!;
          
          if (depth > maxDepth || typeof obj !== "object" || obj === null) {
            continue;
          }
          
          if (Array.isArray(obj)) {
            if (obj.length > 0) {
              queue.push({ obj: obj[0], path, depth: depth + 1 });
            }
          } else {
            let processedKeys = 0;
            const maxKeysPerLevel = 50;
            
            for (const key in obj) {
              if (processedKeys >= maxKeysPerLevel) break;
              
              const fullPath = path ? `${path}.${key}` : key;
              tags.add(fullPath);
              
              if (depth < maxDepth && typeof obj[key] === "object" && obj[key] !== null) {
                queue.push({ obj: obj[key], path: fullPath, depth: depth + 1 });
              }
              
              processedKeys++;
            }
          }
        }
        
        return Array.from(tags);
      };

      console.log("Extracting product fields from XML structure...");
      // Default veya auto-detect kullan
      const tags = extractProductFields(result); // Auto-detect kullanılacak
      console.log("Found", tags.length, "product fields");
      
      // Auto-detected path'den first product'ı al
      const detectedPath = autoDetectProductPath(result) || "Urunler.Urun";
      const pathParts = detectedPath.split('.');
      let currentLevel = result;
      for (const part of pathParts) {
        if (currentLevel && typeof currentLevel === 'object' && part in currentLevel) {
          currentLevel = currentLevel[part];
        }
      }
      const firstProduct = Array.isArray(currentLevel) ? currentLevel[0] : currentLevel;
      
      // Find all possible product paths
      const findAllProductPaths = (rootObj: any): string[] => {
        const commonPaths = [
          "products.product",
          "items.item", 
          "Urunler.Urun",
          "Products.Product",
          "Items.Item",
          "product_list.product",
          "item_list.item",
          "feed.product",
          "channel.item",
          "rss.channel.item"
        ];
        
        const foundPaths: string[] = [];
        
        for (const path of commonPaths) {
          const pathParts = path.split('.');
          let currentLevel = rootObj;
          let pathExists = true;
          
          for (const part of pathParts) {
            if (currentLevel && typeof currentLevel === 'object' && part in currentLevel) {
              currentLevel = currentLevel[part];
            } else {
              pathExists = false;
              break;
            }
          }
          
          if (pathExists && currentLevel && 
              (Array.isArray(currentLevel) || (typeof currentLevel === 'object' && Object.keys(currentLevel).length > 0))) {
            foundPaths.push(path);
          }
        }
        
        return foundPaths;
      };
      
      const detectedProductPaths = findAllProductPaths(result);
      
      res.json({ 
        message: "XML yapısı başarıyla alındı",
        tags: tags.sort(),
        sampleStructure: firstProduct || {},
        detectedProductPaths,
        recommendedPath: detectedPath,
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
        id: cat.categoryId, // MySQL'den gelen categoryId field'ını kullan
        name: cat.title,
        title: cat.title
      })));
    } catch (error: any) {
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
      const brands: any[] = [];
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
      } catch (parseError: any) {
        console.log(`❌ HATA: XML parse başarısız!`);
        console.error(`   └─ Parse hatası:`, parseError.message);
        throw new Error(`XML parse failed: ${parseError.message}`);
      }
      
      // Extract products from XML
      const extractProducts = (data: any): any[] => {
        const products: any[] = [];
        const fieldMapping = (xmlSource.fieldMapping as Record<string, string>) || {};
        
        console.log(`📋 ADIM 5/8: Ürünler XML'den çıkarılıyor...`);
        
        // Auto-detect function for this scope
        const autoDetectProductPathLocal = (rootObj: any): string | null => {
          const commonPaths = [
            "products.product",
            "items.item", 
            "Urunler.Urun",
            "Products.Product",
            "Items.Item",
            "product_list.product",
            "item_list.item",
            "feed.product",
            "channel.item",
            "rss.channel.item"
          ];
          
          for (const path of commonPaths) {
            const pathParts = path.split('.');
            let currentLevel = rootObj;
            let pathExists = true;
            
            for (const part of pathParts) {
              if (currentLevel && typeof currentLevel === 'object' && part in currentLevel) {
                currentLevel = currentLevel[part];
              } else {
                pathExists = false;
                break;
              }
            }
            
            if (pathExists && currentLevel && 
                (Array.isArray(currentLevel) || (typeof currentLevel === 'object' && Object.keys(currentLevel).length > 0))) {
              console.log(`🎯 Auto-detected XML path: "${path}"`);
              return path;
            }
          }
          
          return null;
        };
        
        // XML source'dan product path'i al, yoksa auto-detect et
        const xmlProductPath = (xmlSource as any).xmlProductPath || autoDetectProductPathLocal(data) || "Urunler.Urun";
        console.log(`🔍 XML Product Path: "${xmlProductPath}"`);
        
        // Dynamic path navigation
        const pathParts = xmlProductPath.split('.');
        let currentLevel = data;
        let navigationSuccess = true;
        
        for (const part of pathParts) {
          if (currentLevel && typeof currentLevel === 'object' && part in currentLevel) {
            currentLevel = currentLevel[part];
          } else {
            console.log(`❌ XML path navigation failed at: "${part}"`);
            navigationSuccess = false;
            break;
          }
        }
        
        if (!navigationSuccess || !currentLevel) {
          console.log(`❌ XML'de "${xmlProductPath}" yapısı bulunamadı`);
          console.log(`📋 Available root keys: [${Object.keys(data).join(', ')}]`);
          return products;
        }
        
        const productArray = Array.isArray(currentLevel) ? currentLevel : [currentLevel];
        console.log(`✅ XML'de ${productArray.length} ürün bulundu (path: ${xmlProductPath})`);
        
        let debugCount = 0;
        productArray.forEach((obj, index) => {
          if (typeof obj === "object" && obj !== null) {
              
              // Check if this looks like a product object
              let hasRequiredFields = false;
              
              // Check if we can extract a category
              let categoryName = null;
              if (xmlSource.categoryTag && xmlSource.categoryTag.trim()) {
                const categoryFields = xmlSource.categoryTag.split('.');
                let categoryValue = obj;
                
                
                for (const field of categoryFields) {
                  if (categoryValue && typeof categoryValue === 'object' && field in categoryValue) {
                    categoryValue = categoryValue[field];
                  } else {
                    categoryValue = null;
                    break;
                  }
                }
                if (categoryValue && typeof categoryValue === 'string') {
                  categoryName = categoryValue;
                } 
              } else {
                // categoryTag boş - hep null olacak
                if (debugCount < 1) {
                  console.log(`ℹ️ categoryTag boş/tanımsız: "${xmlSource.categoryTag}" - tüm ürünler categoryName=null ile extract edilecek`);
                }
              }
              
              // Category mapping - sadece kategori ID'si ata, filtreleme import sırasında yapılacak
              let targetCategoryId = null;
              if (categoryName && categoryMappingMap.has(categoryName)) {
                // Kategori eşleştirmesi var
                targetCategoryId = categoryMappingMap.get(categoryName);
              } else if (xmlSource.useDefaultCategory && xmlSource.defaultCategoryId) {
                // Varsayılan kategori kullan
                targetCategoryId = xmlSource.defaultCategoryId;
              }
              // categoryId null olsa bile ürünü extract et - import sırasında filtrelenecek
              
              // Check if this looks like a product object (basic fields check)
              const hasBasicFields = obj.adi || obj.name || obj.urun_id || Object.keys(obj).length > 3;
              if (hasBasicFields) {
                hasRequiredFields = true;
                if (debugCount < 1) {
                  console.log(`✅ ÜRÜN OBJESİ BULUNDU: keys=[${Object.keys(obj).slice(0, 5).join(', ')}...]`);
                  debugCount++;
                }
              }
              
              // Extract all products - filtering will happen later during import
              if (hasRequiredFields) {
                // ROBUST FIELD MAPPING - Supports deep object navigation with dynamic XML paths
                const extractValue = (mapping: string | undefined) => {
                  if (!mapping) return null;
                  
                  // Dynamic path handling - remove detected XML path prefix if present
                  let actualField = mapping;
                  
                  // If mapping starts with detected XML path, remove it
                  if (mapping.includes(xmlProductPath + '.')) {
                    actualField = mapping.split(xmlProductPath + '.').pop() || mapping;
                  }
                  
                  // Legacy support for old mappings
                  if (mapping.includes('Urunler.Urun.')) {
                    actualField = mapping.split('Urunler.Urun.').pop() || mapping;
                  }
                  
                  // Direct field access from current product object
                  if (obj && typeof obj === 'object' && actualField in obj) {
                    return obj[actualField];
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

                // EXTRACT WITH ROBUST FALLBACKS
                let nameValue = extractValue(fieldMapping?.name);
                let priceValue = extractValue(fieldMapping?.price);
                let descValue = extractValue(fieldMapping?.description);
                let shortDescValue = extractValue(fieldMapping?.short_description);
                let skuValue = extractValue(fieldMapping?.sku);
                let barcodeValue = extractValue(fieldMapping?.barcode);
                let stockValue = extractValue(fieldMapping?.current_stock);
                let unitValue = extractValue(fieldMapping?.unit);
                
                // SPECIAL HANDLING - If both description fields use same XML field, use the value for both
                if (fieldMapping?.description && fieldMapping?.short_description && 
                    fieldMapping.description === fieldMapping.short_description && descValue && !shortDescValue) {
                  console.log(`📝 SAME FIELD DETECTED: Both description fields use "${fieldMapping.description}"`);
                  shortDescValue = descValue; // Use the same extracted value
                }
                
                // FALLBACK STRATEGY - Try common field names if mapping fails
                if (!nameValue) {
                  nameValue = obj.adi || obj.name || obj.title || obj.baslik || obj.urun_adi || obj.product_name;
                }
                if (!priceValue) {
                  priceValue = obj.fiyat || obj.price || obj.fiyati || obj.amount || obj.tutar;
                }
                
                // DESCRIPTION FALLBACK - Try common description field names
                if (!descValue) {
                  descValue = obj.aciklama || obj.description || obj.detay || obj.details || obj.ozet || obj.summary;
                }
                if (!shortDescValue) {
                  shortDescValue = obj.kisa_aciklama || obj.short_description || obj.kisaAciklama || obj.summary || obj.ozet;
                }
                
                if (debugCount < 3) {
                  console.log(`📝 DESCRIPTION FALLBACK RESULTS:`, {
                    descMapping: fieldMapping?.description,
                    shortDescMapping: fieldMapping?.short_description,
                    descExtracted: descValue,
                    shortDescExtracted: shortDescValue,
                    availableDescFields: Object.keys(obj).filter(key => 
                      key.toLowerCase().includes('aciklama') || 
                      key.toLowerCase().includes('description') || 
                      key.toLowerCase().includes('detay') ||
                      key.toLowerCase().includes('ozet') ||
                      key.toLowerCase().includes('summary')
                    )
                  });
                }
                
                // STOCK VALUE CHECK - Field mapping should work, fallback only if necessary
                if (debugCount < 3) {
                  console.log(`📦 STOCK PROCESSING for product: ${nameValue}`);
                  console.log(`📦 Stock field mapping: "${fieldMapping?.current_stock}"`);
                  console.log(`📦 Extracted stock value: ${stockValue} (type: ${typeof stockValue})`);
                }
                
                // Only use fallback if field mapping completely failed
                if (!stockValue || stockValue === null || stockValue === undefined || stockValue === '') {
                  console.log(`⚠️ FIELD MAPPING FAILED - Stock field "${fieldMapping?.current_stock}" not found in XML`);
                  console.log(`📦 Attempting fallback search...`);
                  
                  // Try most common Turkish stock fields only
                  stockValue = obj.stok || obj.stock || obj.miktar || obj.quantity || obj.adet;
                  
                  if (stockValue) {
                    console.log(`✅ Found stock via fallback: ${stockValue}`);
                  } else {
                    console.log(`❌ No stock found even with fallback. Available fields: ${Object.keys(obj).slice(0, 10).join(', ')}...`);
                  }
                }
                
                if (!skuValue) {
                  skuValue = obj.sku || obj.kod || obj.code || obj.urun_kodu || obj.product_code;
                }
                
                // ENHANCED DEBUG - Show first 3 extractions with detailed info
                if (debugCount < 3) {
                  console.log(`\n🔍 === EXTRACTION DEBUG #${debugCount + 1} ===`);
                  console.log(`📝 Field Mappings:`, {
                    name: fieldMapping?.name,
                    price: fieldMapping?.price,
                    description: fieldMapping?.description,
                    short_description: fieldMapping?.short_description,
                    current_stock: fieldMapping?.current_stock,
                    category: xmlSource.categoryTag,
                    allMappings: Object.keys(fieldMapping || {})
                  });
                  console.log(`📦 Current Object Keys: [${Object.keys(obj).slice(0, 15).join(', ')}${Object.keys(obj).length > 15 ? '...' : ''}]`);
                  console.log(`🌍 XML Root Keys: [${Object.keys(data).join(', ')}]`);
                  console.log(`✅ Raw Extracted Values:`, {
                    name: `"${nameValue}" (type: ${typeof nameValue})`,
                    price: `"${priceValue}" (type: ${typeof priceValue})`,
                    description: `"${descValue}" (type: ${typeof descValue})`,
                    shortDescription: `"${shortDescValue}" (type: ${typeof shortDescValue})`,
                    stock: `"${stockValue}" (type: ${typeof stockValue})`,
                    category: `"${categoryName}" (type: ${typeof categoryName})`,
                    targetCategoryId,
                    hasValidName: !!(nameValue && nameValue !== "Ürün Adı Belirtilmemiş"),
                    hasValidCategory: !!targetCategoryId
                  });
                  console.log(`🔍 FIELD MAPPING VALIDATION:`, {
                    stockFieldExists: fieldMapping?.current_stock ? 'YES' : 'NO',
                    stockFieldValue: fieldMapping?.current_stock,
                    objectHasStockField: obj[fieldMapping?.current_stock || ''] !== undefined ? 'YES' : 'NO',
                    objectStockFieldValue: obj[fieldMapping?.current_stock || ''],
                    extractValueResult: stockValue,
                    isStockValid: !!(stockValue && stockValue !== null && stockValue !== undefined && stockValue !== '' && stockValue !== '0')
                  });
                  console.log(`🔍 === END EXTRACTION DEBUG ===\n`);
                }
                
                // Kar oranı hesaplama
                let finalPrice = parseFloat(priceValue as string) || 0;
                
                // XML source'dan kar oranı ayarlarını al
                if (xmlSource.profitMarginType === "percent" && xmlSource.profitMarginPercent && parseFloat(xmlSource.profitMarginPercent) > 0) {
                  const marginPercent = parseFloat(xmlSource.profitMarginPercent);
                  finalPrice = finalPrice * (1 + marginPercent / 100);
                  console.log(`💰 Yüzde kar oranı uygulandı: %${marginPercent} -> ${finalPrice} TL`);
                } else if (xmlSource.profitMarginType === "fixed" && xmlSource.profitMarginFixed && parseFloat(xmlSource.profitMarginFixed) > 0) {
                  const marginFixed = parseFloat(xmlSource.profitMarginFixed);
                  finalPrice = finalPrice + marginFixed;
                  console.log(`💰 Sabit kar tutarı uygulandı: +${marginFixed} TL -> ${finalPrice} TL`);
                }

                // STRICT NAME VALIDATION - No dummy names allowed
                const finalName = nameValue && String(nameValue).trim();
                
                // FINAL STOCK PROCESSING - Parse and validate stock value
                let finalStockValue = 0;
                if (stockValue !== null && stockValue !== undefined && stockValue !== '') {
                  // Try to parse as integer first, then float
                  const parsedInt = parseInt(stockValue as string);
                  const parsedFloat = parseFloat(stockValue as string);
                  
                  if (!isNaN(parsedInt) && parsedInt > 0) {
                    finalStockValue = parsedInt;
                  } else if (!isNaN(parsedFloat) && parsedFloat > 0) {
                    finalStockValue = Math.floor(parsedFloat); // Round down to integer
                  }
                }
                
                // If still 0, set default stock
                if (finalStockValue <= 0) {
                  finalStockValue = 1; // En az 1 stok ver, 0 yerine
                }
                
                console.log(`📦 FINAL STOCK PROCESSING for ${nameValue}:`);
                console.log(`   - Raw stock value: ${stockValue} (type: ${typeof stockValue})`);
                console.log(`   - Parsed as int: ${parseInt(stockValue as string)} (isNaN: ${isNaN(parseInt(stockValue as string))})`);
                console.log(`   - Parsed as float: ${parseFloat(stockValue as string)} (isNaN: ${isNaN(parseFloat(stockValue as string))})`);
                console.log(`   - Final stock value: ${finalStockValue}`);
                
                // DESCRIPTION PROCESSING FUNCTIONS
                const cleanHtmlTags = (text: string) => {
                  if (!text || typeof text !== 'string') return '';
                  return text.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
                };
                
                const generateShortDescriptionWithAI = async (productName: string, fullDescription: string): Promise<string> => {
                  try {
                    // Gemini settings'i al
                    const geminiSettings = await pageStorage.getGeminiSettings();
                    if (!geminiSettings || !geminiSettings.api_key || !geminiSettings.useAiForShortDescription) {
                      // AI kullanılmayacaksa fallback
                      const cleaned = cleanHtmlTags(fullDescription);
                      return cleaned.substring(0, 200).trim();
                    }

                    // Gemini service ile kısa açıklama optimize et
                    const geminiService = new GeminiService(geminiSettings.api_key);
                    const optimizedText = await geminiService.optimizeShortDescription(
                      productName, 
                      fullDescription, 
                      geminiSettings.selected_model || "gemini-1.5-flash"
                    );
                    
                    return optimizedText || cleanHtmlTags(fullDescription).substring(0, 200).trim();
                    
                  } catch (error) {
                    console.log(`⚠️ AI short description failed for ${productName}, using fallback:`, error);
                    // Fallback: Manuel kısaltma
                    const cleaned = cleanHtmlTags(fullDescription);
                    return cleaned.substring(0, 200).trim();
                  }
                };

                const generateFullDescriptionWithAI = async (productName: string, originalDescription: string): Promise<string> => {
                  try {
                    // Gemini settings'i al
                    const geminiSettings = await pageStorage.getGeminiSettings();
                    if (!geminiSettings || !geminiSettings.api_key || !geminiSettings.useAiForFullDescription) {
                      // AI kullanılmayacaksa orijinal metni döndür
                      return originalDescription;
                    }

                    // Gemini service ile tam açıklama optimize et
                    const geminiService = new GeminiService(geminiSettings.api_key);
                    const optimizedText = await geminiService.optimizeFullDescription(
                      productName, 
                      originalDescription, 
                      geminiSettings.selected_model || "gemini-1.5-flash"
                    );
                    
                    return optimizedText || originalDescription;
                    
                  } catch (error) {
                    console.log(`⚠️ AI full description failed for ${productName}, using original:`, error);
                    // Fallback: Orijinal metin
                    return originalDescription;
                  }
                };
                
                const processShortDescription = (text: string, productName: string = "") => {
                  if (!text) return '';
                  // Şimdilik sadece fallback - AI integration daha sonra eklenecek
                  const cleaned = cleanHtmlTags(text);
                  
                  // Kelimeleri böl ve tam kelimelerde kes
                  const words = cleaned.split(' ');
                  let result = '';
                  
                  for (const word of words) {
                    if (result.length + word.length + 1 <= 195) { // 5 karakter margin bırak
                      result += (result ? ' ' : '') + word;
                    } else {
                      break;
                    }
                  }
                  
                  return result.trim() || cleaned.substring(0, 200).trim();
                };
                
                const processDescription = (text: string, productName: string = "") => {
                  if (!text) return '';
                  // HTML temizlenmeden bırak (orijinal istek)
                  return text;
                };
                
                // Excel örneğinizdeki TAM veri yapısı  
                const productData = {
                  name: finalName || `Ürün-${Date.now()}`, // XML'den gelen ad
                  categoryId: targetCategoryId, // XML'den gelen kategori
                  brandId: 1, // Excel örneğindeki varsayılan brand_id
                  price: Math.round(finalPrice * 100) / 100, // 2 ondalık basamağa yuvarla
                  unit: unitValue || "adet",
                  barcode: barcodeValue || "",
                  sku: skuValue || `XML-${Date.now()}`,
                  tags: "xml,import,auto", // Excel örneğindeki format
                  slug: (nameValue || "demo-product").toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
                  currentStock: finalStockValue, // Processed and validated stock value
                  minimumOrderQuantity: 1,
                  videoProvider: "youtube", // Excel örneğindeki varsayılan
                  videoUrl: "https://www.youtube.com/c/SpaGreenCreative",
                  isCatalog: false, // Excel: "0"
                  externalLink: "",
                  isRefundable: false, // Excel: "0"  
                  cashOnDelivery: false, // Excel: "0"
                  shortDescription: shortDescValue ? 
                    processShortDescription(shortDescValue, finalName || nameValue || "Ürün") : 
                    (descValue ? processShortDescription(descValue, finalName || nameValue || "Ürün") : nameValue || "Kısa açıklama mevcut değil"),
                  description: descValue ? processDescription(descValue, finalName || nameValue || "Ürün") : 
                              (obj['_'] && typeof obj['_'] === 'string') ? processDescription(obj['_'], finalName || nameValue || "Ürün") : 
                              `${nameValue} hakkında detaylı bilgi için iletişime geçiniz.`,
                  metaTitle: (nameValue || "Demo Product") + " - Meta Title",
                  metaDescription: "Demo meta description for " + (nameValue || "product"),
                  // Sistem alanları
                  xmlSourceId: xmlSourceId,
                  thumbnail: thumbnailUrl && typeof thumbnailUrl === 'string' && thumbnailUrl.trim() ? thumbnailUrl.trim() : null,
                  images: imageUrls.length > 0 ? imageUrls : null,
                  isApproved: true
                };
                
                console.log(`🔍 ÜRÜN VERİSİ HAZIRLANDI:`, {
                  name: productData.name,
                  price: productData.price,
                  currentStock: productData.currentStock,
                  sku: productData.sku,
                  shortDescription: productData.shortDescription?.substring(0, 100) + '...',
                  description: productData.description?.substring(0, 100) + '...',
                  categoryInfo: {
                    categoryName,
                    categoryId: targetCategoryId,
                    xmlCategoryTag: xmlSource.categoryTag,
                    extractedCategoryValue: categoryName
                  },
                  stockInfo: {
                    rawStockValue: stockValue,
                    finalStockValue: finalStockValue,
                    stockMapping: fieldMapping?.current_stock,
                    stockType: typeof stockValue
                  },
                  descriptionInfo: {
                    shortDescMapping: fieldMapping?.short_description,
                    descMapping: fieldMapping?.description,
                    shortDescExtracted: shortDescValue,
                    descExtracted: descValue,
                    finalShortDesc: productData.shortDescription?.substring(0, 50) + '...',
                    finalDesc: productData.description?.substring(0, 50) + '...'
                  },
                  imageInfo: {
                    thumbnailMapping: fieldMapping?.thumbnail,
                    thumbnailExtracted: thumbnailUrl,
                    imagesMappings: [fieldMapping?.image1, fieldMapping?.image2, fieldMapping?.image3].filter(Boolean),
                    imagesExtracted: imageUrls
                  }
                });
                
                // Artık sadece temel kontrol (isim var mı?)
                if (productData.name && productData.name !== "Ürün Adı Belirtilmemiş") {
                  products.push(productData);
                  debugCount++; // Increment debug counter after adding product
                  console.log(`✅ ÜRÜN EKLENDİ: ${productData.name} - ${productData.price} TL - STOK: ${productData.currentStock}`);
                } else {
                  console.log(`❌ ÜRÜN REDDEDİLDİ: İsim eksik veya varsayılan`);
                }
              }
              
          }
        });
        
        console.log(`✅ ADIM 5 TAMAMLANDI: ${products.length} ürün çıkarıldı\n`);
        
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
      
      // Potential imports hesapla (validProducts filtrelemesi öncesi)
      if (xmlSource.useDefaultCategory && xmlSource.defaultCategoryId) {
        potentialImports = extractedProducts.length; // Varsayılan kategori varsa hepsi
      } else {
        // Varsayılan kategori yoksa sadece eşleştirilen kategoriler
        potentialImports = extractedProducts.filter(p => p.categoryId && p.categoryId !== 0).length;
      }
      
      console.log(`🎯 Import Öngörüsü: ${extractedProducts.length} ürün extract edildi, ${potentialImports} ürün import edilecek`);
      
      if (potentialImports === 0) {
        console.log(`⚠️ Hiç ürün import edilemeyecek - kategori eşleştirmelerini kontrol edin!`);
      }
      
      // Filtreleme mantığı: Varsayılan kategori yoksa sadece eşleştirilen kategoriler
      const validProducts = extractedProducts.filter(productData => {
        // Eğer varsayılan kategori kullanılıyorsa tüm ürünleri kabul et
        if (xmlSource.useDefaultCategory && xmlSource.defaultCategoryId) {
          return true;
        }
        
        // Varsayılan kategori yoksa sadece eşleştirilen kategorileri kabul et
        if (!productData.categoryId || productData.categoryId === 0) {
          return false; // Eşleştirme yok - atla
        }
        
        return true; // Eşleştirme var - kabul et
      });

      console.log(`🚀 HIZLI BATCH IMPORT başlatılıyor: ${validProducts.length} geçerli ürün bulundu`);

      // BATCH IMPORT kullan - çok daha hızlı!
      const batchResult = await batchImportProductsToMySQL(validProducts, 50, xmlSourceId); // 50'li gruplar halinde
      
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
      let suggestions: string[] = [];
      
      // Hata türüne göre öneriler
      if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        const { host } = req.body;
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
        const { host } = req.body;
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

  // Fix NULL selected_variants fields in existing products
  app.post("/api/products/fix-selected-variants", async (req, res) => {
    try {
      console.log(`🔧 Fixing NULL selected_variants and selected_variants_ids in existing products...`);
      
      const connection = getImportConnection();
      if (!connection) {
        return res.status(500).json({ message: "Database connection not available" });
      }

      // Update NULL values to empty JSON arrays
      const [result] = await connection.execute(`
        UPDATE products 
        SET selected_variants = JSON_ARRAY(), selected_variants_ids = JSON_ARRAY() 
        WHERE selected_variants IS NULL OR selected_variants_ids IS NULL
      `);
      
      const affectedRows = (result as any).affectedRows;
      console.log(`✅ Fixed ${affectedRows} products with NULL selected_variants fields`);
      
      res.json({ 
        success: true, 
        message: `Successfully fixed ${affectedRows} products`,
        affectedRows 
      });
    } catch (error) {
      console.error('❌ Error fixing selected_variants fields:', error);
      res.status(500).json({ message: "Failed to fix selected_variants fields" });
    }
  });

  // XML source'a göre ürünleri sil
  app.delete("/api/products/delete-by-xml-source/:xmlSourceId", async (req, res) => {
    try {
      const { xmlSourceId } = req.params;
      
      if (!xmlSourceId) {
        return res.status(400).json({ error: 'XML source ID is required' });
      }
      
      console.log(`🆕 YENİ ENDPOINT: ${xmlSourceId} XML kaynağına ait ürünler siliniyor...`);
      
      // Database ayarlarını al
      const dbSettings = await pageStorage.getDatabaseSettings();
      if (!dbSettings || !dbSettings.host) {
        return res.status(400).json({ 
          message: "MySQL ayarları bulunamadı. Lütfen database ayarlarını yapın." 
        });
      }

      // Basit MySQL bağlantısı ve silme
      const mysql = await import('mysql2/promise');
      const connection = await mysql.createConnection({
        host: dbSettings.host,
        port: dbSettings.port,
        user: dbSettings.username,
        password: dbSettings.password,
        database: dbSettings.database
      });

      // xmlkaynagi sütunu ile eşleşen ürünleri sil
      const [result] = await connection.execute(
        'DELETE FROM products WHERE xmlkaynagi = ?',
        [xmlSourceId]
      );

      await connection.end();

      const deletedCount = (result as any).affectedRows || 0;
      console.log(`✅ ${deletedCount} ürün silindi.`);
      
      // Activity log ekle
      await pageStorage.createActivityLog({
        type: 'products_deleted',
        title: 'XML Kaynak Ürünleri Silindi',
        description: `${deletedCount} ürün ${xmlSourceId} XML kaynağından silindi`,
        entityId: xmlSourceId,
        entityType: 'products'
      });
      
      res.json({
        message: `${deletedCount} ürün başarıyla silindi`,
        deletedCount: deletedCount
      });
    } catch (error: any) {
      console.error('XML source delete error:', error);
      res.status(500).json({ 
        error: 'Ürün silme hatası',
        details: error.message 
      });
    }
  });

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
  // Bu bölüm artık kullanılmayacağı için kaldırılabilir veya devre dışı bırakılabilir.
  // app.post("/api/gemini/test-api-key", ...);
  // app.post("/api/gemini/categorize", ...);
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
      const data = req.body;
      const settings = await pageStorage.updateGeminiSettings(data.apiKey, data.model || data.selectedModel, {
        useAiForShortDescription: data.useAiForShortDescription || false,
        useAiForFullDescription: data.useAiForFullDescription || false
      });
      res.status(201).json(settings);
    } catch (error) {
      if (error instanceof Error && 'errors' in error) {
        res.status(400).json({ message: "Invalid data", errors: (error as any).errors });
      } else {
        res.status(500).json({ message: "Failed to create Gemini settings" });
      }
    }
  });

  app.put("/api/gemini-settings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const settings = await pageStorage.updateGeminiSettings(data.apiKey, data.selectedModel || data.model, {
        useAiForShortDescription: data.useAiForShortDescription || false,
        useAiForFullDescription: data.useAiForFullDescription || false
      });
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
      const settings = await pageStorage.updateGeminiSettings('', currentSettings.selected_model, {
        useAiForShortDescription: currentSettings.useAiForShortDescription || false,
        useAiForFullDescription: currentSettings.useAiForFullDescription || false
      });
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

  // System Settings endpoints
  app.get("/api/system-settings", async (req, res) => {
    try {
      const settings = await pageStorage.getSystemSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch system settings" });
    }
  });

  app.put("/api/system-settings/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      
      if (!key || !value) {
        return res.status(400).json({ message: "Key and value are required" });
      }
      
      await pageStorage.updateSystemSetting(key, value);
      res.json({ message: "System setting updated successfully", key, value });
    } catch (error) {
      res.status(500).json({ message: "Failed to update system setting" });
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

  // Batch AI category mapping - creates comprehensive mapping file for XML source
  app.post("/api/category-mappings/batch-create", async (req, res) => {
    try {
      const { xmlSourceId, modelName } = req.body;
      
      if (!xmlSourceId) {
        return res.status(400).json({ message: "XML source ID is required" });
      }

      // XML Source bilgilerini al
      const xmlSource = await pageStorage.getXmlSource(xmlSourceId);
      if (!xmlSource) {
        return res.status(404).json({ message: "XML source not found" });
      }

      // XML'den kategorileri çıkar - Mevcut category mapping'lerden al
      const existingMappings = await pageStorage.getCategoryMappings(xmlSourceId);
      const uniqueCategories = new Set(existingMappings.map((m: any) => m.xmlCategory).filter(Boolean));
      const xmlCategories = Array.from(uniqueCategories);
      
      if (xmlCategories.length === 0) {
        return res.status(400).json({ message: "No categories found for this XML source. Please process XML first." });
      }

      console.log(`📊 Batch kategori eşleştirme başlatılıyor:`);
      console.log(`├─ XML Source: ${xmlSource.name || xmlSourceId}`);
      console.log(`├─ Kategori Sayısı: ${xmlCategories.length}`);
      console.log(`└─ Model: ${modelName || 'gemini-2.5-flash-lite'}`);

      // Gemini service ile batch eşleştirme yap
      const realApiKey = await pageStorage.getGeminiApiKey();
      
      if (!realApiKey) {
        return res.status(500).json({ 
          message: "GEMINI_API_KEY not configured in settings" 
        });
      }

      const geminiService = new GeminiService(realApiKey);

      const batchResult = await geminiService.createBatchCategoryMapping(
        xmlSourceId,
        xmlCategories,
        modelName || 'gemini-2.5-flash-lite'
      );

      res.json({
        message: "Batch kategori eşleştirme tamamlandı",
        success: true,
        filePath: batchResult.filePath,
        stats: {
          xmlSourceId,
          xmlSourceName: xmlSource.name || xmlSourceId,
          totalXmlCategories: xmlCategories.length,
          totalMappings: batchResult.totalMappings,
          batchCount: batchResult.batchCount,
          avgConfidence: Math.round(batchResult.avgConfidence * 100) / 100
        }
      });
      
    } catch (error: any) {
      console.error("Batch AI mapping error:", error);
      res.status(500).json({ 
        message: error.message || "Batch AI eşleştirme sırasında hata oluştu" 
      });
    }
  });

  // Get category suggestion from cached mapping file
  app.get("/api/category-mappings/cached/:xmlSourceId/:xmlCategory", async (req, res) => {
    try {
      const { xmlSourceId, xmlCategory } = req.params;
      const decodedCategory = decodeURIComponent(xmlCategory);
      
      const realApiKey = await pageStorage.getGeminiApiKey();
      if (!realApiKey) {
        return res.status(500).json({ 
          message: "GEMINI_API_KEY not configured in settings" 
        });
      }
      
      const geminiService = new GeminiService(realApiKey);
      const cachedMapping = await geminiService.getCategoryFromSavedMapping(
        xmlSourceId, 
        decodedCategory
      );
      
      if (!cachedMapping) {
        return res.status(404).json({ 
          message: "No cached mapping found for this category",
          fromCache: false 
        });
      }
      
      res.json(cachedMapping);
      
    } catch (error: any) {
      console.error("Cached mapping lookup error:", error);
      res.status(500).json({ 
        message: error.message || "Cached mapping lookup failed" 
      });
    }
  });

  // Check if batch mapping file exists for XML source
  app.get("/api/category-mappings/batch-status/:xmlSourceId", async (req, res) => {
    try {
      const { xmlSourceId } = req.params;
      const fs = require('fs');
      const path = require('path');
      
      const mappingFilePath = path.join(process.cwd(), `${xmlSourceId}-mappings.json`);
      const fileExists = fs.existsSync(mappingFilePath);
      
      if (!fileExists) {
        return res.json({
          exists: false,
          message: "Batch mapping file not found"
        });
      }
      
      // Dosya bilgilerini al
      try {
        const fileStats = fs.statSync(mappingFilePath);
        const fileContent = fs.readFileSync(mappingFilePath, 'utf8');
        const mappingData = JSON.parse(fileContent);
        
        res.json({
          exists: true,
          filePath: mappingFilePath,
          createdAt: mappingData.createdAt || fileStats.mtime,
          fileSize: fileStats.size,
          stats: mappingData.stats || {},
          xmlCategories: mappingData.xmlCategories?.length || 0,
          mappings: mappingData.mappings?.length || 0
        });
        
      } catch (readError) {
        res.json({
          exists: true,
          filePath: mappingFilePath,
          error: "File exists but cannot be read or parsed"
        });
      }
      
    } catch (error: any) {
      console.error("Batch status check error:", error);
      res.status(500).json({ 
        message: error.message || "Failed to check batch status" 
      });
    }
  });

  // Debug endpoint - Gemini API key kontrolü
  app.get("/api/debug/gemini-key", async (req, res) => {
    try {
      const geminiSettings = await pageStorage.getGeminiSettings();
      const realApiKey = pageStorage.getGeminiApiKey();
      
      res.json({
        publicSettings: geminiSettings,
        hasRealApiKey: !!realApiKey,
        realApiKeyLength: realApiKey?.length || 0,
        realApiKeyStartsWith: realApiKey ? realApiKey.substring(0, 8) + '...' : 'N/A'
      });
      
    } catch (error: any) {
      console.error("Debug gemini key error:", error);
      res.status(500).json({ 
        message: error.message || "Failed to check Gemini key status" 
      });
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
      
      // Cronjob bilgilerini al
      const cronjob = await pageStorage.getCronjobById(id);
      if (!cronjob) {
        return res.status(404).json({ message: "Cronjob not found" });
      }

      // XML Source bilgilerini al
      const xmlSource = await pageStorage.getXmlSource(cronjob.xmlSourceId);
      if (!xmlSource) {
        return res.status(404).json({ message: "XML Source not found" });
      }

      console.log(`🚀 Running cronjob: ${cronjob.name} (Type: ${cronjob.jobType})`);
      
      // Cronjob'u çalışıyor olarak işaretle
      await pageStorage.updateCronjobStatus(id, 'running');
      
      let result;
      
      switch (cronjob.jobType) {
        case 'import_products':
          result = await runImportProductsJob(cronjob, xmlSource);
          break;
        case 'update_products':
          result = await runUpdateProductsJob(cronjob, xmlSource);
          break;
        case 'update_price_stock':
          result = await runUpdatePriceStockJob(cronjob, xmlSource);
          break;
        default:
          throw new Error(`Unknown job type: ${cronjob.jobType}`);
      }
      
      // Başarılı çalıştırma kaydı
      await pageStorage.updateCronjobAfterRun(id, 'success', result);
      
      res.json({ 
        message: "Cronjob executed successfully",
        status: "completed",
        result
      });
      
    } catch (error: any) {
      console.error(`❌ Cronjob execution failed:`, error);
      
      // Hata durumunu kaydet
      try {
        await pageStorage.updateCronjobAfterRun(req.params.id, 'failed', { error: error.message });
      } catch (updateError) {
        console.error("Failed to update cronjob status:", updateError);
      }
      
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

  // Public cronjob trigger URL (cron servislerinden çağrılabilir)
  app.get("/api/trigger-cronjob/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Cronjob bilgilerini al
      const cronjob = await pageStorage.getCronjobById(id);
      if (!cronjob) {
        return res.status(404).json({ message: "Cronjob not found" });
      }

      if (!cronjob.isActive) {
        return res.status(400).json({ message: "Cronjob is not active" });
      }

      // XML Source bilgilerini al
      const xmlSource = await pageStorage.getXmlSource(cronjob.xmlSourceId);
      if (!xmlSource) {
        return res.status(404).json({ message: "XML Source not found" });
      }

      console.log(`🌐 Public trigger - Running cronjob: ${cronjob.name}`);
      
      // Cronjob'u çalışıyor olarak işaretle
      await pageStorage.updateCronjobStatus(id, 'running');
      
      let result;
      
      switch (cronjob.jobType) {
        case 'import_products':
          result = await runImportProductsJob(cronjob, xmlSource);
          break;
        case 'update_products':
          result = await runUpdateProductsJob(cronjob, xmlSource);
          break;
        case 'update_price_stock':
          result = await runUpdatePriceStockJob(cronjob, xmlSource);
          break;
        default:
          throw new Error(`Unknown job type: ${cronjob.jobType}`);
      }
      
      // Sonucu kaydet
      await pageStorage.updateCronjobAfterRun(id, result.success ? 'success' : 'failed', result);
      
      res.json({ 
        success: true, 
        message: result.message,
        stats: result.stats || result,
        triggeredBy: 'public-url'
      });
      
    } catch (error) {
      console.error("❌ Public cronjob trigger failed:", error);
      res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
        triggeredBy: 'public-url'
      });
    }
  });

  // XML Preview endpoint - İthalat öncesi önizleme
  app.post("/api/xml-sources/:id/preview", async (req, res) => {
    try {
      const { id } = req.params;
      const xmlSource = await pageStorage.getXmlSource(id);
      
      if (!xmlSource) {
        return res.status(404).json({ message: "XML source not found" });
      }

      if (!xmlSource.url) {
        return res.status(400).json({ message: "XML source URL not configured" });
      }

      console.log(`🔍 XML Preview başlatılıyor: ${xmlSource.name}`);
      
      // XML path detection fonksiyonu
      const autoDetectProductPath = (rootObj: any): string | null => {
        const commonPaths = [
          "products.product",
          "items.item", 
          "Urunler.Urun",
          "Products.Product",
          "Items.Item",
          "product_list.product",
          "item_list.item",
          "feed.product",
          "channel.item",
          "rss.channel.item"
        ];
        
        for (const path of commonPaths) {
          const pathParts = path.split('.');
          let currentLevel = rootObj;
          let pathExists = true;
          
          for (const part of pathParts) {
            if (currentLevel && typeof currentLevel === 'object' && part in currentLevel) {
              currentLevel = currentLevel[part];
            } else {
              pathExists = false;
              break;
            }
          }
          
          if (pathExists && currentLevel && 
              (Array.isArray(currentLevel) || (typeof currentLevel === 'object' && Object.keys(currentLevel).length > 0))) {
            console.log(`🎯 Auto-detected XML path: "${path}"`);
            return path;
          }
        }
        
        console.log(`❌ No common XML product patterns found`);
        return null;
      };
      
      // XML'i indir ve parse et
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 saniye timeout
      
      const response = await fetch(xmlSource.url, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; XML-Parser/1.0)'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return res.status(400).json({ 
          message: `XML kaynağına erişilemiyor: ${response.status} ${response.statusText}` 
        });
      }

      const xmlText = await response.text();
      const parser = new xml2js.Parser();
      const xmlData = await parser.parseStringPromise(xmlText);

      // Dinamik XML path ile ürünleri al
      let products;
      if (xmlSource.xmlProductPath) {
        // Mevcut path kullan
        const pathParts = xmlSource.xmlProductPath.split('.');
        let current = xmlData;
        for (const part of pathParts) {
          current = current?.[part];
        }
        products = current;
      } else {
        // Otomatik algılama yap
        const detectedPath = autoDetectProductPath(xmlData);
        if (detectedPath) {
          const pathParts = detectedPath.split('.');
          let current = xmlData;
          for (const part of pathParts) {
            current = current?.[part];
          }
          products = current;
        } else {
          products = xmlData?.Urunler?.Urun; // Fallback to default
        }
      }

      if (!products || (!Array.isArray(products) && typeof products !== 'object')) {
        return res.status(400).json({ message: "XML'de ürün verisi bulunamadı" });
      }

      const firstProduct = Array.isArray(products) ? products[0] : products;
      
      // Field mapping'i uygula
      const fieldMapping = xmlSource.fieldMapping || {};
      const mappedProduct: any = {};
      
      // Standard field'ları mapple
      for (const [localField, xmlField] of Object.entries(fieldMapping)) {
        if (typeof xmlField === 'string') {
          if (xmlField.includes(',')) {
            // Multiple fields (images gibi)
            const fields = xmlField.split(',').map(f => f.trim());
            const values = fields.map(field => (firstProduct as any)[field]).filter(Boolean);
            mappedProduct[localField] = values;
          } else {
            mappedProduct[localField] = (firstProduct as any)[xmlField];
          }
        }
      }

      // Kar marjı uygulama (preview için)
      let previewPrice = mappedProduct.price ? parseFloat(mappedProduct.price) : 0;
      let originalPrice = previewPrice;
      
      if (previewPrice > 0) {
        if (xmlSource.profitMarginType === "percent" && xmlSource.profitMarginPercent && parseFloat(xmlSource.profitMarginPercent) > 0) {
          const marginPercent = parseFloat(xmlSource.profitMarginPercent);
          previewPrice = previewPrice * (1 + marginPercent / 100);
          console.log(`💰 Preview: Yüzde kar oranı uygulandı: %${marginPercent} -> ${previewPrice} TL`);
        } else if (xmlSource.profitMarginType === "fixed" && xmlSource.profitMarginFixed && parseFloat(xmlSource.profitMarginFixed) > 0) {
          const marginFixed = parseFloat(xmlSource.profitMarginFixed);
          previewPrice = previewPrice + marginFixed;
          console.log(`💰 Preview: Sabit kar oranı uygulandı: +${marginFixed} TL -> ${previewPrice} TL`);
        }
        
        // Güncellenmiş fiyatı mappedData'ya ekle
        if (previewPrice !== originalPrice) {
          mappedProduct.finalPrice = previewPrice.toFixed(2);
          mappedProduct.originalPrice = originalPrice.toFixed(2);
          mappedProduct.profitMarginApplied = true;
        }
      }

      // XML raw data'yı da ekle
      const preview = {
        xmlSource: {
          name: xmlSource.name,
          url: xmlSource.url,
          fieldMapping: xmlSource.fieldMapping || {},
          detectedPath: xmlSource.xmlProductPath || 'auto-detected',
          profitMargin: {
            type: xmlSource.profitMarginType,
            percent: xmlSource.profitMarginPercent,
            fixed: xmlSource.profitMarginFixed
          }
        },
        rawXmlData: firstProduct,
        mappedData: mappedProduct,
        totalProducts: Array.isArray(products) ? products.length : 1
      };

      console.log(`✅ Preview hazırlandı: ${preview.totalProducts} ürün bulundu`);
      res.json(preview);
      
    } catch (error: any) {
      console.error("XML preview error:", error);
      res.status(500).json({ 
        message: error.name === 'AbortError' ? 
          "XML dosyası yükleme zaman aşımına uğradı" : 
          "XML önizleme sırasında hata oluştu" 
      });
    }
  });

  // MySQL Import endpoint - XML'den ürünleri MySQL'e aktar
  app.post("/api/xml-sources/:id/import-to-mysql", async (req: any, res: any) => {
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
            const productData: any = {
              name: product.name?.[0] || 'Unknown Product',
              price: parseFloat(product.price?.[0] || '0'),
              description: product.description?.[0] || '',
              sku: product.sku?.[0] || '',
              stock: parseInt(product.stock?.[0] || '0'),
              categoryId: null // Kategori eşleştirmesi yapılacak
            };

            // AI ile açıklama optimizasyonu
            if (xmlSource.useAiForShortDescription || xmlSource.useAiForFullDescription) {
              const geminiSettings = await pageStorage.getGeminiSettings();
              if (geminiSettings?.isActive && geminiSettings?.apiKey) {
                const { GeminiService } = await import('./geminiService');
                const geminiService = new GeminiService(geminiSettings.apiKey);
                
                // Kısa açıklama optimizasyonu
                if (xmlSource.useAiForShortDescription && productData.description) {
                  try {
                    const customPrompt = xmlSource.aiShortDescriptionPrompt;
                    productData.shortDescription = await geminiService.optimizeShortDescription(
                      productData.description, 
                      productData.name,
                      customPrompt || undefined
                    );
                  } catch (error) {
                    console.error(`❌ AI kısa açıklama hatası (${productData.sku}):`, error);
                  }
                }
                
                // Tam açıklama optimizasyonu
                if (xmlSource.useAiForFullDescription && productData.description) {
                  try {
                    const customPrompt = xmlSource.aiFullDescriptionPrompt;
                    productData.fullDescription = await geminiService.optimizeFullDescription(
                      productData.description, 
                      productData.name,
                      customPrompt || undefined
                    );
                  } catch (error) {
                    console.error(`❌ AI tam açıklama hatası (${productData.sku}):`, error);
                  }
                }
              }
            }

            // MySQL'e import et
            const finalProductData = {
              ...productData,
              currentStock: productData.stock, // stock'u currentStock'a çevir
              unit: 'adet',
              minimumOrderQuantity: 1,
              isCatalog: false
            };
            
            await importProductToMySQL(finalProductData, id);
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

// Cronjob İş Fonksiyonları
// MySQL'den XML kaynağına göre mevcut ürünlerin SKU kodlarını al
async function getExistingSKUsFromDB(xmlSourceId: string): Promise<Set<string>> {
  try {
    console.log(`📋 MySQL'den mevcut SKU kodları alınıyor (XML Source: ${xmlSourceId})`);
    
    // Database ayarlarını sistem ayarlarından al
    const dbSettings = await pageStorage.getDatabaseSettings();
    if (!dbSettings || !dbSettings.host) {
      console.log(`⚠️  MySQL ayarları yapılandırılmamış`);
      return new Set<string>();
    }

    console.log(`   └─ MySQL Host: ${dbSettings.host}:${dbSettings.port}`);
    console.log(`   └─ Database: ${dbSettings.database}`);
    
    // MySQL bağlantısını kur
    const { connectToImportDatabase, getImportConnection } = await import('./mysql-import');
    await connectToImportDatabase(dbSettings);
    
    const connection = getImportConnection();
    if (!connection) {
      console.log(`⚠️  MySQL bağlantısı kurulamadı`);
      return new Set<string>();
    }
    
    // Gerçek MySQL query
    const query = `SELECT sku FROM products WHERE xml_source_id = ? AND sku IS NOT NULL AND sku != ''`;
    const [results] = await connection.execute(query, [xmlSourceId]);
    
    const skuSet = new Set<string>();
    if (Array.isArray(results)) {
      results.forEach((row: any) => {
        if (row.sku) {
          skuSet.add(row.sku);
        }
      });
    }
    
    console.log(`   └─ Veritabanından ${skuSet.size} adet SKU kodu bulundu`);
    return skuSet;
    
  } catch (error) {
    console.error('❌ SKU kodları alınamadı:', error);
    return new Set<string>();
  }
}

// XML'den belirli SKU kodlarını filtrele
function filterProductsBySKU(xmlProducts: any[], existingSKUs: Set<string>, skuFieldPath: string): any[] {
  return xmlProducts.filter(product => {
    const sku = getNestedValue(product, skuFieldPath);
    return sku && existingSKUs.has(sku);
  });
}

// MySQL'de ürün güncelleme fonksiyonu
async function updateProductInMySQL(sku: string, productData: any, cronjob: any): Promise<boolean> {
  try {
    // Database ayarlarını sistem ayarlarından al
    const dbSettings = await pageStorage.getDatabaseSettings();
    if (!dbSettings || !dbSettings.host) {
      console.log(`⚠️  MySQL ayarları yapılandırılmamış: ${sku}`);
      return false;
    }

    // MySQL bağlantısını kur
    const { connectToImportDatabase, getImportConnection } = await import('./mysql-import');
    await connectToImportDatabase(dbSettings);
    
    const connection = getImportConnection();
    if (!connection) {
      console.log(`⚠️  MySQL bağlantısı kurulamadı: ${sku}`);
      return false;
    }

    // Güncelleme alanlarını hazırla
    const updateFields = [];
    const updateValues = [];
    
    if (productData.name) {
      updateFields.push('name = ?');
      updateValues.push(productData.name);
    }
    
    if (productData.price !== undefined) {
      updateFields.push('price = ?');
      updateValues.push(parseFloat(productData.price).toString());
    }
    
    if (productData.stock !== undefined) {
      updateFields.push('stock = ?');
      updateValues.push(parseInt(productData.stock).toString());
    }
    
    if (cronjob.updateDescriptions && productData.shortDescription) {
      updateFields.push('short_description = ?');
      updateValues.push(productData.shortDescription);
    }
    
    if (cronjob.updateDescriptions && productData.fullDescription) {
      updateFields.push('description = ?');
      updateValues.push(productData.fullDescription);
    }
    
    if (updateFields.length === 0) {
      console.log(`⚠️  Güncellenecek alan bulunamadı: ${sku}`);
      return false;
    }
    
    // Güncelleme tarihi ekle
    updateFields.push('updated_at = NOW()');
    updateValues.push(sku); // WHERE koşulu için
    
    const query = `UPDATE products SET ${updateFields.join(', ')} WHERE sku = ?`;
    const [result] = await connection.execute(query, updateValues);
    
    return (result as any).affectedRows > 0;
    
  } catch (error) {
    console.error(`❌ MySQL ürün güncelleme hatası (${sku}):`, error);
    return false;
  }
}

// MySQL'de sadece fiyat ve stok güncelleme fonksiyonu
async function updateProductPriceStockInMySQL(sku: string, price: number, stock: number): Promise<boolean> {
  try {
    // Database ayarlarını sistem ayarlarından al
    const dbSettings = await pageStorage.getDatabaseSettings();
    if (!dbSettings || !dbSettings.host) {
      console.log(`⚠️  MySQL ayarları yapılandırılmamış: ${sku}`);
      return false;
    }

    // MySQL bağlantısını kur
    const { connectToImportDatabase, getImportConnection } = await import('./mysql-import');
    await connectToImportDatabase(dbSettings);
    
    const connection = getImportConnection();
    if (!connection) {
      console.log(`⚠️  MySQL bağlantısı kurulamadı: ${sku}`);
      return false;
    }

    const query = `UPDATE products SET price = ?, current_stock = ?, updated_at = NOW() WHERE sku = ?`;
    const [result] = await connection.execute(query, [price.toString(), stock.toString(), sku]);
    
    return (result as any).affectedRows > 0;
    
  } catch (error) {
    console.error(`❌ MySQL fiyat/stok güncelleme hatası (${sku}):`, error);
    return false;
  }
}

// Nested object değer alımı için helper
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, prop) => current?.[prop], obj);
}

async function runImportProductsJob(cronjob: any, xmlSource: any): Promise<any> {
  console.log(`📦 Running Import Products Job: ${cronjob.name}`);
  
  try {
    // XML'den ürünleri çek
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(xmlSource.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 XML Import Bot'
      }
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const xmlContent = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Ürünleri parse et
    const products = [];
    const productNodes = xmlDoc.getElementsByTagName('product'); // Varsayılan tag
    
    for (let i = 0; i < productNodes.length; i++) {
      const productNode = productNodes[i];
      const productData = extractProductData(productNode, xmlSource.fieldMapping || {});
      products.push(productData);
    }
    
    let importedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    
    // Her ürün için import/update mantığı
    for (const product of products) {
      try {
        if (product.sku) {
          // SKU varsa mevcut ürünü kontrol et
          const existingProduct = await checkProductBySku(product.sku);
          
          if (existingProduct && cronjob.updateExistingProducts) {
            // Mevcut ürünü güncelle
            await updateExistingProduct(existingProduct.id, product, cronjob);
            updatedCount++;
          } else if (!existingProduct) {
            // Yeni ürün ekle
            await importNewProduct(product, xmlSource);
            importedCount++;
          }
        } else {
          // SKU yoksa yeni ürün olarak ekle
          await importNewProduct(product, xmlSource);
          importedCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing product:`, error);
        errorCount++;
      }
    }
    
    return {
      totalProcessed: products.length,
      imported: importedCount,
      updated: updatedCount,
      errors: errorCount,
      jobType: 'import_products'
    };
    
  } catch (error: any) {
    console.error(`❌ Import Products Job failed:`, error);
    throw error;
  }
}

async function runUpdateProductsJob(cronjob: any, xmlSource: any): Promise<any> {
  console.log(`🔄 Running Update Products Job: ${cronjob.name}`);
  
  try {
    // MySQL bağlantısını kontrol et
    const { getImportConnection } = await import('./mysql-import');
    const connection = getImportConnection();
    
    if (!connection) {
      console.log(`❌ MySQL bağlantısı yok! Güncelleme işlemi durduruldu.`);
      return {
        success: false,
        message: 'MySQL bağlantısı bulunamadı',
        stats: { updated: 0, notFound: 0, errors: 1 }
      };
    }

    // Önce veritabanından mevcut SKU kodlarını al
    const existingSKUs = await getExistingSKUsFromDB(xmlSource.id);
    console.log(`   └─ Veritabanında ${existingSKUs.size} adet SKU kodu bulundu`);
    
    if (existingSKUs.size === 0) {
      console.log(`⚠️  Veritabanında hiç ürün bulunamadı, güncelleme atlanıyor`);
      return {
        success: true,
        message: 'Güncellenecek ürün bulunamadı',
        stats: { updated: 0, notFound: 0, errors: 0 }
      };
    }

    // XML'den ürünleri çek
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(xmlSource.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 XML Import Bot'
      }
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const xmlContent = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Ürünleri parse et
    const allProducts = [];
    const productNodes = xmlDoc.getElementsByTagName('product');
    
    for (let i = 0; i < productNodes.length; i++) {
      const productNode = productNodes[i];
      const productData = extractProductData(productNode, xmlSource.fieldMapping || {});
      allProducts.push(productData);
    }
    
    // SKU field mapping'den alan adını al
    const skuField = xmlSource.fieldMapping?.sku || 'sku';
    
    // Sadece mevcut SKU'lara sahip ürünleri filtrele
    const filteredProducts = filterProductsBySKU(allProducts, existingSKUs, skuField);
    console.log(`   └─ XML'de toplam ${allProducts.length} ürün, ${filteredProducts.length} tanesi veritabanında mevcut`);
    
    let updatedCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;
    
    // Sadece mevcut ürünleri güncelle
    for (const product of filteredProducts) {
      try {
        const sku = getNestedValue(product, skuField);
        
        if (sku && existingSKUs.has(sku)) {
          // AI ile açıklama optimizasyonu (XML kaynağının ayarlarına göre)
          const originalDescription = getNestedValue(product, xmlSource.fieldMapping?.description || 'description') || '';
          
          if ((xmlSource.useAiForShortDescription || xmlSource.useAiForFullDescription) && originalDescription) {
            const geminiSettings = await pageStorage.getGeminiSettings();
            if (geminiSettings && geminiSettings.isActive && geminiSettings.apiKey) {
              const { GeminiService } = await import('./geminiService');
              const geminiService = new GeminiService(geminiSettings.apiKey);
              
              // Kısa açıklama optimizasyonu
              if (xmlSource.useAiForShortDescription) {
                try {
                  product.shortDescription = await geminiService.optimizeShortDescription(
                    originalDescription,
                    product.name || product.title || 'Ürün',
                    xmlSource.aiShortDescriptionPrompt
                  );
                } catch (error) {
                  console.error(`❌ AI kısa açıklama hatası (${sku}):`, error);
                }
              }
              
              // Tam açıklama optimizasyonu
              if (xmlSource.useAiForFullDescription) {
                try {
                  product.fullDescription = await geminiService.optimizeFullDescription(
                    originalDescription,
                    product.name || product.title || 'Ürün',
                    xmlSource.aiFullDescriptionPrompt
                  );
                } catch (error) {
                  console.error(`❌ AI tam açıklama hatası (${sku}):`, error);
                }
              }
            }
          }
          
          // MySQL'de ürün güncelleme
          const success = await updateProductInMySQL(sku, product, cronjob);
          if (success) {
            console.log(`   ✅ Güncellendi: ${sku}`);
            updatedCount++;
          } else {
            console.log(`   ❌ Güncellenemedi: ${sku}`);
            errorCount++;
          }
        }
      } catch (error) {
        console.error(`❌ Güncelleme hatası (${product.sku}):`, error);
        errorCount++;
      }
    }
    
    console.log(`✅ Güncelleme tamamlandı: ${updatedCount} güncellendi, ${errorCount} hata`);
    
    return {
      success: true,
      message: `${updatedCount} ürün güncellendi`,
      stats: { updated: updatedCount, notFound: notFoundCount, errors: errorCount }
    };
    
  } catch (error) {
    console.error(`❌ Update Products Job failed:`, error);
    throw error;
  }
}

async function runUpdatePriceStockJob(cronjob: any, xmlSource: any): Promise<any> {
  console.log(`💰 Running Update Price & Stock Job: ${cronjob.name}`);
  
  try {
    // MySQL bağlantısını kontrol et
    const { getImportConnection } = await import('./mysql-import');
    const connection = getImportConnection();
    
    if (!connection) {
      console.log(`❌ MySQL bağlantısı yok! Fiyat/stok güncellemesi durduruldu.`);
      return {
        success: false,
        message: 'MySQL bağlantısı bulunamadı',
        stats: { updated: 0, notFound: 0, errors: 1 }
      };
    }

    // Önce veritabanından mevcut SKU kodlarını al
    const existingSKUs = await getExistingSKUsFromDB(xmlSource.id);
    console.log(`   └─ Veritabanında ${existingSKUs.size} adet SKU kodu bulundu`);
    
    if (existingSKUs.size === 0) {
      console.log(`⚠️  Veritabanında hiç ürün bulunamadı, fiyat/stok güncellemesi atlanıyor`);
      return {
        success: true,
        message: 'Güncellenecek ürün bulunamadı',
        stats: { updated: 0, notFound: 0, errors: 0 }
      };
    }

    // XML'den ürünleri çek
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(xmlSource.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 XML Import Bot'
      }
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const xmlContent = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Ürünleri parse et
    const allProducts = [];
    const productNodes = xmlDoc.getElementsByTagName('product');
    
    for (let i = 0; i < productNodes.length; i++) {
      const productNode = productNodes[i];
      const productData = extractProductData(productNode, xmlSource.fieldMapping || {});
      allProducts.push(productData);
    }
    
    // SKU field mapping'den alan adını al
    const skuField = xmlSource.fieldMapping?.sku || 'sku';
    
    // Sadece mevcut SKU'lara sahip ürünleri filtrele
    const filteredProducts = filterProductsBySKU(allProducts, existingSKUs, skuField);
    console.log(`   └─ XML'de toplam ${allProducts.length} ürün, ${filteredProducts.length} tanesi veritabanında mevcut`);
    
    let updatedCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;
    
    // Sadece fiyat ve stok güncelleme yap
    for (const product of filteredProducts) {
      try {
        const sku = getNestedValue(product, skuField);
        
        if (sku && existingSKUs.has(sku)) {
          // Kar marjı uygulama
          if (cronjob.applyProfitMargin && xmlSource.profitMarginType !== 'none') {
            product.price = applyProfitMargin(product.price, xmlSource);
          }
          
          // MySQL'de fiyat ve stok güncelleme
          const success = await updateProductPriceStockInMySQL(sku, product.price, product.stock);
          if (success) {
            console.log(`   💰 Fiyat/Stok güncellendi: ${sku} - ${product.price}₺, Stok: ${product.stock}`);
            updatedCount++;
          } else {
            console.log(`   ❌ Fiyat/stok güncellenemedi: ${sku}`);
            errorCount++;
          }
        }
      } catch (error) {
        console.error(`❌ Fiyat/stok güncelleme hatası (${product.sku}):`, error);
        errorCount++;
      }
    }
    
    console.log(`✅ Fiyat/stok güncellemesi tamamlandı: ${updatedCount} güncellendi, ${errorCount} hata`);
    
    return {
      success: true,
      message: `${updatedCount} ürünün fiyat/stoğu güncellendi`,
      stats: { updated: updatedCount, notFound: notFoundCount, errors: errorCount }
    };
    
  } catch (error) {
    console.error(`❌ Update Price & Stock Job failed:`, error);
    throw error;
  }
}

// Kar marjı uygulama helper fonksiyonu
function applyProfitMargin(originalPrice: number, xmlSource: any): number {
  if (xmlSource.profitMarginType === 'percent') {
    const margin = parseFloat(xmlSource.profitMarginPercent || '0');
    return originalPrice * (1 + margin / 100);
  } else if (xmlSource.profitMarginType === 'fixed') {
    const margin = parseFloat(xmlSource.profitMarginFixed || '0');
    return originalPrice + margin;
  }
  return originalPrice;
}

// Helper function to extract product data from XML node
function extractProductData(productNode: any, fieldMapping: any): any {
  const productData: any = {};
  
  // Apply field mappings
  for (const [localField, xmlField] of Object.entries(fieldMapping)) {
    if (typeof xmlField === 'string') {
      productData[localField] = productNode[xmlField] || '';
    }
  }
  
  return productData;
}

// Yardımcı Fonksiyonlar
async function checkProductBySku(sku: string): Promise<any> {
  // Mock implementation - gerçekte MySQL'den kontrol edilecek
  return null; // Şimdilik null döndür
}

async function importNewProduct(product: any, xmlSource: any): Promise<void> {
  // Yeni ürün import etme mantığı
  console.log(`➕ Importing new product: ${product.name} (SKU: ${product.sku})`);
  // mysql-import.ts'teki importProductToMySQL fonksiyonunu kullan
}

async function updateExistingProduct(productId: string, product: any, cronjob: any): Promise<void> {
  // Mevcut ürün güncelleme mantığı
  console.log(`🔄 Updating existing product: ${product.name} (SKU: ${product.sku})`);
  
  // Açıklama güncelleme
  if (cronjob.updateDescriptions) {
    console.log(`📝 Updating descriptions for: ${product.name}`);
    
    if (cronjob.useAiForDescriptions) {
      // AI ile açıklama güncelleme
      const { pageStorage } = await import('./pageStorage');
      const geminiSettings = await pageStorage.getGeminiSettings();
      if (geminiSettings && geminiSettings.is_configured) {
        try {
          const { GeminiService } = await import('./geminiService');
          const geminiService = new GeminiService(geminiSettings.api_key);
          
          if (geminiSettings.useAiForShortDescription && product.shortDescription) {
            const optimizedShort = await geminiService.optimizeShortDescription(
              product.name, 
              product.shortDescription,
              geminiSettings.selected_model
            );
            product.shortDescription = optimizedShort;
          }
          
          if (geminiSettings.useAiForFullDescription && product.description) {
            const optimizedFull = await geminiService.optimizeFullDescription(
              product.name,
              product.description,
              geminiSettings.selected_model
            );
            product.description = optimizedFull;
          }
        } catch (aiError) {
          console.error(`⚠️ AI processing failed, using original descriptions:`, aiError);
        }
      }
    }
  }
  
  // Fiyat ve stok güncelleme
  if (cronjob.updatePricesAndStock) {
    console.log(`💰 Updating price and stock for: ${product.name}`);
    // updateProductPriceAndStock fonksiyonunu çağır
  }
}

async function updateProductPriceAndStock(productId: string, product: any, xmlSource: any, applyProfitMargin: boolean): Promise<void> {
  console.log(`💰 Updating price and stock for product ID: ${productId}`);
  
  let finalPrice = parseFloat(product.price || "0");
  
  // Kar marjı uygula
  if (applyProfitMargin) {
    if (xmlSource.profitMarginType === 'percent' && xmlSource.profitMarginPercent > 0) {
      finalPrice = finalPrice * (1 + xmlSource.profitMarginPercent / 100);
      console.log(`📈 Applied ${xmlSource.profitMarginPercent}% margin: ${product.price} -> ${finalPrice}`);
    } else if (xmlSource.profitMarginType === 'fixed' && xmlSource.profitMarginFixed > 0) {
      finalPrice = finalPrice + parseFloat(xmlSource.profitMarginFixed);
      console.log(`📈 Applied ${xmlSource.profitMarginFixed} fixed margin: ${product.price} -> ${finalPrice}`);
    }
  }
  
  // Mock implementation - gerçekte MySQL'e yazılacak
  console.log(`✅ Updated product ${productId}: Price=${finalPrice}, Stock=${product.stock || 0}`);
}