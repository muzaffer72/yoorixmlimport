import { sql } from "drizzle-orm";
import { mysqlTable, text, varchar, int, decimal, timestamp, boolean, json } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const xmlSources = mysqlTable("xml_sources", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  name: text("name").notNull(),
  url: text("url").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("active"), // active, inactive, error
  lastFetch: timestamp("last_fetch"),
  productCount: int("product_count").default(0),
  fieldMapping: json("field_mapping"), // JSON object for field mappings (product fields)
  sampleStructure: json("sample_structure"), // First product structure from XML
  categoryTag: text("category_tag"), // XML tag name that contains category info
  useDefaultCategory: boolean("use_default_category").default(false),
  defaultCategoryId: varchar("default_category_id", { length: 36 }),
  extractedCategories: json("extracted_categories"), // Store extracted XML categories
  profitMarginType: varchar("profit_margin_type", { length: 20 }).default("none"), // none, percent, fixed
  profitMarginPercent: decimal("profit_margin_percent", { precision: 5, scale: 2 }).default("0.00"),
  profitMarginFixed: decimal("profit_margin_fixed", { precision: 10, scale: 2 }).default("0.00"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const activityLogs = mysqlTable("activity_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  type: varchar("type", { length: 50 }).notNull(), // product_added, stock_updated, price_updated, xml_synced
  title: text("title").notNull(),
  description: text("description"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  entityId: varchar("entity_id", { length: 36 }), // product ID, XML source ID, etc.
  entityType: varchar("entity_type", { length: 50 }), // product, xml_source, category
  createdAt: timestamp("created_at").defaultNow(),
});

export const cronjobs = mysqlTable("cronjobs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  name: text("name").notNull(),
  xmlSourceId: varchar("xml_source_id", { length: 36 }).notNull(),
  frequency: varchar("frequency", { length: 50 }).notNull(), // hourly, daily, weekly, custom
  cronExpression: text("cron_expression"), // For custom frequencies
  isActive: boolean("is_active").default(true),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  lastRunStatus: varchar("last_run_status", { length: 50 }), // success, failed, running
  runCount: int("run_count").default(0),
  failureCount: int("failure_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const systemSettings = mysqlTable("system_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const products = mysqlTable("products", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  name: text("name").notNull(),
  categoryId: varchar("category_id", { length: 36 }),
  brandId: varchar("brand_id", { length: 36 }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  currentStock: int("current_stock").notNull(),
  minimumOrderQuantity: int("minimum_order_quantity").notNull(),
  slug: text("slug"),
  barcode: text("barcode"),
  sku: text("sku"),
  tags: text("tags"),
  videoProvider: text("video_provider"),
  videoUrl: text("video_url"),
  isApproved: boolean("is_approved").default(true),
  isCatalog: boolean("is_catalog").default(false),
  externalLink: text("external_link"),
  isRefundable: boolean("is_refundable").default(true),
  cashOnDelivery: boolean("cash_on_delivery").default(true),
  shortDescription: text("short_description"),
  description: text("description"),
  thumbnail: json("thumbnail"), // Ana ürün resmi için
  images: json("images"), // Ek resimler için (array)
  xmlSourceId: varchar("xml_source_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const categories = mysqlTable("categories", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  name: text("name").notNull(),
  parentId: varchar("parent_id", { length: 36 }),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  sortOrder: int("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const brands = mysqlTable("brands", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const categoryMappings = mysqlTable("category_mappings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  xmlSourceId: varchar("xml_source_id", { length: 36 }).notNull(),
  xmlCategoryName: text("xml_category_name").notNull(),
  localCategoryId: int("local_category_id").notNull(), // MySQL category_languages tablosundaki ID
  confidence: decimal("confidence", { precision: 3, scale: 2 }).default("0.00"), // AI confidence score
  isManual: boolean("is_manual").default(false), // Manually set mapping
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const geminiSettings = mysqlTable("gemini_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  apiKey: text("api_key").notNull(),
  model: varchar("model", { length: 100 }).notNull().default("gemini-2.5-flash"),
  maxTokens: int("max_tokens").default(1000),
  temperature: decimal("temperature", { precision: 2, scale: 1 }).default("0.7"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const databaseSettings = mysqlTable("database_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  host: varchar("host", { length: 255 }).notNull(),
  port: int("port").notNull().default(3306),
  database: varchar("database", { length: 255 }).notNull(),
  username: varchar("username", { length: 255 }).notNull(),
  password: text("password").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Mevcut MySQL veritabanınızdaki category_languages tablosuna bağlanmak için
export const categoriesLanguages = mysqlTable("category_languages", {
  id: int("id").primaryKey(),
  categoryId: int("category_id").notNull(), // Asıl kategori ID'si - products tablosunda kullanılacak
  title: text("title").notNull(), // Bu sütundan kategori isimleri çekilecek
  // Diğer sütunlar varsa ekleyin
});

// Type exports
export type XmlSource = typeof xmlSources.$inferSelect;
export type InsertXmlSource = typeof xmlSources.$inferInsert;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = typeof activityLogs.$inferInsert;

export type Cronjob = typeof cronjobs.$inferSelect;
export type InsertCronjob = typeof cronjobs.$inferInsert;

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

export type Brand = typeof brands.$inferSelect;
export type InsertBrand = typeof brands.$inferInsert;

export type CategoryMapping = typeof categoryMappings.$inferSelect;
export type InsertCategoryMapping = typeof categoryMappings.$inferInsert;

export type GeminiSettings = typeof geminiSettings.$inferSelect;
export type InsertGeminiSettings = typeof geminiSettings.$inferInsert;

export type DatabaseSettings = typeof databaseSettings.$inferSelect;
export type InsertDatabaseSettings = typeof databaseSettings.$inferInsert;

export type CategoryLanguage = typeof categoriesLanguages.$inferSelect;

export type SystemSettings = typeof systemSettings.$inferSelect;
export type InsertSystemSettings = typeof systemSettings.$inferInsert;

// Zod schemas
export const insertXmlSourceSchema = createInsertSchema(xmlSources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastFetch: true,
  productCount: true
}).extend({
  profitMarginPercent: z.union([z.string(), z.number()]).optional().transform(val => val?.toString() || "0.00"),
  profitMarginFixed: z.union([z.string(), z.number()]).optional().transform(val => val?.toString() || "0.00")
});
export const insertActivityLogSchema = createInsertSchema(activityLogs);
export const insertCronjobSchema = createInsertSchema(cronjobs);
export const insertProductSchema = createInsertSchema(products);
export const insertCategorySchema = createInsertSchema(categories);
export const insertBrandSchema = createInsertSchema(brands);
export const insertCategoryMappingSchema = createInsertSchema(categoryMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export const insertGeminiSettingsSchema = createInsertSchema(geminiSettings);
export const insertDatabaseSettingsSchema = createInsertSchema(databaseSettings);
export const insertSystemSettingsSchema = createInsertSchema(systemSettings);