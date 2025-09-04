import { 
  type XmlSource,
  type InsertXmlSource,
  type ActivityLog,
  type InsertActivityLog,
  type Category,
  type CategoryMapping,
  type InsertCategoryMapping,
  type DatabaseSettings,
  type InsertDatabaseSettings,
  type Cronjob,
  type InsertCronjob,
  categories
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { CategoryMatcher } from "./categoryMatcher";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

export class PageStorage {
  private dataDir: string;

  constructor() {
    this.dataDir = join(process.cwd(), 'server', 'data');
    // Ensure data directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private loadJsonFile(filename: string, defaultData: any): any {
    const filePath = join(this.dataDir, filename);
    try {
      if (existsSync(filePath)) {
        const data = readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
      } else {
        this.saveJsonFile(filename, defaultData);
        return defaultData;
      }
    } catch (error) {
      console.error(`${filename} dosyası yüklenirken hata:`, error);
      return defaultData;
    }
  }

  private saveJsonFile(filename: string, data: any): void {
    const filePath = join(this.dataDir, filename);
    try {
      // Ensure directory exists
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`${filename} dosyası kaydedilirken hata:`, error);
    }
  }

  // XML Sources Management
  async getXmlSources(): Promise<XmlSource[]> {
    const data = this.loadJsonFile('xml-sources.json', { sources: [] });
    return data.sources.sort((a: any, b: any) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async getXmlSource(id: string): Promise<XmlSource | undefined> {
    const data = this.loadJsonFile('xml-sources.json', { sources: [] });
    return data.sources.find((source: any) => source.id === id);
  }

  async createXmlSource(xmlSource: InsertXmlSource): Promise<XmlSource> {
    const data = this.loadJsonFile('xml-sources.json', { sources: [] });
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
    
    data.sources.push(newXmlSource);
    this.saveJsonFile('xml-sources.json', data);
    
    // Log activity
    await this.createActivityLog({
      type: "xml_source_added",
      title: "Yeni XML kaynağı eklendi",
      description: `${xmlSource.name} XML kaynağı sisteme eklendi`,
      entityId: id,
      entityType: "xml_source"
    });
    
    this.updateDashboardStats();
    return newXmlSource;
  }

  async updateXmlSource(id: string, xmlSource: Partial<XmlSource>): Promise<XmlSource> {
    const data = this.loadJsonFile('xml-sources.json', { sources: [] });
    const index = data.sources.findIndex((source: any) => source.id === id);
    if (index === -1) {
      throw new Error("XML source not found");
    }
    
    const existing = data.sources[index];
    const updated: XmlSource = { 
      ...existing, 
      ...xmlSource, 
      updatedAt: new Date() 
    };
    
    data.sources[index] = updated;
    this.saveJsonFile('xml-sources.json', data);
    
    // Log activity
    await this.createActivityLog({
      type: "xml_source_updated",
      title: "XML kaynağı güncellendi",
      description: `${updated.name} XML kaynağı güncellendi`,
      entityId: id,
      entityType: "xml_source"
    });
    
    this.updateDashboardStats();
    return updated;
  }

  async deleteXmlSource(id: string): Promise<boolean> {
    const data = this.loadJsonFile('xml-sources.json', { sources: [] });
    const index = data.sources.findIndex((source: any) => source.id === id);
    if (index === -1) {
      return false;
    }
    
    const existing = data.sources[index];
    data.sources.splice(index, 1);
    this.saveJsonFile('xml-sources.json', data);
    
    // Remove related cronjobs and mappings
    await this.deleteRelatedData(id);
    
    // Log activity
    await this.createActivityLog({
      type: "xml_source_deleted",
      title: "XML kaynağı silindi",
      description: `${existing.name} XML kaynağı sistemden silindi`,
      entityId: id,
      entityType: "xml_source"
    });
    
    this.updateDashboardStats();
    return true;
  }

  private async deleteRelatedData(xmlSourceId: string): Promise<void> {
    // Delete related cronjobs
    const cronjobData = this.loadJsonFile('cronjobs.json', { jobs: [] });
    cronjobData.jobs = cronjobData.jobs.filter((job: any) => job.xmlSourceId !== xmlSourceId);
    this.saveJsonFile('cronjobs.json', cronjobData);

    // Delete related category mappings
    const mappingData = this.loadJsonFile('category-mappings.json', { mappings: [] });
    mappingData.mappings = mappingData.mappings.filter((mapping: any) => mapping.xmlSourceId !== xmlSourceId);
    this.saveJsonFile('category-mappings.json', mappingData);

    // Delete extracted categories for this XML source
    const categoryData = this.loadJsonFile('extracted-categories.json', { categories: [] });
    categoryData.categories = categoryData.categories.filter((cat: any) => cat.xmlSourceId !== xmlSourceId);
    this.saveJsonFile('extracted-categories.json', categoryData);
  }

  // Activity Logs Management
  async getActivityLogs(limit = 50): Promise<ActivityLog[]> {
    const data = this.loadJsonFile('activity-logs.json', { logs: [] });
    const logs = data.logs.sort((a: any, b: any) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    
    return limit ? logs.slice(0, limit) : logs;
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const data = this.loadJsonFile('activity-logs.json', { logs: [] });
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
    
    data.logs.push(newLog);
    
    // Keep only last 100 logs
    if (data.logs.length > 100) {
      data.logs = data.logs.slice(-100);
    }
    
    this.saveJsonFile('activity-logs.json', data);
    return newLog;
  }

  // Cronjobs Management
  async getCronjobs(): Promise<Cronjob[]> {
    const data = this.loadJsonFile('cronjobs.json', { jobs: [] });
    return data.jobs.sort((a: any, b: any) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async createCronjob(cronjob: InsertCronjob): Promise<Cronjob> {
    const data = this.loadJsonFile('cronjobs.json', { jobs: [] });
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
    
    data.jobs.push(newCronjob);
    this.saveJsonFile('cronjobs.json', data);
    
    // Log activity
    await this.createActivityLog({
      type: "cronjob_created",
      title: "Yeni cronjob oluşturuldu",
      description: `${cronjob.name} cronjob görevi oluşturuldu`,
      entityId: id,
      entityType: "cronjob"
    });
    
    this.updateDashboardStats();
    return newCronjob;
  }

  async updateCronjob(id: string, cronjob: Partial<Cronjob>): Promise<Cronjob> {
    const data = this.loadJsonFile('cronjobs.json', { jobs: [] });
    const index = data.jobs.findIndex((job: any) => job.id === id);
    if (index === -1) {
      throw new Error("Cronjob not found");
    }
    
    const existing = data.jobs[index];
    const updated: Cronjob = { 
      ...existing, 
      ...cronjob, 
      updatedAt: new Date() 
    };
    
    data.jobs[index] = updated;
    this.saveJsonFile('cronjobs.json', data);
    
    // Log activity
    await this.createActivityLog({
      type: "cronjob_updated",
      title: "Cronjob güncellendi",
      description: `${updated.name} cronjob görevi güncellendi`,
      entityId: id,
      entityType: "cronjob"
    });
    
    this.updateDashboardStats();
    return updated;
  }

  async deleteCronjob(id: string): Promise<boolean> {
    const data = this.loadJsonFile('cronjobs.json', { jobs: [] });
    const index = data.jobs.findIndex((job: any) => job.id === id);
    if (index === -1) {
      return false;
    }
    
    const existing = data.jobs[index];
    data.jobs.splice(index, 1);
    this.saveJsonFile('cronjobs.json', data);
    
    // Log activity
    await this.createActivityLog({
      type: "cronjob_deleted",
      title: "Cronjob silindi",
      description: `${existing.name} cronjob görevi silindi`,
      entityId: id,
      entityType: "cronjob"
    });
    
    this.updateDashboardStats();
    return true;
  }

  async getCronjobById(id: string): Promise<Cronjob | null> {
    const data = this.loadJsonFile('cronjobs.json', { jobs: [] });
    const job = data.jobs.find((job: any) => job.id === id);
    return job || null;
  }

  async updateCronjobStatus(id: string, status: string): Promise<void> {
    const data = this.loadJsonFile('cronjobs.json', { jobs: [] });
    const jobIndex = data.jobs.findIndex((job: any) => job.id === id);
    if (jobIndex !== -1) {
      data.jobs[jobIndex].lastRunStatus = status;
      data.jobs[jobIndex].lastRun = new Date().toISOString();
      this.saveJsonFile('cronjobs.json', data);
    }
  }

  async updateCronjobAfterRun(id: string, status: string, result: any): Promise<void> {
    const data = this.loadJsonFile('cronjobs.json', { jobs: [] });
    const jobIndex = data.jobs.findIndex((job: any) => job.id === id);
    if (jobIndex !== -1) {
      const job = data.jobs[jobIndex];
      job.lastRunStatus = status;
      job.lastRun = new Date().toISOString();
      job.runCount = (job.runCount || 0) + 1;
      
      if (status === 'failed') {
        job.failureCount = (job.failureCount || 0) + 1;
      }
      
      // Next run zamanını hesapla (basit implementasyon)
      if (job.frequency === 'hourly') {
        job.nextRun = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      } else if (job.frequency === 'daily') {
        job.nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }
      
      this.saveJsonFile('cronjobs.json', data);
      
      // Log activity
      await this.createActivityLog({
        type: status === 'success' ? "cronjob_success" : "cronjob_failed",
        title: `Cronjob ${status === 'success' ? 'başarılı' : 'başarısız'}`,
        description: `${job.name} cronjob görevi ${status === 'success' ? 'başarıyla çalıştırıldı' : 'başarısız oldu'}`,
        entityId: id,
        entityType: "cronjob",
        newValue: JSON.stringify(result)
      });
    }
  }

  // Category Mappings Management
  async getCategoryMappings(xmlSourceId: string): Promise<CategoryMapping[]> {
    const data = this.loadJsonFile('category-mappings.json', { mappings: [] });
    return data.mappings.filter((mapping: any) => mapping.xmlSourceId === xmlSourceId);
  }

  async createCategoryMapping(mapping: InsertCategoryMapping): Promise<CategoryMapping> {
    const data = this.loadJsonFile('category-mappings.json', { mappings: [] });
    const id = randomUUID();
    const newMapping: CategoryMapping = { 
      ...mapping, 
      id, 
      createdAt: new Date(),
      updatedAt: new Date(),
      confidence: mapping.confidence || "0.00",
      isManual: mapping.isManual || false
    };
    
    data.mappings.push(newMapping);
    this.saveJsonFile('category-mappings.json', data);
    return newMapping;
  }

  async updateCategoryMapping(id: string, mapping: Partial<CategoryMapping>): Promise<CategoryMapping> {
    const data = this.loadJsonFile('category-mappings.json', { mappings: [] });
    const index = data.mappings.findIndex((map: any) => map.id === id);
    if (index === -1) {
      throw new Error("Category mapping not found");
    }
    
    const existing = data.mappings[index];
    const updated: CategoryMapping = { 
      ...existing, 
      ...mapping, 
      updatedAt: new Date() 
    };
    
    data.mappings[index] = updated;
    this.saveJsonFile('category-mappings.json', data);
    return updated;
  }

  async deleteCategoryMapping(id: string): Promise<boolean> {
    const data = this.loadJsonFile('category-mappings.json', { mappings: [] });
    const index = data.mappings.findIndex((map: any) => map.id === id);
    if (index === -1) {
      return false;
    }
    
    data.mappings.splice(index, 1);
    this.saveJsonFile('category-mappings.json', data);
    return true;
  }

  async deleteAllCategoryMappingsForSource(xmlSourceId: string): Promise<number> {
    console.log('🗑️  PageStorage: deleteAllCategoryMappingsForSource called with xmlSourceId:', xmlSourceId);
    const data = this.loadJsonFile('category-mappings.json', { mappings: [] });
    const initialCount = data.mappings.length;
    
    console.log('📊 Initial mappings count:', initialCount);
    console.log('🔍 Looking for mappings with xmlSourceId:', xmlSourceId);
    
    // Bu XML source'a ait mapping'leri bul
    const matchingMappings = data.mappings.filter((map: any) => map.xmlSourceId === xmlSourceId);
    console.log('🎯 Found matching mappings:', matchingMappings.length);
    
    // Bu XML source'a ait tüm mapping'leri filtrele
    data.mappings = data.mappings.filter((map: any) => map.xmlSourceId !== xmlSourceId);
    
    const deletedCount = initialCount - data.mappings.length;
    console.log('✅ Deleted count:', deletedCount);
    console.log('📝 Remaining mappings count:', data.mappings.length);
    
    this.saveJsonFile('category-mappings.json', data);
    
    return deletedCount;
  }

  // Settings Management
  async getGeminiSettings(): Promise<any> {
    const data = this.loadJsonFile('settings.json', { 
      gemini: { 
        apiKey: "", 
        selectedModel: "gemini-2.5-flash", 
        isActive: false, 
        isConfigured: false,
        useAiForShortDescription: false,
        useAiForFullDescription: false
      },
      database: { host: "", port: 3306, database: "", username: "", password: "", isActive: false }
    });
    
    return {
      api_key: data.gemini.isConfigured ? '***API_KEY_SET***' : '',
      selected_model: data.gemini.selectedModel,
      is_active: data.gemini.isActive,
      is_configured: data.gemini.isConfigured,
      useAiForShortDescription: data.gemini.useAiForShortDescription || false,
      useAiForFullDescription: data.gemini.useAiForFullDescription || false
    };
  }

  async updateGeminiSettings(apiKey: string, selectedModel: string, options: {
    useAiForShortDescription?: boolean;
    useAiForFullDescription?: boolean;
  } = {}): Promise<any> {
    const data = this.loadJsonFile('settings.json', { 
      gemini: { 
        apiKey: "", 
        selectedModel: "gemini-2.5-flash", 
        isActive: false, 
        isConfigured: false,
        useAiForShortDescription: false,
        useAiForFullDescription: false
      },
      database: { host: "", port: 3306, database: "", username: "", password: "", isActive: false }
    });
    
    // API key boşsa ayarları sıfırla ama model seçimini koru
    if (!apiKey || apiKey.trim() === '') {
      data.gemini = {
        apiKey: "",
        selectedModel: selectedModel, // Model seçimini koru
        isActive: false,
        isConfigured: false,
        useAiForShortDescription: options.useAiForShortDescription !== undefined ? 
          options.useAiForShortDescription : (data.gemini.useAiForShortDescription || false),
        useAiForFullDescription: options.useAiForFullDescription !== undefined ? 
          options.useAiForFullDescription : (data.gemini.useAiForFullDescription || false)
      };
    } else {
      data.gemini = {
        apiKey: apiKey,
        selectedModel: selectedModel,
        isActive: true,
        isConfigured: true,
        useAiForShortDescription: options.useAiForShortDescription !== undefined ? 
          options.useAiForShortDescription : (data.gemini.useAiForShortDescription || false),
        useAiForFullDescription: options.useAiForFullDescription !== undefined ? 
          options.useAiForFullDescription : (data.gemini.useAiForFullDescription || false)
      };
    }
    
    this.saveJsonFile('settings.json', data);
    
    // Log activity
    await this.createActivityLog({
      type: "settings_updated",
      title: "Gemini ayarları güncellendi",
      description: "Gemini AI ayarları başarıyla güncellendi",
      entityType: "settings"
    });
    
    return {
      api_key: data.gemini.isConfigured ? '***API_KEY_SET***' : '',
      selected_model: selectedModel,
      is_active: data.gemini.isActive,
      is_configured: data.gemini.isConfigured,
      useAiForShortDescription: data.gemini.useAiForShortDescription,
      useAiForFullDescription: data.gemini.useAiForFullDescription
    };
  }

  async getDatabaseSettings(): Promise<DatabaseSettings | null> {
    const data = this.loadJsonFile('settings.json', { 
      gemini: { apiKey: "", selectedModel: "gemini-2.5-flash", isActive: false, isConfigured: false },
      database: { host: "", port: 3306, database: "", username: "", password: "", isActive: false }
    });
    
    if (!data.database.host) {
      return null;
    }
    
    return {
      id: "db-1",
      host: data.database.host,
      port: data.database.port,
      database: data.database.database,
      username: data.database.username,
      password: data.database.password,
      isActive: data.database.isActive,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async createDatabaseSettings(settings: InsertDatabaseSettings): Promise<DatabaseSettings> {
    const data = this.loadJsonFile('settings.json', { 
      gemini: { apiKey: "", selectedModel: "gemini-2.5-flash", isActive: false, isConfigured: false },
      database: { host: "", port: 3306, database: "", username: "", password: "", isActive: false }
    });
    
    data.database = {
      host: settings.host,
      port: settings.port || 3306,
      database: settings.database,
      username: settings.username,
      password: settings.password,
      isActive: settings.isActive || true
    };
    
    this.saveJsonFile('settings.json', data);
    
    // Log activity
    await this.createActivityLog({
      type: "database_settings_updated",
      title: "Veritabanı ayarları güncellendi",
      description: `${settings.host}:${settings.port} veritabanı bağlantısı yapılandırıldı`,
      entityType: "settings"
    });
    
    return {
      id: "db-1",
      host: settings.host,
      port: settings.port || 3306,
      database: settings.database,
      username: settings.username,
      password: settings.password,
      isActive: settings.isActive || true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async updateDatabaseSettings(id: string, settings: Partial<DatabaseSettings>): Promise<DatabaseSettings> {
    const data = this.loadJsonFile('settings.json', { 
      gemini: { apiKey: "", selectedModel: "gemini-2.5-flash", isActive: false, isConfigured: false },
      database: { host: "", port: 3306, database: "", username: "", password: "", isActive: false }
    });
    
    data.database = {
      ...data.database,
      ...settings
    };
    
    this.saveJsonFile('settings.json', data);
    
    return {
      id: "db-1",
      host: data.database.host,
      port: data.database.port,
      database: data.database.database,
      username: data.database.username,
      password: data.database.password,
      isActive: data.database.isActive,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  // Dashboard Management
  async getDashboardStats(): Promise<any> {
    const data = this.loadJsonFile('dashboard.json', { 
      stats: { todayAddedProducts: 0, updatedProducts: 0, activeXmlSources: 0, pendingImports: 0, totalCategories: 0, activeCronjobs: 0 },
      recentProducts: []
    });
    
    this.updateDashboardStats();
    return data.stats;
  }

  async getRecentProducts(): Promise<any[]> {
    const data = this.loadJsonFile('dashboard.json', { 
      stats: { todayAddedProducts: 0, updatedProducts: 0, activeXmlSources: 0, pendingImports: 0, totalCategories: 0, activeCronjobs: 0 },
      recentProducts: []
    });
    
    return data.recentProducts;
  }

  private updateDashboardStats(): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const activityData = this.loadJsonFile('activity-logs.json', { logs: [] });
    const xmlData = this.loadJsonFile('xml-sources.json', { sources: [] });
    const cronjobData = this.loadJsonFile('cronjobs.json', { jobs: [] });
    
    const todayLogs = activityData.logs.filter((log: any) => 
      log.createdAt && new Date(log.createdAt) >= today
    );
    
    const stats = {
      todayAddedProducts: todayLogs.filter((log: any) => log.type === "product_added").length,
      updatedProducts: todayLogs.filter((log: any) => 
        log.type === "stock_updated" || log.type === "price_updated"
      ).length,
      activeXmlSources: xmlData.sources.filter((source: any) => source.status === "active").length,
      pendingImports: 0,
      totalCategories: 8, // Demo kategori sayısı
      activeCronjobs: cronjobData.jobs.filter((job: any) => job.isActive).length
    };
    
    const dashboardData = this.loadJsonFile('dashboard.json', { 
      stats: stats,
      recentProducts: []
    });
    
    dashboardData.stats = stats;
    this.saveJsonFile('dashboard.json', dashboardData);
  }

  // Categories (from MySQL database)
  async getCategories(): Promise<Category[]> {
    // Önce MySQL'den kategorileri dene (production'da genellikle bu çalışır)
    try {
      console.log("🔍 Trying MySQL category_languages table first...");
      const { getLocalCategories } = await import('./mysql-import');
      const mysqlCategories = await getLocalCategories();
      
      if (mysqlCategories && mysqlCategories.length > 0) {
        // MySQL kategorilerini Category formatına çevir
        const convertedCategories: Category[] = mysqlCategories.map(cat => ({
          id: cat.categoryId.toString(), // category_id field'ını kullan
          name: cat.title,
          parentId: null, // MySQL'de parent bilgisi yoksa
          description: null,
          isActive: true,
          sortOrder: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }));
        
        console.log(`✅ Found ${convertedCategories.length} categories from MySQL category_languages table`);
        return convertedCategories;
      }
    } catch (mysqlError) {
      console.log("⚠️ MySQL categories failed, trying local database...", mysqlError instanceof Error ? mysqlError.message : String(mysqlError));
    }

    // MySQL başarısız olursa lokal veritabanını dene
    try {
      const dbCategories = await db.select().from(categories);
      
      if (dbCategories && dbCategories.length > 0) {
        console.log(`✅ Found ${dbCategories.length} categories from local database`);
        return dbCategories;
      }
    } catch (localDbError) {
      console.log("⚠️ Local database also failed:", localDbError instanceof Error ? localDbError.message : String(localDbError));
    }
    
    // Her ikisi de başarısız olursa hata fırlat
    console.error("❌ Both MySQL and local database failed");
    throw new Error("Kategoriler alınamadı - hem MySQL hem de lokal veritabanında hata oluştu");
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
    
    const matcher = new CategoryMatcher(localCategories);
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
    const xmlSource = await this.getXmlSource(xmlSourceId);
    if (!xmlSource || !xmlSource.extractedCategories) {
      throw new Error("XML source not found or no categories extracted");
    }

    const xmlCategories = Array.isArray(xmlSource.extractedCategories) 
      ? xmlSource.extractedCategories as string[]
      : [];
      
    const localCategories = await this.getCategories();
    
    // Gemini API key kontrolü
    const geminiSettings = await this.getGeminiSettings();
    console.log("🔧 Gemini Settings Check:", { 
      found: !!geminiSettings, 
      hasApiKey: !!(geminiSettings?.api_key), 
      keyLength: geminiSettings?.api_key?.length || 0,
      model: geminiSettings?.selected_model 
    });
    
    const useAI = geminiSettings && geminiSettings.api_key && geminiSettings.api_key.length > 10;
    console.log(`🤖 AI kullanım kararı: ${useAI}`);
    
    if (useAI) {
      console.log("🤖 AI kullanılarak kategori eşleştirmesi yapılıyor...");
      console.log(`📊 Input: ${xmlCategories.length} XML kategorisi, ${localCategories.length} yerel kategori`);
      try {
        const aiMappings = await import('./geminiService').then(async ({ GeminiService }) => {
          const geminiService = new GeminiService(geminiSettings.api_key);
          console.log("🔗 GeminiService instance oluşturuldu");
          return geminiService.mapCategoriesWithAI(
            xmlCategories, 
            localCategories.map(cat => ({ id: cat.id.toString(), name: cat.name })),
            geminiSettings.selected_model || "gemini-1.5-flash"
          );
        });
        
        const mappings = aiMappings.map((mapping: any) => {
          const suggestedCategory = mapping.suggestedCategory 
            ? localCategories.find(cat => cat.id.toString() === mapping.suggestedCategory!.id)
            : null;
            
          return {
            xmlCategory: mapping.xmlCategory,
            suggestedCategory: suggestedCategory || null,
            confidence: mapping.confidence,
            reasoning: mapping.reasoning
          };
        });
        
        const mapped = mappings.filter((m: any) => m.suggestedCategory !== null);
        const averageConfidence = mapped.length > 0 
          ? mapped.reduce((sum: number, m: any) => sum + m.confidence, 0) / mapped.length 
          : 0;

        console.log(`✅ AI Eşleştirme: ${mappings.length} kategori, ${mapped.length} eşleşti, ortalama güven: ${(averageConfidence * 100).toFixed(1)}%`);
        
        return {
          mappings,
          summary: {
            total: mappings.length,
            mapped: mapped.length,
            unmapped: mappings.length - mapped.length,
            averageConfidence
          }
        };
        
      } catch (error) {
        console.error("❌ AI eşleştirme hatası, fallback kullanılıyor:", error);
        // AI başarısız olursa fallback'e düş
      }
    } else {
      console.log("⚠️ AI kullanılamıyor (API key yok veya geçersiz), gelişmiş algoritma kullanılıyor...");
    }
    
    // Fallback: Gelişmiş CategoryMatcher algoritması kullan
    const matcher = new CategoryMatcher(localCategories);
    const matcherResults = matcher.autoMapCategories(xmlCategories, localCategories);
    
    const mappings = matcherResults.map(result => ({
      xmlCategory: result.xmlCategory,
      suggestedCategory: result.suggestedCategory,
      confidence: result.confidence,
      reasoning: result.suggestedCategory 
        ? `Algoritma ile eşleştirildi: "${result.xmlCategory}" → "${result.suggestedCategory.name}" (güven: ${(result.confidence * 100).toFixed(1)}%)`
        : `"${result.xmlCategory}" için uygun kategori bulunamadı`
    }));

    const mapped = mappings.filter(m => m.suggestedCategory !== null);
    const averageConfidence = mapped.length > 0 
      ? mapped.reduce((sum, m) => sum + m.confidence, 0) / mapped.length 
      : 0;

    console.log(`✅ Algoritma Eşleştirme: ${mappings.length} kategori, ${mapped.length} eşleşti, ortalama güven: ${(averageConfidence * 100).toFixed(1)}%`);

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
    const data = this.loadJsonFile('settings.json', { 
      gemini: { apiKey: "", selectedModel: "gemini-2.5-flash", isActive: false, isConfigured: false },
      database: { host: "", port: 3306, database: "", username: "", password: "", isActive: false }
    });
    return data.gemini.apiKey;
  }

  // Test Gemini API key
  testGeminiApiKey(apiKey: string): boolean {
    // Mock test - always return true for demo
    return !!(apiKey && apiKey.length > 10);
  }

  // XML Source bazlı kategori yönetimi
  async getExtractedCategoriesForSource(xmlSourceId: string): Promise<string[]> {
    const data = this.loadJsonFile('extracted-categories.json', { categories: [] });
    const sourceCategories = data.categories.filter((cat: any) => cat.xmlSourceId === xmlSourceId);
    return sourceCategories.map((cat: any) => cat.name);
  }

  async saveExtractedCategoriesForSource(xmlSourceId: string, categories: string[]): Promise<void> {
    const data = this.loadJsonFile('extracted-categories.json', { categories: [] });
    
    // Bu XML source'un mevcut kategorilerini sil
    data.categories = data.categories.filter((cat: any) => cat.xmlSourceId !== xmlSourceId);
    
    // Yeni kategorileri ekle
    const newCategories = categories.map(name => ({
      xmlSourceId,
      name,
      createdAt: new Date().toISOString()
    }));
    
    data.categories.push(...newCategories);
    this.saveJsonFile('extracted-categories.json', data);

    // XML source'u güncelle
    const xmlData = this.loadJsonFile('xml-sources.json', { sources: [] });
    const sourceIndex = xmlData.sources.findIndex((source: any) => source.id === xmlSourceId);
    if (sourceIndex !== -1) {
      xmlData.sources[sourceIndex].extractedCategories = categories;
      xmlData.sources[sourceIndex].updatedAt = new Date();
      this.saveJsonFile('xml-sources.json', xmlData);
    }

    // Log activity
    await this.createActivityLog({
      type: "categories_extracted",
      title: "Kategoriler çıkarıldı",
      description: `${categories.length} kategori XML'den çıkarıldı`,
      entityId: xmlSourceId,
      entityType: "xml_source"
    });
  }

  // Sadece belirli bir XML source'un kategorilerini döndür
  async getCategoriesForSource(xmlSourceId: string): Promise<string[]> {
    return await this.getExtractedCategoriesForSource(xmlSourceId);
  }

  // System Settings Management
  async getSystemSettings(): Promise<Record<string, any>> {
    const data = this.loadJsonFile('system-settings.json', { 
      settings: {
        image_storage_path: './public/images'
      }
    });
    return data.settings;
  }

  async updateSystemSetting(key: string, value: string): Promise<void> {
    const data = this.loadJsonFile('system-settings.json', { 
      settings: {
        image_storage_path: './public/images'
      }
    });
    
    data.settings[key] = value;
    data.updatedAt = new Date().toISOString();
    
    this.saveJsonFile('system-settings.json', data);
    
    // Log activity
    await this.createActivityLog({
      type: "system_setting_updated",
      title: "Sistem ayarı güncellendi",
      description: `${key} ayarı güncellendi: ${value}`,
      entityId: key,
      entityType: "system_setting"
    });
  }

  async getImageStoragePath(): Promise<string> {
    const settings = await this.getSystemSettings();
    // Replit ortamında çalışan güvenli path
    return settings.image_storage_path || './public/images';
  }
}

// Singleton instance
export const pageStorage = new PageStorage();