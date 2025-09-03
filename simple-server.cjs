const express = require('express');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const app = express();

// Simple CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());

// Database connection
let importConnection = null;

// Get database settings from settings.json
function getDatabaseSettings() {
  try {
    const settingsPath = path.join(__dirname, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (!data.database || !data.database.host) {
      return null;
    }
    
    return {
      host: data.database.host,
      port: data.database.port || 3306,
      database: data.database.database,
      username: data.database.username,
      password: data.database.password,
      isActive: data.database.isActive
    };
  } catch (error) {
    console.error('Error reading database settings:', error);
    return null;
  }
}

// Connect to MySQL
async function connectToDatabase() {
  const dbSettings = getDatabaseSettings();
  if (!dbSettings || !dbSettings.host) {
    throw new Error('MySQL database ayarları yapılandırılmamış');
  }

  console.log('Connecting to MySQL...');
  importConnection = mysql.createPool({
    host: dbSettings.host,
    port: dbSettings.port,
    user: dbSettings.username,
    password: dbSettings.password,
    database: dbSettings.database,
    connectionLimit: 10,
    connectTimeout: 60000,
    ssl: false,
    charset: 'utf8mb4'
  });

  // Test connection
  const [rows] = await importConnection.execute('SELECT 1 as test');
  console.log('MySQL connection successful');
  return importConnection;
}

// Get categories from MySQL
async function getLocalCategories() {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  try {
    console.log('🔍 Fetching categories from category_languages table...');
    
    // Check if table exists
    const [tables] = await importConnection.execute('SHOW TABLES LIKE "category_languages"');
    if (!tables || tables.length === 0) {
      throw new Error('category_languages tablosu bulunamadı');
    }
    
    // Get categories
    const [rows] = await importConnection.execute(
      'SELECT id, category_id, title FROM category_languages WHERE title IS NOT NULL AND title != ""'
    );
    
    console.log(`✅ Found ${rows.length} categories in category_languages table`);
    return rows;
    
  } catch (error) {
    console.error('Error fetching categories from MySQL:', error);
    throw error;
  }
}

// Categories to JSON endpoint
app.post("/api/categories/save-to-json", async (req, res) => {
  try {
    console.log("🔄 Kategorileri MySQL'den çekip JSON'a kaydediliyor...");
    
    // Connect to database if not connected
    if (!importConnection) {
      await connectToDatabase();
    }
    
    // Get categories from MySQL
    const dbCategories = await getLocalCategories();
    
    // Transform data to expected format
    const categories = dbCategories.map(cat => ({
      id: cat.category_id.toString(),
      name: cat.title,
      title: cat.title,
      parentId: null, // MySQL'de parent ilişkisi varsa buraya eklenebilir
      createdAt: new Date()
    }));
    
    // Prepare data for JSON file
    const categoriesData = {
      categories: categories,
      lastUpdated: new Date().toISOString(),
      source: "mysql-database",
      count: categories.length,
      mysqlTable: "category_languages"
    };
    
    // Save to JSON file in the specified directory
    const targetDir = '/home/hercuma.com/xml.hercuma.com/server/data';
    const filePath = path.join(targetDir, 'yerel-kategoriler.json');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`📁 Created directory: ${targetDir}`);
    }
    
    fs.writeFileSync(filePath, JSON.stringify(categoriesData, null, 2));
    
    console.log(`✅ ${categories.length} kategori MySQL'den çekilip ${filePath} dosyasına kaydedildi`);
    
    res.json({
      success: true,
      message: `${categories.length} kategori başarıyla MySQL'den çekilip ${filePath} dosyasına kaydedildi`,
      count: categories.length,
      categories: categories,
      source: "mysql-database",
      filePath: filePath
    });
  } catch (error) {
    console.error("❌ Kategori kaydetme hatası:", error);
    
    // Specific error handling for database issues
    let errorMessage = error.message;
    let suggestions = [];
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = "MySQL sunucusuna bağlanılamıyor";
      suggestions = [
        "MySQL sunucusunun çalıştığından emin olun",
        "settings.json dosyasında doğru host ve port ayarlandığından emin olun",
        "Güvenlik duvarı ayarlarını kontrol edin"
      ];
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      errorMessage = "MySQL kullanıcı adı veya şifre hatalı";
      suggestions = [
        "settings.json dosyasında username ve password'u kontrol edin",
        "MySQL kullanıcısının veritabanına erişim yetkisi olduğundan emin olun"
      ];
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      errorMessage = "Belirtilen veritabanı bulunamıyor";
      suggestions = [
        "settings.json dosyasında database adını kontrol edin",
        "Veritabanının mevcut olduğundan emin olun"
      ];
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      count: 0,
      error: error.message,
      suggestions: suggestions,
      errorCode: error.code
    });
  }
});

// Get local JSON categories endpoint
app.get("/api/categories/local-json", (req, res) => {
  try {
    const filePath = path.join(__dirname, 'yerel-kategoriler.json');
    if (require('fs').existsSync(filePath)) {
      const data = JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
      res.json(data);
    } else {
      res.json({
        categories: [],
        lastUpdated: null,
        count: 0,
        message: "Henüz kaydedilmiş kategori yok"
      });
    }
  } catch (error) {
    console.error("❌ JSON kategoriler okunurken hata:", error);
    res.status(500).json({
      categories: [],
      lastUpdated: null,
      count: 0,
      error: error.message
    });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Simple server running on http://xml.hercuma.com:${PORT}`);
});
