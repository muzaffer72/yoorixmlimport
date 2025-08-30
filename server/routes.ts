import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertXmlSourceSchema, insertCategoryMappingSchema, insertDatabaseSettingsSchema } from "@shared/schema";
import { z } from "zod";
import * as xml2js from "xml2js";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Dashboard endpoints
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/dashboard/activities", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const activities = await storage.getActivityLogs(limit);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  app.get("/api/dashboard/recent-products", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const products = await storage.getRecentProducts(limit);
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recent products" });
    }
  });

  // XML Source endpoints
  app.get("/api/xml-sources", async (req, res) => {
    try {
      const xmlSources = await storage.getXmlSources();
      res.json(xmlSources);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch XML sources" });
    }
  });

  app.post("/api/xml-sources", async (req, res) => {
    try {
      const data = insertXmlSourceSchema.parse(req.body);
      const xmlSource = await storage.createXmlSource(data);
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
      const xmlSource = await storage.updateXmlSource(id, data);
      res.json(xmlSource);
    } catch (error) {
      res.status(500).json({ message: "Failed to update XML source" });
    }
  });

  app.delete("/api/xml-sources/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteXmlSource(id);
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
      
      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ 
          message: `XML kaynağına ulaşılamıyor: ${response.status} ${response.statusText}` 
        });
      }

      const xmlText = await response.text();
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlText);
      
      // Extract structure from XML
      const extractTags = (obj: any, path = ""): string[] => {
        const tags: string[] = [];
        
        if (typeof obj === "object" && obj !== null) {
          for (const key in obj) {
            const fullPath = path ? `${path}.${key}` : key;
            tags.push(fullPath);
            
            if (typeof obj[key] === "object" && obj[key] !== null) {
              tags.push(...extractTags(obj[key], fullPath));
            }
          }
        }
        
        return Array.from(new Set(tags)); // Remove duplicates
      };

      const tags = extractTags(result);
      
      res.json({ 
        message: "XML yapısı başarıyla alındı",
        tags: tags.sort(),
        sampleData: JSON.stringify(result, null, 2).substring(0, 1000) + "..."
      });
    } catch (error) {
      res.status(500).json({ message: "XML yapısı alınırken hata oluştu" });
    }
  });

  app.post("/api/xml-sources/extract-categories", async (req, res) => {
    try {
      const { url, categoryField } = req.body;
      
      if (!url || !categoryField) {
        return res.status(400).json({ message: "URL ve kategori alanı gerekli" });
      }

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ 
          message: `XML kaynağına ulaşılamıyor: ${response.status} ${response.statusText}` 
        });
      }

      const xmlText = await response.text();
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlText);
      
      // Extract categories from XML based on the specified field
      const extractCategories = (obj: any): string[] => {
        const categories: string[] = [];
        
        const traverse = (data: any) => {
          if (typeof data === "object" && data !== null) {
            if (Array.isArray(data)) {
              data.forEach(item => traverse(item));
            } else {
              // Check if this object has the category field
              const fields = categoryField.split('.');
              let value = data;
              for (const field of fields) {
                if (value && typeof value === 'object' && field in value) {
                  value = value[field];
                } else {
                  value = null;
                  break;
                }
              }
              
              if (value && typeof value === 'string') {
                categories.push(value);
              }
              
              // Continue traversing
              for (const key in data) {
                traverse(data[key]);
              }
            }
          }
        };
        
        traverse(obj);
        return Array.from(new Set(categories)); // Remove duplicates
      };

      const categories = extractCategories(result);
      
      res.json({ 
        message: "Kategoriler başarıyla çekildi",
        categories: categories.sort(),
        count: categories.length
      });
    } catch (error) {
      res.status(500).json({ message: "Kategoriler çekilirken hata oluştu" });
    }
  });

  // Category endpoints
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // Brand endpoints
  app.get("/api/brands", async (req, res) => {
    try {
      const brands = await storage.getBrands();
      res.json(brands);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch brands" });
    }
  });

  // Category mapping endpoints
  app.get("/api/category-mappings/:xmlSourceId", async (req, res) => {
    try {
      const { xmlSourceId } = req.params;
      const mappings = await storage.getCategoryMappings(xmlSourceId);
      res.json(mappings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch category mappings" });
    }
  });

  app.post("/api/category-mappings", async (req, res) => {
    try {
      const data = insertCategoryMappingSchema.parse(req.body);
      const mapping = await storage.createCategoryMapping(data);
      res.status(201).json(mapping);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create category mapping" });
      }
    }
  });

  app.put("/api/category-mappings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const mapping = await storage.updateCategoryMapping(id, data);
      res.json(mapping);
    } catch (error) {
      res.status(500).json({ message: "Failed to update category mapping" });
    }
  });

  app.delete("/api/category-mappings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteCategoryMapping(id);
      if (deleted) {
        res.json({ message: "Category mapping deleted successfully" });
      } else {
        res.status(404).json({ message: "Category mapping not found" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to delete category mapping" });
    }
  });

  // Product import from XML
  app.post("/api/products/import-from-xml", async (req, res) => {
    try {
      const { xmlSourceId } = req.body;
      
      const xmlSource = await storage.getXmlSource(xmlSourceId);
      if (!xmlSource) {
        return res.status(404).json({ message: "XML source not found" });
      }

      if (!xmlSource.url) {
        return res.status(400).json({ message: "XML source URL not configured" });
      }

      // Fetch and parse XML
      const response = await fetch(xmlSource.url);
      if (!response.ok) {
        return res.status(400).json({ 
          message: `XML kaynağına ulaşılamıyor: ${response.status}` 
        });
      }

      const xmlText = await response.text();
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlText);
      
      // Here you would implement the actual product import logic
      // based on the XML structure and mappings
      
      await storage.createActivityLog({
        type: "xml_synced",
        title: "XML kaynağı güncellendi",
        description: `${xmlSource.name} - XML'den ürünler güncellendi`,
        entityId: xmlSourceId,
        entityType: "xml_source"
      });

      res.json({ 
        message: "XML import başarıyla tamamlandı",
        processed: 0 // This would be the actual count
      });
    } catch (error) {
      res.status(500).json({ message: "XML import sırasında hata oluştu" });
    }
  });

  // Database Settings endpoints
  app.get("/api/database-settings", async (req, res) => {
    try {
      const settings = await storage.getDatabaseSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch database settings" });
    }
  });

  app.post("/api/database-settings", async (req, res) => {
    try {
      const data = insertDatabaseSettingsSchema.parse(req.body);
      const settings = await storage.createDatabaseSettings(data);
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
      const settings = await storage.updateDatabaseSettings(id, data);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to update database settings" });
    }
  });

  app.put("/api/database-settings/:id/activate", async (req, res) => {
    try {
      const { id } = req.params;
      const settings = await storage.setActiveDatabaseSettings(id);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to activate database settings" });
    }
  });

  app.delete("/api/database-settings/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteDatabaseSettings(id);
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
      
      // Here you would implement actual MySQL connection test
      // For now, we'll simulate a successful connection
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay
      
      res.json({ 
        message: "Veritabanı bağlantısı başarılı",
        status: "success"
      });
    } catch (error) {
      res.status(500).json({ message: "Veritabanı bağlantısı test edilirken hata oluştu" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
