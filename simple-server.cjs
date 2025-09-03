const express = require('express');
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

// Mock categories data
const mockCategories = [
  { id: "368", name: "Aksesuar", title: "Aksesuar", parentId: null, createdAt: new Date() },
  { id: "369", name: "Diğer Aksesuarlar", title: "Diğer Aksesuarlar", parentId: "368", createdAt: new Date() },
  { id: "371", name: "Kol Düğmesi", title: "Kol Düğmesi", parentId: "368", createdAt: new Date() },
  { id: "400", name: "Elektronik", title: "Elektronik Ürünler", parentId: null, createdAt: new Date() },
  { id: "401", name: "Telefon", title: "Akıllı Telefonlar", parentId: "400", createdAt: new Date() },
  { id: "402", name: "Bilgisayar", title: "Bilgisayar ve Laptop", parentId: "400", createdAt: new Date() },
  { id: "450", name: "Giyim", title: "Giyim ve Aksesuar", parentId: null, createdAt: new Date() },
  { id: "500", name: "Ev", title: "Ev ve Yaşam", parentId: null, createdAt: new Date() }
];

// Categories to JSON endpoint
app.post("/api/categories/save-to-json", (req, res) => {
  try {
    console.log("🔄 Kategoriler JSON'a kaydediliyor...");
    
    // Simulate saving to file
    require('fs').writeFileSync(
      path.join(__dirname, 'yerel-kategoriler.json'),
      JSON.stringify({
        categories: mockCategories,
        lastUpdated: new Date().toISOString(),
        source: "mock-database",
        count: mockCategories.length
      }, null, 2)
    );
    
    console.log(`✅ ${mockCategories.length} kategori yerel-kategoriler.json dosyasına kaydedildi`);
    
    res.json({
      success: true,
      message: `${mockCategories.length} kategori başarıyla yerel-kategoriler.json dosyasına kaydedildi`,
      count: mockCategories.length,
      categories: mockCategories
    });
  } catch (error) {
    console.error("❌ Kategori kaydetme hatası:", error);
    res.status(500).json({
      success: false,
      message: "Kategoriler kaydedilirken hata oluştu: " + error.message,
      count: 0
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🚀 Simple server running on http://localhost:${PORT}`);
});
