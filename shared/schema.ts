import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const xmlSources = pgTable("xml_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  url: text("url").notNull(),
  status: varchar("status").notNull().default("active"), // active, inactive, error
  lastFetch: timestamp("last_fetch"),
  productCount: integer("product_count").default(0),
  fieldMapping: jsonb("field_mapping"), // JSON object for field mappings (product fields)
  categoryTag: text("category_tag"), // XML tag name that contains category info
  useDefaultCategory: boolean("use_default_category").default(false),
  defaultCategoryId: varchar("default_category_id"),
  extractedCategories: jsonb("extracted_categories"), // Store extracted XML categories
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type").notNull(), // product_added, stock_updated, price_updated, xml_synced
  title: text("title").notNull(),
  description: text("description"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  entityId: varchar("entity_id"), // product ID, XML source ID, etc.
  entityType: varchar("entity_type"), // product, xml_source, category
  createdAt: timestamp("created_at").defaultNow(),
});

export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  categoryId: varchar("category_id"),
  brandId: varchar("brand_id"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  currentStock: integer("current_stock").notNull(),
  minimumOrderQuantity: integer("minimum_order_quantity").notNull(),
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
  thumbnail: jsonb("thumbnail"), // Ana ürün resmi için
  images: jsonb("images"), // Ek resimler için (array)
  xmlSourceId: varchar("xml_source_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  parentId: varchar("parent_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const brands = pgTable("brands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const categoryMappings = pgTable("category_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  xmlSourceId: varchar("xml_source_id").notNull(),
  xmlCategoryName: text("xml_category_name").notNull(),
  localCategoryId: varchar("local_category_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const databaseSettings = pgTable("database_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(3306),
  database: text("database").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  isActive: boolean("is_active").default(false),
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

// Types
export type XmlSource = typeof xmlSources.$inferSelect;
export type InsertXmlSource = z.infer<typeof insertXmlSourceSchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Category = typeof categories.$inferSelect;
export type Brand = typeof brands.$inferSelect;

export type CategoryMapping = typeof categoryMappings.$inferSelect;
export type InsertCategoryMapping = z.infer<typeof insertCategoryMappingSchema>;

export type DatabaseSettings = typeof databaseSettings.$inferSelect;
export type InsertDatabaseSettings = z.infer<typeof insertDatabaseSettingsSchema>;

// Keep original user schema for compatibility
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
