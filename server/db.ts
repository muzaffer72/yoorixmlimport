import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from "@shared/schema";
import { readFileSync, existsSync } from 'fs';

// Settings.json'dan veritabanı ayarlarını oku
function getDatabaseConfig() {
  try {
    // PageStorage ile aynı yolu kullan
    const settingsPath = process.cwd() + '/server/data/settings.json';
    
    if (!existsSync(settingsPath)) {
      throw new Error(`settings.json dosyası bulunamadı: ${settingsPath}`);
    }
    
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    return buildConnectionUrl(settings);
    
  } catch (error) {
    console.error("❌ Settings.json'dan veritabanı ayarları okunamadı:", error);
    throw error;
  }
}

function buildConnectionUrl(settings: any): string {
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
}

// MySQL bağlantısı
let DATABASE_URL;
try {
  DATABASE_URL = getDatabaseConfig();
  console.log("✅ Database config başarıyla alındı");
} catch (dbConfigError) {
  console.error("❌ Database config hatası:", dbConfigError);
  throw dbConfigError;
}

export const connection = mysql.createPool({
  uri: DATABASE_URL,
  connectionLimit: 10,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
});

export const db = drizzle(connection, { schema, mode: 'default' });
