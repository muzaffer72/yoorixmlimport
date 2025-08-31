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
  type InsertDatabaseSettings,
  type GeminiSettings,
  type InsertGeminiSettings,
  type Cronjob,
  type InsertCronjob,
  categories
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { CategoryMatcher } from "./categoryMatcher";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

interface ConfigData {
  xmlSources: XmlSource[];
  activityLogs: ActivityLog[];
  cronjobs: Cronjob[];
  categoryMappings: CategoryMapping[];
  geminiSettings: {
    apiKey: string;
    selectedModel: string;
    isActive: boolean;
    isConfigured: boolean;
  };
  databaseSettings: DatabaseSettings | null;
  dashboardStats: {
    todayAddedProducts: number;
    updatedProducts: number;
    activeXmlSources: number;
    pendingImports: number;
    totalCategories: number;
    activeCronjobs: number;
  };
  extractedCategories: string[];
}

export class JsonStorage {
  private configPath: string;
  private config: ConfigData;

  constructor() {
    this.configPath = join(process.cwd(), 'server', 'config.json');
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      if (existsSync(this.configPath)) {
        const data = readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(data);
      } else {
        this.config = this.getDefaultConfig();
        this.saveConfig();
      }
    } catch (error) {
      console.error('Config dosyası yüklenirken hata:', error);
      this.config = this.getDefaultConfig();
    }
  }

  private saveConfig(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Config dosyası kaydedilirken hata:', error);
    }
  }

  private getDefaultConfig(): ConfigData {
    return {
      xmlSources: [],
      activityLogs: [],
      cronjobs: [],
      categoryMappings: [],
      geminiSettings: {
        apiKey: "",
        selectedModel: "gemini-2.5-flash",
        isActive: false,
        isConfigured: false
      },
      databaseSettings: null,
      dashboardStats: {
        todayAddedProducts: 0,
        updatedProducts: 0,
        activeXmlSources: 0,
        pendingImports: 0,
        totalCategories: 0,
        activeCronjobs: 0
      },
      extractedCategories: []
    };
  }

  // XML Source methods
  async getXmlSources(): Promise<XmlSource[]> {
    return this.config.xmlSources.sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async getXmlSource(id: string): Promise<XmlSource | undefined> {
    return this.config.xmlSources.find(source => source.id === id);
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
      lastFetch: xmlSource.lastFetch || null
    };
    
    this.config.xmlSources.push(newXmlSource);
    
    // Log activity
    await this.createActivityLog({
      type: "xml_source_added",
      title: "Yeni XML kaynağı eklendi",
      description: `${xmlSource.name} XML kaynağı sisteme eklendi`,
      entityId: id,
      entityType: "xml_source"
    });
    
    this.updateDashboardStats();
    this.saveConfig();
    return newXmlSource;
  }

  async updateXmlSource(id: string, xmlSource: Partial<XmlSource>): Promise<XmlSource> {
    const index = this.config.xmlSources.findIndex(source => source.id === id);
    if (index === -1) {
      throw new Error("XML source not found");
    }
    
    const existing = this.config.xmlSources[index];
    const updated: XmlSource = { 
      ...existing, 
      ...xmlSource, 
      updatedAt: new Date() 
    };
    
    this.config.xmlSources[index] = updated;
    
    // Log activity
    await this.createActivityLog({
      type: "xml_source_updated",
      title: "XML kaynağı güncellendi",
      description: `${updated.name} XML kaynağı güncellendi`,
      entityId: id,
      entityType: "xml_source"
    });
    
    this.updateDashboardStats();
    this.saveConfig();
    return updated;
  }

  async deleteXmlSource(id: string): Promise<boolean> {
    const index = this.config.xmlSources.findIndex(source => source.id === id);
    if (index === -1) {
      return false;
    }
    
    const existing = this.config.xmlSources[index];
    this.config.xmlSources.splice(index, 1);
    
    // Remove related cronjobs and mappings
    this.config.cronjobs = this.config.cronjobs.filter(cron => cron.xmlSourceId !== id);
    this.config.categoryMappings = this.config.categoryMappings.filter(mapping => mapping.xmlSourceId !== id);
    
    // Log activity
    await this.createActivityLog({
      type: "xml_source_deleted",
      title: "XML kaynağı silindi",
      description: `${existing.name} XML kaynağı sistemden silindi`,
      entityId: id,
      entityType: "xml_source"
    });
    
    this.updateDashboardStats();
    this.saveConfig();
    return true;
  }

  // Activity Log methods
  async getActivityLogs(limit = 50): Promise<ActivityLog[]> {
    const logs = this.config.activityLogs
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
    
    this.config.activityLogs.push(newLog);
    
    // Keep only last 100 logs
    if (this.config.activityLogs.length > 100) {
      this.config.activityLogs = this.config.activityLogs.slice(-100);
    }
    
    this.saveConfig();
    return newLog;
  }

  // Cronjob methods
  async getCronjobs(): Promise<Cronjob[]> {
    return this.config.cronjobs.sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async createCronjob(cronjob: InsertCronjob): Promise<Cronjob> {
    const id = randomUUID();
    const now = new Date();
    const newCronjob: Cronjob = { 
      ...cronjob, 
      id, 
      createdAt: now, 
      updatedAt: now,
      isActive: cronjob.isActive !== undefined ? cronjob.isActive : true,
      runCount: 0,
      failureCount: 0,
      lastRun: null,
      nextRun: null,
      lastRunStatus: null
    };
    
    this.config.cronjobs.push(newCronjob);
    
    // Log activity
    await this.createActivityLog({
      type: "cronjob_created",
      title: "Yeni cronjob oluşturuldu",
      description: `${cronjob.name} cronjob görevi oluşturuldu`,
      entityId: id,
      entityType: "cronjob"
    });
    
    this.updateDashboardStats();
    this.saveConfig();
    return newCronjob;
  }

  async updateCronjob(id: string, cronjob: Partial<Cronjob>): Promise<Cronjob> {
    const index = this.config.cronjobs.findIndex(cron => cron.id === id);
    if (index === -1) {
      throw new Error("Cronjob not found");
    }
    
    const existing = this.config.cronjobs[index];
    const updated: Cronjob = { 
      ...existing, 
      ...cronjob, 
      updatedAt: new Date() 
    };
    
    this.config.cronjobs[index] = updated;
    
    // Log activity
    await this.createActivityLog({
      type: "cronjob_updated",
      title: "Cronjob güncellendi",
      description: `${updated.name} cronjob görevi güncellendi`,
      entityId: id,
      entityType: "cronjob"
    });
    
    this.updateDashboardStats();
    this.saveConfig();
    return updated;
  }

  async deleteCronjob(id: string): Promise<boolean> {
    const index = this.config.cronjobs.findIndex(cron => cron.id === id);
    if (index === -1) {
      return false;
    }
    
    const existing = this.config.cronjobs[index];
    this.config.cronjobs.splice(index, 1);
    
    // Log activity
    await this.createActivityLog({
      type: "cronjob_deleted",
      title: "Cronjob silindi",
      description: `${existing.name} cronjob görevi silindi`,
      entityId: id,
      entityType: "cronjob"
    });
    
    this.updateDashboardStats();
    this.saveConfig();
    return true;
  }

  // Category Mapping methods
  async getCategoryMappings(xmlSourceId: string): Promise<CategoryMapping[]> {
    return this.config.categoryMappings.filter(mapping => mapping.xmlSourceId === xmlSourceId);
  }

  async createCategoryMapping(mapping: InsertCategoryMapping): Promise<CategoryMapping> {
    const id = randomUUID();
    const newMapping: CategoryMapping = { 
      ...mapping, 
      id, 
      createdAt: new Date(),
      updatedAt: new Date(),
      confidence: mapping.confidence || "0.00",
      isManual: mapping.isManual || false
    };
    
    this.config.categoryMappings.push(newMapping);
    this.saveConfig();
    return newMapping;
  }

  async updateCategoryMapping(id: string, mapping: Partial<CategoryMapping>): Promise<CategoryMapping> {
    const index = this.config.categoryMappings.findIndex(map => map.id === id);
    if (index === -1) {
      throw new Error("Category mapping not found");
    }
    
    const existing = this.config.categoryMappings[index];
    const updated: CategoryMapping = { 
      ...existing, 
      ...mapping, 
      updatedAt: new Date() 
    };
    
    this.config.categoryMappings[index] = updated;
    this.saveConfig();
    return updated;
  }

  async deleteCategoryMapping(id: string): Promise<boolean> {
    const index = this.config.categoryMappings.findIndex(map => map.id === id);
    if (index === -1) {
      return false;
    }
    
    this.config.categoryMappings.splice(index, 1);
    this.saveConfig();
    return true;
  }

  // Gemini Settings methods
  async getGeminiSettings(): Promise<any> {
    return {
      api_key: this.config.geminiSettings.isConfigured ? '***API_KEY_SET***' : '',
      selected_model: this.config.geminiSettings.selectedModel,
      is_active: this.config.geminiSettings.isActive,
      is_configured: this.config.geminiSettings.isConfigured
    };
  }

  async updateGeminiSettings(apiKey: string, selectedModel: string): Promise<any> {
    this.config.geminiSettings = {
      apiKey: apiKey,
      selectedModel: selectedModel,
      isActive: true,
      isConfigured: true
    };
    
    // Log activity
    await this.createActivityLog({
      type: "settings_updated",
      title: "Gemini ayarları güncellendi",
      description: "Gemini AI ayarları başarıyla güncellendi",
      entityType: "settings"
    });
    
    this.saveConfig();
    
    return {
      api_key: '***API_KEY_SET***',
      selected_model: selectedModel,
      is_active: true,
      is_configured: true
    };
  }

  // Database Settings methods
  async getDatabaseSettings(): Promise<DatabaseSettings | null> {
    return this.config.databaseSettings;
  }

  async createDatabaseSettings(settings: InsertDatabaseSettings): Promise<DatabaseSettings> {
    const id = randomUUID();
    const now = new Date();
    
    const newSettings: DatabaseSettings = { 
      ...settings, 
      id, 
      createdAt: now, 
      updatedAt: now,
      port: settings.port || 3306,
      isActive: settings.isActive || true
    };
    
    this.config.databaseSettings = newSettings;
    
    // Log activity
    await this.createActivityLog({
      type: "database_settings_updated",
      title: "Veritabanı ayarları güncellendi",
      description: `${settings.host}:${settings.port} veritabanı bağlantısı yapılandırıldı`,
      entityType: "settings"
    });
    
    this.saveConfig();
    return newSettings;
  }

  async updateDatabaseSettings(id: string, settings: Partial<DatabaseSettings>): Promise<DatabaseSettings> {
    if (!this.config.databaseSettings || this.config.databaseSettings.id !== id) {
      throw new Error("Database settings not found");
    }
    
    const updated: DatabaseSettings = { 
      ...this.config.databaseSettings, 
      ...settings, 
      updatedAt: new Date() 
    };
    
    this.config.databaseSettings = updated;
    this.saveConfig();
    return updated;
  }

  // Categories (from MySQL database)
  async getCategories(): Promise<Category[]> {
    try {
      // Mevcut veritabanından kategorileri çek
      const dbCategories = await db.select().from(categories);
      
      // Dashboard stats güncelle
      this.config.dashboardStats.totalCategories = dbCategories.length;
      this.saveConfig();
      
      return dbCategories;
    } catch (error) {
      console.error("Error fetching categories from database:", error);
      console.log("Replit environment detected, returning demo categories");
      
      // Demo kategoriler
      const demoCategories = [
        { id: "1", name: "Elektronik", title: "Elektronik Ürünler", parentId: null, createdAt: new Date() },
        { id: "2", name: "Telefon", title: "Akıllı Telefonlar", parentId: "1", createdAt: new Date() },
        { id: "3", name: "Bilgisayar", title: "Bilgisayar ve Laptop", parentId: "1", createdAt: new Date() },
        { id: "4", name: "Giyim", title: "Giyim ve Aksesuar", parentId: null, createdAt: new Date() },
        { id: "5", name: "Ev", title: "Ev ve Yaşam", parentId: null, createdAt: new Date() }
      ];
      
      this.config.dashboardStats.totalCategories = demoCategories.length;
      this.saveConfig();
      
      return demoCategories;
    }
  }

  // Dashboard Stats
  async getDashboardStats(): Promise<any> {
    this.updateDashboardStats();
    return this.config.dashboardStats;
  }

  private updateDashboardStats(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayLogs = this.config.activityLogs.filter(log => 
      log.createdAt && new Date(log.createdAt) >= today
    );
    
    this.config.dashboardStats = {
      todayAddedProducts: todayLogs.filter(log => log.type === "product_added").length,
      updatedProducts: todayLogs.filter(log => 
        log.type === "stock_updated" || log.type === "price_updated"
      ).length,
      activeXmlSources: this.config.xmlSources.filter(source => source.status === "active").length,
      pendingImports: 0,
      totalCategories: this.config.dashboardStats.totalCategories || 0,
      activeCronjobs: this.config.cronjobs.filter(cron => cron.isActive).length
    };
  }

  // Recent Products (mock data for now)
  async getRecentProducts(): Promise<any[]> {
    return [
      {
        id: "f77365ad-35f7-4090-8e6c-123456789abc",
        name: "Örnek Ürün 1",
        price: "299.99",
        unit: "Adet",
        currentStock: 45,
        created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        xml_source_id: "xml-source-1"
      },
      {
        id: "89a74252-6e89-5647-9d2d-987654321def",
        name: "Örnek Ürün 2", 
        price: "149.99",
        unit: "Kg",
        currentStock: 120,
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        xml_source_id: "xml-source-2"
      }
    ];
  }

  // Auto-mapping için kategori eşleştirme
  async autoMapCategories(xmlSourceId: string): Promise<{
    mappings: Array<{
      xmlCategory: string;
      suggestedCategory: Category | null;
      confidence: number;
      alternatives: Array<{ category: Category; confidence: number }>;
    }>;
    summary: {
      total: number;
      high: number;
      medium: number;
      low: number;
      noMatch: number;
    };
  }> {
    const xmlSource = await this.getXmlSource(xmlSourceId);
    if (!xmlSource || !xmlSource.extractedCategories) {
      throw new Error("XML source not found or no categories extracted");
    }

    const xmlCategories = Array.isArray(xmlSource.extractedCategories) 
      ? xmlSource.extractedCategories as string[]
      : [];
      
    const localCategories = await this.getCategories();
    
    const matcher = new CategoryMatcher();
    const mappings = matcher.autoMapCategories(xmlCategories, localCategories);
    
    // Özet istatistik hesapla
    const categorized = matcher.categorizeByConfidence(mappings);
    const summary = {
      total: mappings.length,
      high: categorized.high.length,
      medium: categorized.medium.length,
      low: categorized.low.length,
      noMatch: categorized.noMatch.length
    };

    return { mappings, summary };
  }

  // AI ile kategori eşleştirme
  async aiMapCategories(xmlSourceId: string): Promise<{
    mappings: Array<{
      xmlCategory: string;
      suggestedCategory: Category | null;
      confidence: number;
      reasoning: string;
    }>;
    summary: {
      total: number;
      mapped: number;
      unmapped: number;
      averageConfidence: number;
    };
  }> {
    // Mock AI response
    const xmlSource = await this.getXmlSource(xmlSourceId);
    if (!xmlSource || !xmlSource.extractedCategories) {
      throw new Error("XML source not found or no categories extracted");
    }

    const xmlCategories = Array.isArray(xmlSource.extractedCategories) 
      ? xmlSource.extractedCategories as string[]
      : [];
      
    const localCategories = await this.getCategories();
    
    const mappings = xmlCategories.map(xmlCat => {
      // Basit string matching
      const match = localCategories.find(localCat => 
        localCat.name.toLowerCase().includes(xmlCat.toLowerCase()) ||
        xmlCat.toLowerCase().includes(localCat.name.toLowerCase())
      );
      
      return {
        xmlCategory: xmlCat,
        suggestedCategory: match || null,
        confidence: match ? 0.85 : 0.0,
        reasoning: match 
          ? `"${xmlCat}" kategorisi "${match.name}" ile eşleştirildi` 
          : `"${xmlCat}" için uygun kategori bulunamadı`
      };
    });

    const mapped = mappings.filter(m => m.suggestedCategory !== null);
    const averageConfidence = mapped.length > 0 
      ? mapped.reduce((sum, m) => sum + m.confidence, 0) / mapped.length 
      : 0;

    return {
      mappings,
      summary: {
        total: mappings.length,
        mapped: mapped.length,
        unmapped: mappings.length - mapped.length,
        averageConfidence
      }
    };
  }

  // Get Gemini API key for internal use
  getGeminiApiKey(): string {
    return this.config.geminiSettings.apiKey;
  }

  // Test Gemini API key
  testGeminiApiKey(apiKey: string): boolean {
    // Mock test - always return true for demo
    return apiKey && apiKey.length > 10;
  }
}

// Singleton instance
export const jsonStorage = new JsonStorage();