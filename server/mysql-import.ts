import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';

// MySQL import veritabanı bağlantısı (sizin mevcut veritabanınız)
let importConnection: mysql.Pool | null = null;
let importDb: any = null;

export async function connectToImportDatabase(settings: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}) {

  try {
    const connectionString = `mysql://${settings.username}:${settings.password}@${settings.host}:${settings.port}/${settings.database}`;
    
    console.log(`Attempting MySQL connection to: ${settings.host}:${settings.port}/${settings.database} with user: ${settings.username}`);
    
    importConnection = mysql.createPool({
      host: settings.host,
      port: settings.port,
      user: settings.username,
      password: settings.password,
      database: settings.database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true,
      ssl: false
    });

    // Test connection
    const testConnection = await importConnection.getConnection();
    await testConnection.ping();
    testConnection.release();

    importDb = drizzle(importConnection);
    
    console.log('MySQL import database connected successfully');
    return true;
  } catch (error) {
    console.error('MySQL import database connection failed:', error);
    throw error;
  }
}

// Mevcut categories_languages tablosundan kategorileri çek
export async function getLocalCategories(): Promise<Array<{id: number, title: string}>> {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  try {
    const [rows] = await importConnection.execute(
      'SELECT id, title FROM categories_languages WHERE title IS NOT NULL'
    );
    return rows as Array<{id: number, title: string}>;
  } catch (error) {
    console.error('Error fetching local categories:', error);
    throw error;
  }
}

// Ürünleri mevcut MySQL veritabanınıza import et
export async function importProductToMySQL(product: {
  name: string;
  categoryId?: number;
  price: number;
  description?: string;
  sku?: string;
  stock: number;
  // Diğer gerekli alanlar
}) {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  try {
    // Burada sizin mevcut ürün tablonuzun yapısına göre insert yapacağız
    // Örnek (tablo yapınızı gönderin, ona göre düzenlerim):
    const [result] = await importConnection.execute(
      `INSERT INTO products (name, category_id, price, description, sku, stock, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [product.name, product.categoryId, product.price, product.description, product.sku, product.stock]
    );
    
    return result;
  } catch (error) {
    console.error('Error importing product to MySQL:', error);
    throw error;
  }
}

export async function closeImportConnection() {
  if (importConnection) {
    await importConnection.end();
    importConnection = null;
    importDb = null;
  }
}