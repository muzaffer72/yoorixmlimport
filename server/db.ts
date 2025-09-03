import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from "@shared/schema";
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Settings.json'dan veritabanı ayarlarını oku
function getDatabaseConfig() {
  try {
    const settingsPath = join(__dirname, 'data', 'settings.json');
    if (!existsSync(settingsPath)) {
      throw new Error("settings.json dosyası bulunamadı: " + settingsPath);
    }
    
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    if (!settings.database || !settings.database.isActive) {
      throw new Error("Database ayarları settings.json'da bulunamadı veya aktif değil");
    }
    
    const db = settings.database;
    const connectionUrl = `mysql://${db.username}:${db.password}@${db.host}:${db.port}/${db.database}`;
    
    console.log("✅ Veritabanı ayarları settings.json'dan okundu:", {
      host: db.host,
      port: db.port,
      database: db.database,
      username: db.username
    });
    
    return connectionUrl;
  } catch (error) {
    console.error("❌ Settings.json'dan veritabanı ayarları okunamadı:", error);
    throw error;
  }
}

// MySQL bağlantısı
const DATABASE_URL = getDatabaseConfig();
export const connection = mysql.createPool(DATABASE_URL);
export const db = drizzle(connection, { schema, mode: 'default' });
