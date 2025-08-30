import { 
  type User, 
  type InsertUser,
  type XmlSource,
  type InsertXmlSource,
  type ActivityLog,
  type InsertActivityLog,
  type Product,
  type Category,
  type Brand,
  type CategoryMapping,
  type InsertCategoryMapping,
  type DatabaseSettings,
  type InsertDatabaseSettings
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // XML Source methods
  getXmlSources(): Promise<XmlSource[]>;
  getXmlSource(id: string): Promise<XmlSource | undefined>;
  createXmlSource(xmlSource: InsertXmlSource): Promise<XmlSource>;
  updateXmlSource(id: string, xmlSource: Partial<XmlSource>): Promise<XmlSource>;
  deleteXmlSource(id: string): Promise<boolean>;
  
  // Activity Log methods
  getActivityLogs(limit?: number): Promise<ActivityLog[]>;
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  clearOldLogs(): Promise<void>;
  
  // Product methods
  getProducts(limit?: number): Promise<Product[]>;
  getRecentProducts(limit?: number): Promise<Product[]>;
  createProduct(product: Partial<Product>): Promise<Product>;
  updateProduct(id: string, product: Partial<Product>): Promise<Product>;
  
  // Category and Brand methods
  getCategories(): Promise<Category[]>;
  getBrands(): Promise<Brand[]>;
  
  // Category Mapping methods
  getCategoryMappings(xmlSourceId: string): Promise<CategoryMapping[]>;
  createCategoryMapping(mapping: InsertCategoryMapping): Promise<CategoryMapping>;
  updateCategoryMapping(id: string, mapping: Partial<CategoryMapping>): Promise<CategoryMapping>;
  deleteCategoryMapping(id: string): Promise<boolean>;
  
  // Database Settings methods
  getDatabaseSettings(): Promise<DatabaseSettings[]>;
  createDatabaseSettings(settings: InsertDatabaseSettings): Promise<DatabaseSettings>;
  updateDatabaseSettings(id: string, settings: Partial<DatabaseSettings>): Promise<DatabaseSettings>;
  deleteDatabaseSettings(id: string): Promise<boolean>;
  setActiveDatabaseSettings(id: string): Promise<DatabaseSettings>;
  
  // Statistics
  getDashboardStats(): Promise<{
    todayAddedProducts: number;
    updatedProducts: number;
    activeXmlSources: number;
    totalOperations: number;
  }>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private xmlSources: Map<string, XmlSource>;
  private activityLogs: Map<string, ActivityLog>;
  private products: Map<string, Product>;
  private categories: Map<string, Category>;
  private brands: Map<string, Brand>;
  private categoryMappings: Map<string, CategoryMapping>;
  private databaseSettings: Map<string, DatabaseSettings>;

  constructor() {
    this.users = new Map();
    this.xmlSources = new Map();
    this.activityLogs = new Map();
    this.products = new Map();
    this.categories = new Map();
    this.brands = new Map();
    this.categoryMappings = new Map();
    this.databaseSettings = new Map();
    
    // Initialize with some sample data
    this.initializeSampleData();
  }

  private initializeSampleData() {
    // Sample categories
    const electronics = { id: randomUUID(), name: "Elektronik", parentId: null, createdAt: new Date() };
    const phones = { id: randomUUID(), name: "Akıllı Telefonlar", parentId: electronics.id, createdAt: new Date() };
    const computers = { id: randomUUID(), name: "Bilgisayar & Laptop", parentId: electronics.id, createdAt: new Date() };
    
    this.categories.set(electronics.id, electronics);
    this.categories.set(phones.id, phones);
    this.categories.set(computers.id, computers);
    
    // Sample brands
    const apple = { id: randomUUID(), name: "Apple", createdAt: new Date() };
    const samsung = { id: randomUUID(), name: "Samsung", createdAt: new Date() };
    
    this.brands.set(apple.id, apple);
    this.brands.set(samsung.id, samsung);
    
    // Sample products
    const iphone = {
      id: randomUUID(),
      name: "iPhone 15 Pro Max 256GB",
      categoryId: phones.id,
      brandId: apple.id,
      price: "45999.00",
      unit: "Adet",
      currentStock: 15,
      minimumOrderQuantity: 1,
      slug: null,
      barcode: null,
      sku: "IP15PM256",
      tags: null,
      videoProvider: null,
      videoUrl: null,
      isApproved: true,
      isCatalog: false,
      externalLink: null,
      isRefundable: true,
      cashOnDelivery: true,
      shortDescription: null,
      description: null,
      xmlSourceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const samsung24 = {
      id: randomUUID(),
      name: "Samsung Galaxy S24 Ultra",
      categoryId: phones.id,
      brandId: samsung.id,
      price: "52999.00",
      unit: "Adet",
      currentStock: 8,
      minimumOrderQuantity: 1,
      slug: null,
      barcode: null,
      sku: "SGS24U512",
      tags: null,
      videoProvider: null,
      videoUrl: null,
      isApproved: true,
      isCatalog: false,
      externalLink: null,
      isRefundable: true,
      cashOnDelivery: true,
      shortDescription: null,
      description: null,
      xmlSourceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.products.set(iphone.id, iphone);
    this.products.set(samsung24.id, samsung24);
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // XML Source methods
  async getXmlSources(): Promise<XmlSource[]> {
    return Array.from(this.xmlSources.values()).sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async getXmlSource(id: string): Promise<XmlSource | undefined> {
    return this.xmlSources.get(id);
  }

  async createXmlSource(xmlSource: InsertXmlSource): Promise<XmlSource> {
    const id = randomUUID();
    const now = new Date();
    const newXmlSource: XmlSource = { 
      ...xmlSource, 
      id, 
      createdAt: now, 
      updatedAt: now,
      productCount: 0,
      status: xmlSource.status || "active",
      lastFetch: xmlSource.lastFetch || null,
      mapping: xmlSource.mapping || null
    };
    this.xmlSources.set(id, newXmlSource);
    
    // Log activity
    await this.createActivityLog({
      type: "xml_source_added",
      title: "Yeni XML kaynağı eklendi",
      description: `${xmlSource.name} XML kaynağı sisteme eklendi`,
      entityId: id,
      entityType: "xml_source"
    });
    
    return newXmlSource;
  }

  async updateXmlSource(id: string, xmlSource: Partial<XmlSource>): Promise<XmlSource> {
    const existing = this.xmlSources.get(id);
    if (!existing) {
      throw new Error("XML source not found");
    }
    
    const updated: XmlSource = { 
      ...existing, 
      ...xmlSource, 
      updatedAt: new Date() 
    };
    this.xmlSources.set(id, updated);
    
    // Log activity
    await this.createActivityLog({
      type: "xml_source_updated",
      title: "XML kaynağı güncellendi",
      description: `${updated.name} XML kaynağı güncellendi`,
      entityId: id,
      entityType: "xml_source"
    });
    
    return updated;
  }

  async deleteXmlSource(id: string): Promise<boolean> {
    const existing = this.xmlSources.get(id);
    if (!existing) {
      return false;
    }
    
    this.xmlSources.delete(id);
    
    // Log activity
    await this.createActivityLog({
      type: "xml_source_deleted",
      title: "XML kaynağı silindi",
      description: `${existing.name} XML kaynağı sistemden silindi`,
      entityId: id,
      entityType: "xml_source"
    });
    
    return true;
  }

  // Activity Log methods
  async getActivityLogs(limit = 50): Promise<ActivityLog[]> {
    const logs = Array.from(this.activityLogs.values())
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    
    return limit ? logs.slice(0, limit) : logs;
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const id = randomUUID();
    const newLog: ActivityLog = { 
      ...log, 
      id, 
      createdAt: new Date(),
      description: log.description || null,
      oldValue: log.oldValue || null,
      newValue: log.newValue || null,
      entityId: log.entityId || null,
      entityType: log.entityType || null
    };
    this.activityLogs.set(id, newLog);
    return newLog;
  }

  async clearOldLogs(): Promise<void> {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    for (const [id, log] of Array.from(this.activityLogs.entries())) {
      if (log.createdAt && new Date(log.createdAt) < oneDayAgo) {
        this.activityLogs.delete(id);
      }
    }
  }

  // Product methods
  async getProducts(limit = 100): Promise<Product[]> {
    const products = Array.from(this.products.values())
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    
    return limit ? products.slice(0, limit) : products;
  }

  async getRecentProducts(limit = 10): Promise<Product[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return Array.from(this.products.values())
      .filter(product => product.createdAt && new Date(product.createdAt) >= today)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, limit);
  }

  async createProduct(product: Partial<Product>): Promise<Product> {
    const id = randomUUID();
    const now = new Date();
    const newProduct: Product = { 
      ...product,
      id,
      name: product.name || "",
      price: product.price || "0.00",
      unit: product.unit || "Adet",
      currentStock: product.currentStock || 0,
      minimumOrderQuantity: product.minimumOrderQuantity || 1,
      createdAt: now,
      updatedAt: now,
    } as Product;
    
    this.products.set(id, newProduct);
    
    // Log activity
    await this.createActivityLog({
      type: "product_added",
      title: "Yeni ürün eklendi",
      description: `${newProduct.name} ürünü sisteme eklendi`,
      entityId: id,
      entityType: "product"
    });
    
    return newProduct;
  }

  async updateProduct(id: string, product: Partial<Product>): Promise<Product> {
    const existing = this.products.get(id);
    if (!existing) {
      throw new Error("Product not found");
    }
    
    const updated: Product = { 
      ...existing, 
      ...product, 
      updatedAt: new Date() 
    };
    this.products.set(id, updated);
    
    // Log specific changes
    if (product.currentStock !== undefined && product.currentStock !== existing.currentStock) {
      await this.createActivityLog({
        type: "stock_updated",
        title: `${existing.name} ürününün stoğu güncellendi`,
        description: `Stok miktarı değiştirildi`,
        oldValue: existing.currentStock?.toString(),
        newValue: product.currentStock.toString(),
        entityId: id,
        entityType: "product"
      });
    }
    
    if (product.price !== undefined && product.price !== existing.price) {
      await this.createActivityLog({
        type: "price_updated",
        title: `${existing.name} ürününün fiyatı güncellendi`,
        description: `Fiyat değiştirildi`,
        oldValue: existing.price,
        newValue: product.price,
        entityId: id,
        entityType: "product"
      });
    }
    
    return updated;
  }

  // Category and Brand methods
  async getCategories(): Promise<Category[]> {
    return Array.from(this.categories.values());
  }

  async getBrands(): Promise<Brand[]> {
    return Array.from(this.brands.values());
  }

  // Category Mapping methods
  async getCategoryMappings(xmlSourceId: string): Promise<CategoryMapping[]> {
    return Array.from(this.categoryMappings.values())
      .filter(mapping => mapping.xmlSourceId === xmlSourceId);
  }

  async createCategoryMapping(mapping: InsertCategoryMapping): Promise<CategoryMapping> {
    const id = randomUUID();
    const newMapping: CategoryMapping = { ...mapping, id, createdAt: new Date() };
    this.categoryMappings.set(id, newMapping);
    return newMapping;
  }

  async updateCategoryMapping(id: string, mapping: Partial<CategoryMapping>): Promise<CategoryMapping> {
    const existing = this.categoryMappings.get(id);
    if (!existing) {
      throw new Error("Category mapping not found");
    }
    
    const updated: CategoryMapping = { ...existing, ...mapping };
    this.categoryMappings.set(id, updated);
    return updated;
  }

  async deleteCategoryMapping(id: string): Promise<boolean> {
    return this.categoryMappings.delete(id);
  }

  // Database Settings methods
  async getDatabaseSettings(): Promise<DatabaseSettings[]> {
    return Array.from(this.databaseSettings.values()).sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async createDatabaseSettings(settings: InsertDatabaseSettings): Promise<DatabaseSettings> {
    const id = randomUUID();
    const now = new Date();
    
    // If this is set as active, deactivate all others
    if (settings.isActive) {
      for (const [settingId, setting] of Array.from(this.databaseSettings.entries())) {
        if (setting.isActive) {
          this.databaseSettings.set(settingId, { ...setting, isActive: false, updatedAt: now });
        }
      }
    }
    
    const newSettings: DatabaseSettings = { 
      ...settings, 
      id, 
      createdAt: now, 
      updatedAt: now,
      port: settings.port || 3306,
      isActive: settings.isActive || false
    };
    this.databaseSettings.set(id, newSettings);
    return newSettings;
  }

  async updateDatabaseSettings(id: string, settings: Partial<DatabaseSettings>): Promise<DatabaseSettings> {
    const existing = this.databaseSettings.get(id);
    if (!existing) {
      throw new Error("Database settings not found");
    }
    
    const now = new Date();
    
    // If this is set as active, deactivate all others
    if (settings.isActive) {
      for (const [settingId, setting] of Array.from(this.databaseSettings.entries())) {
        if (setting.isActive && settingId !== id) {
          this.databaseSettings.set(settingId, { ...setting, isActive: false, updatedAt: now });
        }
      }
    }
    
    const updated: DatabaseSettings = { 
      ...existing, 
      ...settings, 
      updatedAt: now 
    };
    this.databaseSettings.set(id, updated);
    return updated;
  }

  async deleteDatabaseSettings(id: string): Promise<boolean> {
    const existing = this.databaseSettings.get(id);
    if (!existing) {
      return false;
    }
    
    this.databaseSettings.delete(id);
    return true;
  }

  async setActiveDatabaseSettings(id: string): Promise<DatabaseSettings> {
    const existing = this.databaseSettings.get(id);
    if (!existing) {
      throw new Error("Database settings not found");
    }
    
    const now = new Date();
    
    // Deactivate all others
    for (const [settingId, setting] of Array.from(this.databaseSettings.entries())) {
      if (setting.isActive) {
        this.databaseSettings.set(settingId, { ...setting, isActive: false, updatedAt: now });
      }
    }
    
    // Activate this one
    const activated: DatabaseSettings = { 
      ...existing, 
      isActive: true, 
      updatedAt: now 
    };
    this.databaseSettings.set(id, activated);
    return activated;
  }

  // Statistics
  async getDashboardStats(): Promise<{
    todayAddedProducts: number;
    updatedProducts: number;
    activeXmlSources: number;
    totalOperations: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayProducts = Array.from(this.products.values())
      .filter(product => product.createdAt && new Date(product.createdAt) >= today);
    
    const todayLogs = Array.from(this.activityLogs.values())
      .filter(log => log.createdAt && new Date(log.createdAt) >= today);
    
    const updatedProducts = todayLogs
      .filter(log => log.type === "stock_updated" || log.type === "price_updated").length;
    
    const activeXmlSources = Array.from(this.xmlSources.values())
      .filter(source => source.status === "active").length;
    
    return {
      todayAddedProducts: todayProducts.length,
      updatedProducts,
      activeXmlSources,
      totalOperations: todayLogs.length,
    };
  }
}

export const storage = new MemStorage();
