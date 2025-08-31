# MySQL Adaptasyon Rehberi

Bu rehber, uygulamayı PostgreSQL'den MySQL'e geçirmek için gerekli adımları açıklar.

## 1. MySQL Adaptasyonu için Gerekli Değişiklikler

### server/db.ts Dosyasını Güncelleme

PostgreSQL yerine MySQL kullanmak için `server/db.ts` dosyasını şu şekilde değiştirin:

```typescript
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// MySQL connection pool oluştur
export const connection = mysql.createPool(process.env.DATABASE_URL);
export const db = drizzle(connection, { schema, mode: 'default' });
```

### shared/schema.ts Dosyasını Güncelleme

PostgreSQL schema'larını MySQL'e çevirmek için şu değişiklikleri yapın:

```typescript
import { sql } from "drizzle-orm";
import { mysqlTable, text, varchar, int, decimal, timestamp, boolean, json } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Örnek tablo dönüşümü
export const xmlSources = mysqlTable("xml_sources", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  name: text("name").notNull(),
  url: text("url").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  lastFetch: timestamp("last_fetch"),
  productCount: int("product_count").default(0),
  fieldMapping: json("field_mapping"),
  categoryTag: text("category_tag"),
  useDefaultCategory: boolean("use_default_category").default(false),
  defaultCategoryId: varchar("default_category_id", { length: 36 }),
  extractedCategories: json("extracted_categories"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

## 2. Ana Değişiklikler

### PostgreSQL → MySQL Dönüşüm Tablosu

| PostgreSQL | MySQL |
|------------|-------|
| `pgTable` | `mysqlTable` |
| `varchar("id")` | `varchar("id", { length: 36 })` |
| `integer` | `int` |
| `jsonb` | `json` |
| `gen_random_uuid()` | `(UUID())` |

### Zorunlu Paket Güncellemeleri

```bash
npm uninstall @neondatabase/serverless drizzle-orm/pg-core
npm install mysql2 drizzle-orm/mysql-core
```

## 3. Veritabanı Connection String

MySQL için connection string formatı:

```bash
DATABASE_URL="mysql://username:password@localhost:3306/database_name"
```

## 4. Drizzle Config Güncelleme

`drizzle.config.ts` dosyasında:

```typescript
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "mysql", // postgresql → mysql
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
```

## 5. Tüm Tabloları Dönüştürme

Her tablo için aşağıdaki dönüşümleri yapın:

1. `pgTable` → `mysqlTable`
2. `varchar("field")` → `varchar("field", { length: X })`
3. `integer` → `int`
4. `jsonb` → `json`
5. `gen_random_uuid()` → `(UUID())`

## 6. Uygulama Testi

Dönüşüm sonrası test etmek için:

```bash
# Schema'yı MySQL'e push et
npm run db:push

# Uygulamayı başlat
npm run dev
```

## 7. Sorun Giderme

### Bağlantı Problemleri
- MySQL servisinin çalıştığını kontrol edin
- Connection string'in doğru olduğunu kontrol edin
- Kullanıcı izinlerini kontrol edin

### Schema Problemleri  
- Tüm `varchar` alanlarına length parametresi eklendiğini kontrol edin
- `json` veri tipinin MySQL versiyonunuzda desteklendiğini kontrol edin (MySQL 5.7+)

Bu rehberi takip ederek uygulamanızı başarıyla MySQL'e geçirebilirsiniz.