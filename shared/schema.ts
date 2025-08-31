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
  categoryTag: text("category_tag"), // XML tag name that contains category info
  useDefaultCategory: boolean("use_default_category").default(false),
  defaultCategoryId: varchar("default_category_id", { length: 36 }),
  extractedCategories: json("extracted_categories"), // Store extracted XML categories
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

// Mevcut sistem - String ID'li categories
export const categories = mysqlTable("categories", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  name: text("name").notNull(),
  parentId: varchar("parent_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const brands = mysqlTable("brands", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const categoryMappings = mysqlTable("category_mappings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  xmlSourceId: varchar("xml_source_id", { length: 36 }).notNull(),
  xmlCategoryName: text("xml_category_name").notNull(),
  localCategoryId: varchar("local_category_id", { length: 36 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const databaseSettings = mysqlTable("database_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: int("port").notNull().default(3306),
  database: text("database").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const geminiSettings = mysqlTable("gemini_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  apiKey: text("api_key").notNull(),
  selectedModel: text("selected_model").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertXmlSourceSchema = createInsertSchema(xmlSources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCategoryMappingSchema = createInsertSchema(categoryMappings).omit({
  id: true,
  createdAt: true,
});

export const insertDatabaseSettingsSchema = createInsertSchema(databaseSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGeminiSettingsSchema = createInsertSchema(geminiSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type XmlSource = typeof xmlSources.$inferSelect;
export type InsertXmlSource = z.infer<typeof insertXmlSourceSchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Category = typeof categories.$inferSelect;
export type CategoryLanguage = typeof categoryLanguages.$inferSelect;
export type Brand = typeof brands.$inferSelect;

export type CategoryMapping = typeof categoryMappings.$inferSelect;
export type InsertCategoryMapping = z.infer<typeof insertCategoryMappingSchema>;

export type DatabaseSettings = typeof databaseSettings.$inferSelect;
export type InsertDatabaseSettings = z.infer<typeof insertDatabaseSettingsSchema>;

export type GeminiSettings = typeof geminiSettings.$inferSelect;
export type InsertGeminiSettings = z.infer<typeof insertGeminiSettingsSchema>;

export const insertCronjobSchema = createInsertSchema(cronjobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  runCount: true,
  failureCount: true,
  lastRun: true,
  nextRun: true,
  lastRunStatus: true,
});

export type Cronjob = typeof cronjobs.$inferSelect;
export type InsertCronjob = z.infer<typeof insertCronjobSchema>;

// Keep original user schema for compatibility
export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  username: text("username").notNull(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
