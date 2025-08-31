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
    console.log(`=== MySQL Bağlantı Denemesi ===`);
    console.log(`Host: ${settings.host}`);
    console.log(`Port: ${settings.port}`);
    console.log(`Database: ${settings.database}`);
    console.log(`Username: ${settings.username}`);
    console.log(`Password length: ${settings.password?.length || 0}`);
    
    // Önce basit bir bağlantı deneyimi yapalım
    console.log('Attempting direct MySQL connection...');
    
    const simpleConnection = await mysql.createConnection({
      host: settings.host,
      port: settings.port,
      user: settings.username,
      password: settings.password,
      database: settings.database,
      connectTimeout: 10000,
      ssl: false
    });
    
    console.log('Direct connection successful, testing query...');
    const [rows] = await simpleConnection.execute('SELECT 1 as test');
    console.log('Query test successful:', rows);
    await simpleConnection.end();
    
    // Şimdi pool oluşturalım
    console.log('Creating connection pool...');
    importConnection = mysql.createPool({
      host: settings.host,
      port: settings.port,
      user: settings.username,
      password: settings.password,
      database: settings.database,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      acquireTimeout: 15000,
      timeout: 15000,
      ssl: false,
      connectTimeout: 10000
    });

    // Pool test
    const testConnection = await importConnection.getConnection();
    console.log('Pool connection obtained');
    await testConnection.ping();
    console.log('Pool ping successful');
    testConnection.release();

    importDb = drizzle(importConnection);
    
    console.log('✅ MySQL import database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ MySQL connection failed with detailed error:');
    console.error('Error name:', error.name);
    console.error('Error code:', error.code);
    console.error('Error errno:', error.errno);
    console.error('Error sqlState:', error.sqlState);
    console.error('Error sqlMessage:', error.sqlMessage);
    console.error('Full error:', error);
    throw error;
  }
}

// Mevcut category_languages tablosundan kategorileri çek
export async function getLocalCategories(): Promise<Array<{id: number, categoryId: number, title: string}>> {
  if (!importConnection) {
    console.error('❌ Import database connection is null');
    throw new Error('Import database not connected');
  }

  try {
    console.log('🔍 Fetching categories from category_languages table...');
    
    // Önce tabloyu kontrol edelim
    const [tables] = await importConnection.execute('SHOW TABLES LIKE "category_languages"');
    console.log('Tables check result:', tables);
    
    if (!tables || (tables as any[]).length === 0) {
      console.log('⚠️ category_languages table does not exist');
      throw new Error('category_languages tablosu bulunamadı');
    }
    
    // Tablo yapısını kontrol edelim
    const [columns] = await importConnection.execute('DESCRIBE category_languages');
    console.log('Table structure:', columns);
    
    // Kategorileri çekelim - hem id hem category_id çekmemiz gerekiyor
    const [rows] = await importConnection.execute(
      'SELECT id, category_id, title FROM category_languages WHERE title IS NOT NULL AND title != ""'
    );
    
    console.log(`✅ Found ${(rows as any[]).length} categories in category_languages table`);
    console.log('Sample categories:', (rows as any[]).slice(0, 3));
    
    return rows as Array<{id: number, categoryId: number, title: string}>;
  } catch (error) {
    console.error('❌ Error fetching local categories:');
    console.error('Error details:', error);
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