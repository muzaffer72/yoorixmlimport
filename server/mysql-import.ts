import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';

// MySQL import veritabanı bağlantısı (sizin mevcut veritabanınız)
let importConnection: mysql.Pool | null = null;
let importDb: any = null;

// Export for other modules
export function getImportConnection() {
  return importConnection;
}

export async function connectToImportDatabase(settings: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}) {

  // Zaten bağlı ise tekrar bağlanma
  if (importConnection) {
    console.log('✅ MySQL import bağlantısı zaten mevcut, yeniden bağlanılmıyor.');
    return;
  }

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
      connectTimeout: 60000,
      ssl: false,
      charset: 'utf8mb4'
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
      connectionLimit: 3,
      queueLimit: 0,
      acquireTimeout: 60000,
      timeout: 60000,
      ssl: false,
      connectTimeout: 60000,
      charset: 'utf8mb4'
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

// MySQL'deki products tablosunun yapısını kontrol et
export async function checkProductTableStructure() {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  try {
    console.log('🔍 Checking products table structure...');
    
    // Products tablosunu kontrol et
    const [tables] = await importConnection.execute('SHOW TABLES LIKE "products"');
    console.log('Products table exists:', tables);
    
    if (tables && (tables as any[]).length > 0) {
      // Tablo yapısını kontrol et
      const [columns] = await importConnection.execute('DESCRIBE products');
      console.log('Products table structure:', columns);
      return columns;
    } else {
      console.log('⚠️ Products table does not exist');
      return null;
    }
  } catch (error) {
    console.error('❌ Error checking products table:', error);
    throw error;
  }
}

// Laravel tarzı resim işleme sistemi - farklı boyutlarda resim oluştur
export async function processImageForLaravel(imageUrl: string, productId: number, imageIndex: number): Promise<any | null> {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      return null;
    }

    const sharp = (await import('sharp')).default;
    const fs = await import('fs/promises');
    const path = await import('path');
    const { pageStorage } = await import('./pageStorage');

    // Resmi indir
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`❌ Failed to download image: ${imageUrl}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14); // YYYYMMDDHHmmss
    const randomId = Math.floor(Math.random() * 1000);
    
    // Laravel image boyutları (ürün resimleri için)
    const imageSizes = ['40x40', '72x72', '190x230'];
    
    // Ayarlardan resim klasörü yolunu al
    const baseDirectory = await pageStorage.getImageStoragePath();
    console.log(`📁 Using image storage path: ${baseDirectory}`);
    
    // Dizin oluştur
    await fs.mkdir(baseDirectory, { recursive: true });
    
    // Original image
    const originalFileName = `${timestamp}_original__media_${randomId}.png`;
    const originalPath = path.join(baseDirectory, originalFileName);
    
    // Original'i kaydet
    await sharp(buffer)
      .png({ quality: 90 })
      .toFile(originalPath);
    
    // Resim JSON objesi oluştur (Laravel formatında)
    const imageObject: any = {
      storage: 'local',
      original_image: `images/${originalFileName}`
    };
    
    // Farklı boyutlarda resimler oluştur
    for (const size of imageSizes) {
      const [width, height] = size.split('x').map(Number);
      const sizedFileName = `${timestamp}${size}_media_${randomId}.png`;
      const sizedPath = path.join(baseDirectory, sizedFileName);
      
      await sharp(buffer)
        .resize(width, height, { 
          fit: 'cover', 
          position: 'center' 
        })
        .png({ quality: 90 })
        .toFile(sizedPath);
      
      imageObject[`image_${size}`] = `images/${sizedFileName}`;
    }
    
    console.log(`📸 Laravel-style image processed: ${originalFileName}`);
    return imageObject;
    
  } catch (error) {
    console.error(`❌ Error processing image ${imageUrl}:`, error);
    return null;
  }
}

// Media tablosuna resim ekleme fonksiyonu
export async function insertImageToMedia(imageUrl: string, imageIndex: number, imageObject: any, imageBuffer?: Buffer): Promise<number | null> {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  try {
    // Dosya uzantısını URL'den al
    const extension = imageUrl.split('.').pop()?.toLowerCase() || 'jpg';
    
    // Dosya boyutunu hesapla
    let fileSize = 0;
    if (imageBuffer) {
      fileSize = imageBuffer.length;
    } else {
      // Buffer yoksa tahmini boyut
      fileSize = Math.floor(Math.random() * 100000) + 10000; // 10KB-110KB arası
    }
    
    // Resim adını URL'den çıkar veya varsayılan ver
    let imageName = `resim${imageIndex + 1}`;
    try {
      const urlParts = imageUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];
      if (fileName && fileName.includes('.')) {
        imageName = fileName.split('.')[0].substring(0, 50); // Uzun isimleri kısalt
      }
    } catch (e) {
      // URL parse edilemezse varsayılan ismi kullan
    }
    
    // Media tablosuna resim ekle - TÜM ALANLAR DOLU
    const [result] = await importConnection.execute(
      `INSERT INTO media (
        name, user_id, storage, type, extension, size, 
        original_file, image_variants, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        imageName, // name: Gerçek resim adı
        1, // user_id
        'local', // storage
        'image', // type
        extension, // extension (jpg, png, gif vb.)
        fileSize, // size (gerçek dosya boyutu)
        imageObject.original_image, // original_file
        JSON.stringify(imageObject), // image_variants (tüm boyutlar)
        new Date(), // created_at
        new Date()  // updated_at
      ]
    );

    const mediaId = (result as any).insertId;
    console.log(`📸 Media tablosuna resim eklendi: ID ${mediaId}, Boyut: ${fileSize} bytes, Dosya: ${imageObject.original_image}`);
    return mediaId;
    
  } catch (error) {
    console.error(`❌ Media tablosuna resim ekleme hatası:`, error);
    return null;
  }
}

// Eski downloadImage fonksiyonu geriye dönük uyumluluk için
export async function downloadImage(imageUrl: string, productId: number, imageIndex: number): Promise<string | null> {
  const imageObject = await processImageForLaravel(imageUrl, productId, imageIndex);
  return imageObject ? imageObject.original_image : null;
}

// SKU'ya göre mevcut ürünü kontrol et
async function checkExistingProductBySKU(sku: string) {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  try {
    const [rows] = await importConnection.execute(
      `SELECT p.id, p.price, p.current_stock, ps.price as stock_price, ps.current_stock as stock_current_stock 
       FROM products p 
       LEFT JOIN product_stocks ps ON p.id = ps.product_id 
       WHERE p.barcode = ? OR ps.sku = ? 
       LIMIT 1`,
      [sku, sku]
    );
    
    return (rows as any[])[0] || null;
  } catch (error) {
    console.error('❌ SKU kontrol hatası:', error);
    return null;
  }
}

// Mevcut ürünü güncelle
async function updateExistingProduct(productId: number, product: any) {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  try {
    console.log(`🔄 Mevcut ürün güncelleniyor: ID ${productId}`);
    
    // 1. PRODUCTS tablosunu güncelle
    await importConnection.execute(
      `UPDATE products SET 
        price = ?, current_stock = ?, 
        selected_variants = ?, selected_variants_ids = ?,
        video_provider = ?, video_url = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [
        product.price,
        product.currentStock || 0,
        JSON.stringify([]), // selected_variants (JSON array)
        JSON.stringify([]), // selected_variants_ids (JSON array)
        product.videoProvider === "none" ? '' : (product.videoProvider || ''),
        product.videoProvider === "none" ? '' : (product.videoUrl || ''),
        productId
      ]
    );
    
    // 2. PRODUCT_LANGUAGES tablosunu güncelle
    await importConnection.execute(
      `UPDATE product_languages SET 
        name = ?, short_description = ?, description = ?, 
        tags = ?, meta_title = ?, meta_description = ?
       WHERE product_id = ?`,
      [
        product.name,
        product.shortDescription || null,
        product.description || null,
        product.tags || null,
        product.metaTitle || product.name,
        product.metaDescription || null,
        productId
      ]
    );
    
    // 3. PRODUCT_STOCKS tablosunu güncelle
    await importConnection.execute(
      `UPDATE product_stocks SET 
        price = ?, current_stock = ?
       WHERE product_id = ?`,
      [
        product.price,
        product.currentStock || 0,
        productId
      ]
    );
    
    console.log(`✅ Ürün başarıyla güncellendi: ${product.name} (ID: ${productId})`);
    return { productId, isUpdate: true };
    
  } catch (error) {
    console.error('❌ Ürün güncelleme hatası:', error);
    throw error;
  }
}

// HIZLI BATCH IMPORT - Çok ürün için optimize edilmiş
export async function batchImportProductsToMySQL(products: any[], batchSize: number = 100, xmlSourceId: string) {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  console.log(`🚀 BATCH IMPORT başlatılıyor: ${products.length} ürün, ${batchSize}'li gruplar halinde`);
  console.log(`🔍 Debug: batchSize = ${batchSize}, xmlSourceId = ${xmlSourceId}`);

  // Ürünleri batch'lere böl
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    console.log(`📦 Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(products.length/batchSize)}: ${batch.length} ürün işleniyor...`);

    try {
      // Transaction başlat
      await importConnection.execute('START TRANSACTION');

      for (let j = 0; j < batch.length; j++) {
        const product = batch[j];
        const productIndex = i + j; // Toplam ürün indeksi
        
        try {
          // SKU kontrolü - mevcut ürün var mı?
          let existingProduct = null;
          if (product.sku) {
            const [rows] = await importConnection.execute(
              `SELECT p.id FROM products p WHERE p.barcode = ? LIMIT 1`,
              [product.sku]
            );
            existingProduct = (rows as any[])[0] || null;
          }

          if (existingProduct) {
            // GÜNCELLEME - Tek query ile 3 tablo
            await importConnection.execute(
              `UPDATE products p
               LEFT JOIN product_languages pl ON p.id = pl.product_id
               LEFT JOIN product_stocks ps ON p.id = ps.product_id
               SET 
                 p.name = ?, p.price = ?, p.unit = ?, p.current_stock = ?, p.colors = ?, p.attribute_sets = ?,
                 p.selected_variants = ?, p.selected_variants_ids = ?,
                 p.short_description = ?, p.description = ?, p.thumbnail = ?, p.images = ?,
                 p.video_provider = ?, p.video_url = ?, p.updated_at = NOW(),
                 pl.name = ?, pl.short_description = ?, pl.description = ?,
                 pl.tags = ?, pl.meta_title = ?, pl.meta_description = ?,
                 ps.price = ?, ps.current_stock = ?
               WHERE p.id = ?`,
              [
                product.name || null, product.price || 0, product.unit || 'adet', product.currentStock || 0, '[]', '[]', // products
                JSON.stringify([]), JSON.stringify([]), // selected_variants alanları
                product.shortDescription || null, product.description || null, '{}', '[]', '', '', // products devamı
                product.name || null, product.shortDescription || null, product.description || null, // product_languages
                product.tags || null, product.metaTitle || product.name || null, product.metaDescription || null,
                product.price || 0, product.currentStock || 0, // product_stocks
                existingProduct.id
              ]
            );
            updatedCount++;
          } else {
            // YENİ EKLEME - Multi-table insert with single transaction
            const createUrlSafeSlug = (text: string): string => {
              return text
                .toLowerCase()
                .replace(/ç/g, 'c')
                .replace(/ğ/g, 'g') 
                .replace(/ı/g, 'i')
                .replace(/ö/g, 'o')
                .replace(/ş/g, 's')
                .replace(/ü/g, 'u')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .substring(0, 50); // Max 50 karakter
            };
            
            const productSlug = createUrlSafeSlug(product.name) + '-' + Date.now();
            
            // Resim debug - sadece ilk ürün için log çıkar
            if (productIndex === 0) {
              console.log(`🔍 Resim debug (ilk ürün): ${product.name}`);
              console.log(`📸 product.images:`, product.images);
              console.log(`📸 product.images type:`, typeof product.images);
              console.log(`📸 product.images length:`, product.images?.length);
            }
            
            // 1. Products tablosuna ekle - Sadece mevcut kolonları kullan
            const [productResult] = await importConnection.execute(
              `INSERT INTO products (
                brand_id, category_id, user_id, created_by, slug, price,
                purchase_cost, barcode, minimum_order_quantity,
                status, is_approved, is_catalog, external_link, is_refundable, 
                cash_on_delivery, colors, attribute_sets, selected_variants, selected_variants_ids,
                thumbnail, images, video_provider, video_url, current_stock, xmlkaynagi
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                product.brandId || null, 
                product.categoryId || null, 
                1, // user_id
                1, // created_by
                productSlug, 
                product.price || null,
                (product.price || 0) * 0.7, // purchase_cost
                product.sku || null, 
                product.minimumOrderQuantity || 1,
                'published', 
                1, // is_approved
                product.isCatalog ? 1 : 0, 
                product.externalLink || null,
                product.isRefundable ? 1 : 0, 
                product.cashOnDelivery ? 1 : 0,
                '[]', // colors (boş JSON array)
                '[]', // attribute_sets (boş JSON array)
                JSON.stringify([]), // selected_variants (JSON array)
                JSON.stringify([]), // selected_variants_ids (JSON array)
                '{}', // thumbnail (boş, sonra güncellenecek)
                '[]', // images (boş, sonra güncellenecek)
                '', // video_provider
                '', // video_url
                product.currentStock || 0, // current_stock
                xmlSourceId // xml_source_id
              ]
            );
            
            const productId = (productResult as any).insertId;

            // 2. Product_languages tablosuna ekle
            await importConnection.execute(
              `INSERT INTO product_languages (
                product_id, lang, name, short_description, description, 
                tags, meta_title, meta_description, unit
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                productId, 
                'tr', 
                product.name || null, 
                product.shortDescription || null,
                product.description || null, 
                product.tags || null, 
                product.metaTitle || product.name || null,
                product.metaDescription || null,
                product.unit || 'adet'
              ]
            );

            // 3. Product_stocks tablosuna ekle
            await importConnection.execute(
              `INSERT INTO product_stocks (
                product_id, name, sku, current_stock, price, image
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                productId, 
                '', // name (empty string)
                product.sku || null, 
                product.currentStock || 0, // current_stock
                product.price || 0, // price
                '[]' // image (boş array string)
              ]
            );

            // 4. RESİM İŞLEME - Product eklendikten sonra
            if (product.images && product.images.length > 0) {
              console.log(`📸 ${product.images.length} resim işleniyor: ${product.name} (ID: ${productId})`);
              
              let thumbnailData = '{}';
              let imagesData = '[]';
              let thumbnailId = null;
              let imageIds = [];
              const processedImages = [];
              
              for (let i = 0; i < product.images.length; i++) {
                try {
                  // Resmi indir ve işle
                  const response = await fetch(product.images[i]);
                  if (response.ok) {
                    const imageBuffer = Buffer.from(await response.arrayBuffer());
                    const imageObject = await processImageForLaravel(product.images[i], productId, i);
                    
                    if (imageObject) {
                      // Media tablosuna resim ekle (buffer ile birlikte)
                      const mediaId = await insertImageToMedia(product.images[i], i, imageObject, imageBuffer);
                      if (mediaId) {
                        processedImages.push(imageObject);
                        imageIds.push(mediaId);
                        
                        // İlk resmi thumbnail olarak ayarla
                        if (i === 0) {
                          thumbnailData = JSON.stringify(imageObject);
                          thumbnailId = mediaId;
                        }
                      }
                    }
                  } else {
                    console.error(`❌ Resim indirilemedi: ${product.images[i]} - HTTP ${response.status}`);
                  }
                } catch (imageError: any) {
                  console.error(`❌ Resim işleme hatası: ${product.images[i]}`, imageError?.message || imageError);
                }
              }
              
              if (processedImages.length > 0) {
                imagesData = JSON.stringify(processedImages);
                
                // Products tablosundaki resim alanlarını güncelle
                await importConnection.execute(
                  `UPDATE products SET thumbnail = ?, images = ?, thumbnail_id = ?, image_ids = ? WHERE id = ?`,
                  [thumbnailData, imagesData, thumbnailId, imageIds.join(','), productId]
                );
                
                console.log(`📸 Resim işleme tamamlandı: ${processedImages.length}/${product.images.length} - Media IDs: [${imageIds.join(', ')}]`);
              }
            }

            addedCount++;
          }
        } catch (productError: any) {
          console.error(`❌ Ürün işleme hatası (${product.name}):`, productError?.message || productError);
          skippedCount++;
        }
      }

      // Transaction commit
      await importConnection.execute('COMMIT');
      console.log(`✅ Batch tamamlandı: ${batch.length} ürün işlendi`);

    } catch (batchError: any) {
      // Transaction rollback
      await importConnection.execute('ROLLBACK');
      console.error('❌ Batch hatası, rollback yapıldı:', batchError?.message || batchError);
      skippedCount += batch.length;
    }
  }

  console.log(`🎉 BATCH IMPORT tamamlandı! Eklenen: ${addedCount}, Güncellenen: ${updatedCount}, Atlanan: ${skippedCount}`);
  return { addedCount, updatedCount, skippedCount };
}

// TÜM ÜRÜNLERİ SİL - 3 Tabloyu temizle
export async function deleteAllProductsFromMySQL() {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  try {
    console.log(`🗑️ TÜM ÜRÜNLER SİLİNİYOR - 3 tablo temizleniyor...`);
    
    // Transaction başlat
    await importConnection.execute('START TRANSACTION');

    // 1. PRODUCT_STOCKS tablosunu temizle
    const [stocksResult] = await importConnection.execute('DELETE FROM product_stocks');
    console.log(`✅ PRODUCT_STOCKS tablosu temizlendi: ${(stocksResult as any).affectedRows} kayıt silindi`);

    // 2. PRODUCT_LANGUAGES tablosunu temizle  
    const [languagesResult] = await importConnection.execute('DELETE FROM product_languages');
    console.log(`✅ PRODUCT_LANGUAGES tablosu temizlendi: ${(languagesResult as any).affectedRows} kayıt silindi`);

    // 3. PRODUCTS tablosunu temizle
    const [productsResult] = await importConnection.execute('DELETE FROM products');
    console.log(`✅ PRODUCTS tablosu temizlendi: ${(productsResult as any).affectedRows} kayıt silindi`);

    // Auto-increment ID'leri sıfırla
    await importConnection.execute('ALTER TABLE products AUTO_INCREMENT = 1');
    await importConnection.execute('ALTER TABLE product_languages AUTO_INCREMENT = 1');
    await importConnection.execute('ALTER TABLE product_stocks AUTO_INCREMENT = 1');

    // Transaction commit
    await importConnection.execute('COMMIT');
    
    console.log(`🎉 TÜM ÜRÜNLER BAŞARIYLA SİLİNDİ! Auto-increment ID'ler sıfırlandı.`);
    
    return {
      success: true,
      deletedProducts: (productsResult as any).affectedRows,
      deletedLanguages: (languagesResult as any).affectedRows,
      deletedStocks: (stocksResult as any).affectedRows
    };

  } catch (error) {
    // Transaction rollback
    await importConnection.execute('ROLLBACK');
    console.error('❌ Ürün silme hatası, rollback yapıldı:', error);
    throw error;
  }
}

// TEK ÜRÜN IMPORT (geriye dönük uyumluluk için)
export async function importProductToMySQL(product: {
  name: string;
  categoryId?: number;
  brandId?: number;
  price: number;
  description?: string;
  shortDescription?: string;
  sku?: string;
  currentStock: number; // stock yerine currentStock kullan
  barcode?: string;
  unit?: string;
  thumbnail?: string;
  images?: string[];
  tags?: string;
  metaTitle?: string;
  metaDescription?: string;
  videoProvider?: string;
  videoUrl?: string;
  minimumOrderQuantity?: number;
  isCatalog?: boolean;
  externalLink?: string;
  isRefundable?: boolean;
  cashOnDelivery?: boolean;
}, xmlSourceId: string) {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  try {
    console.log('📦 Starting 3-table import for:', product.name);
    
    // SKU kontrolü - mevcut ürün var mı?
    if (product.sku) {
      const existingProduct = await checkExistingProductBySKU(product.sku);
      if (existingProduct) {
        console.log(`🔄 Mevcut ürün bulundu (SKU: ${product.sku}), güncelleniyor...`);
        return await updateExistingProduct(existingProduct.id, product);
      } else {
        console.log(`➕ Yeni ürün (SKU: ${product.sku}), ekleniyor...`);
      }
    } else {
      console.log(`➕ SKU yok, yeni ürün ekleniyor...`);
    }
    
    // 1. PRODUCTS tablosuna ana ürün bilgilerini ekle (gerçek tablo yapısına uygun)
    const productSlug = product.name.toLowerCase().replace(/[^a-z0-9çğııöşü]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).substr(2, 5);
    
    const [productResult] = await importConnection.execute(
      `INSERT INTO products (
        brand_id, category_id, user_id, created_by, slug, name, unit, price, 
        special_discount, special_discount_type, special_discount_start, special_discount_end,
        purchase_cost, barcode, video_provider, video_url, colors, attribute_sets, 
        vat_taxes, has_variant, selected_variants, selected_variants_ids, 
        thumbnail, images, description_images, current_stock, minimum_order_quantity,
        stock_visibility, status, is_approved, is_catalog, external_link, 
        is_featured, is_classified, is_wholesale, contact_info, is_digital, 
        is_refundable, todays_deal, rating, viewed, shipping_type, shipping_fee,
        cash_on_delivery, meta_image, xmlkaynagi, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        product.brandId || null, // brand_id
        product.categoryId || null, // category_id  
        1, // user_id (varsayılan admin)
        1, // created_by (varsayılan admin)
        productSlug, // slug (benzersiz)
        product.name || '', // name
        product.unit || 'adet', // unit
        product.price, // price
        0, // special_discount
        'flat', // special_discount_type
        null, // special_discount_start
        null, // special_discount_end
        product.price * 0.7 || 0, // purchase_cost (fiyatın %70'i)
        product.barcode || '', // barcode
        product.videoProvider === "none" ? '' : (product.videoProvider || ''), // video_provider
        product.videoProvider === "none" ? '' : (product.videoUrl || ''), // video_url
        '[]', // colors (JSON)
        '[]', // attribute_sets (JSON)
        '', // vat_taxes
        0, // has_variant
        JSON.stringify([]), // selected_variants (JSON array)
        JSON.stringify([]), // selected_variants_ids (JSON array)
        '{}', // thumbnail (JSON) - sonra güncellenecek
        '[]', // images (JSON) - sonra güncellenecek
        '[]', // description_images (JSON)
        product.currentStock || 0, // current_stock
        product.minimumOrderQuantity || 1, // minimum_order_quantity
        'visible_with_quantity', // stock_visibility
        'published', // status
        1, // is_approved
        product.isCatalog ? 1 : 0, // is_catalog
        product.externalLink || '', // external_link
        0, // is_featured
        0, // is_classified
        0, // is_wholesale
        '', // contact_info
        0, // is_digital
        product.isRefundable ? 1 : 0, // is_refundable
        0, // todays_deal
        0, // rating
        0, // viewed
        'free', // shipping_type
        0, // shipping_fee
        product.cashOnDelivery ? 1 : 0, // cash_on_delivery
        '', // meta_image
        xmlSourceId, // xml_source_id
      ]
    );
    
    const productId = (productResult as any).insertId;
    console.log(`✅ Product created with ID: ${productId}`);

    // 2. PRODUCT_LANGUAGES tablosuna dil bilgilerini ekle
    await importConnection.execute(
      `INSERT INTO product_languages (
        product_id, name, short_description, description, tags, 
        meta_title, meta_description, unit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId,
        product.name,
        product.shortDescription || '',
        product.description || '',
        product.tags || '',
        product.metaTitle || product.name,
        product.metaDescription || '',
        product.unit || 'adet'
      ]
    );
    console.log(`✅ Product language data created`);

    // 3. PRODUCT_STOCKS tablosuna stok bilgilerini ekle
    await importConnection.execute(
      `INSERT INTO product_stocks (
        product_id, name, sku, price, current_stock, image
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        productId,
        '', // name (boş)
        product.sku || '',
        product.price,
        product.currentStock || 0,
        JSON.stringify([]) // image (şimdilik boş)
      ]
    );
    console.log(`✅ Product stock data created`);

    // 4. RESİMLERİ LARAVEL FORMATINDA İŞLE VE KAYDET
    let thumbnailObject = null;
    let imagesArray: any[] = [];

    // Thumbnail'i Laravel formatında işle
    if (product.thumbnail && product.thumbnail.trim() !== '') {
      console.log(`📸 Processing thumbnail: ${product.thumbnail}`);
      const processedThumbnail = await processImageForLaravel(product.thumbnail, productId, 0);
      if (processedThumbnail) {
        thumbnailObject = processedThumbnail;
        console.log(`✅ Thumbnail processed successfully`);
      }
    }

    // Diğer resimleri Laravel formatında işle
    if (product.images && product.images.length > 0) {
      console.log(`📸 Processing ${product.images.length} additional images...`);
      for (let i = 0; i < product.images.length; i++) {
        const imageUrl = product.images[i];
        if (imageUrl && imageUrl.trim() !== '') {
          const processedImage = await processImageForLaravel(imageUrl, productId, i + 1);
          if (processedImage) {
            imagesArray.push(processedImage);
            console.log(`✅ Image ${i + 1} processed successfully`);
          }
        }
      }
    }

    // 5. İŞLENEN RESİMLERİ LARAVEL FORMATINDA VERİTABANINDA GÜNCELLE
    if (thumbnailObject || imagesArray.length > 0) {
      const thumbnailJson = thumbnailObject ? JSON.stringify(thumbnailObject) : '{}';
      const imagesJson = imagesArray.length > 0 ? JSON.stringify(imagesArray) : '[]';
      
      await importConnection.execute(
        `UPDATE products SET thumbnail = ?, images = ? WHERE id = ?`,
        [
          thumbnailJson,
          imagesJson,
          productId
        ]
      );
      console.log(`📸 Updated product images in Laravel format: thumbnail=${!!thumbnailObject}, images=${imagesArray.length}`);
      
      // Debug log - Laravel format'ı kontrol et
      if (thumbnailObject) {
        console.log(`🔍 Thumbnail format:`, JSON.stringify(thumbnailObject, null, 2));
      }
      if (imagesArray.length > 0) {
        console.log(`🔍 Images format (first item):`, JSON.stringify(imagesArray[0], null, 2));
      }
    }

    // 6. LARAVEL FORMATINDAKI RESİMLER İÇİN IMAGES TABLOSUNA KAYIT
    if (thumbnailObject) {
      await importConnection.execute(
        `INSERT INTO images (imageable_type, imageable_id, file_name, file_path, alt_text) VALUES (?, ?, ?, ?, ?)`,
        ['App\\Models\\Product', productId, thumbnailObject.original_image, `/public/${thumbnailObject.original_image}`, product.name]
      );
    }

    for (const imageObj of imagesArray) {
      await importConnection.execute(
        `INSERT INTO images (imageable_type, imageable_id, file_name, file_path, alt_text) VALUES (?, ?, ?, ?, ?)`,
        ['App\\Models\\Product', productId, imageObj.original_image, `/public/${imageObj.original_image}`, product.name]
      );
    }

    console.log(`🎉 Complete product import finished for: ${product.name} (ID: ${productId})`);
    return { productId, thumbnailObject, imagesArray, isUpdate: false };
    
  } catch (error) {
    console.error('❌ Error in 3-table product import:', error);
    throw error;
  }
}

// XML SOURCE'A GÖRE RESİM ADLARINI TOPLAMA FONKSIYONU
async function collectImageNamesForXmlSource(xmlSourceId: string): Promise<string[]> {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  try {
    console.log(`🔍 ${xmlSourceId} XML kaynağına ait resim adları toplanıyor...`);
    
    // XML source'a ait ürünlerin thumbnail ve images verilerini al
    const [rows] = await importConnection.execute(
      `SELECT id, thumbnail, images FROM products WHERE xmlkaynagi = ?`,
      [xmlSourceId]
    );
    
    const products = rows as any[];
    const imageNames: string[] = [];
    
    for (const product of products) {
      // Thumbnail'dan resim adlarını çıkar
      if (product.thumbnail) {
        try {
          const thumbnailObj = JSON.parse(product.thumbnail);
          if (thumbnailObj.original_image) {
            // "images/filename.png" formatından sadece filename'i al
            const fileName = thumbnailObj.original_image.replace('images/', '');
            imageNames.push(fileName);
          }
          // Diğer boyutlardaki resimler
          ['40x40', '72x72', '190x230'].forEach(size => {
            if (thumbnailObj[`image_${size}`]) {
              const fileName = thumbnailObj[`image_${size}`].replace('images/', '');
              imageNames.push(fileName);
            }
          });
        } catch (e) {
          console.warn(`⚠️ Thumbnail JSON parse hatası (product ${product.id}):`, e);
        }
      }
      
      // Images array'dan resim adlarını çıkar
      if (product.images) {
        try {
          const imagesArray = JSON.parse(product.images);
          if (Array.isArray(imagesArray)) {
            for (const imageObj of imagesArray) {
              if (imageObj.original_image) {
                const fileName = imageObj.original_image.replace('images/', '');
                imageNames.push(fileName);
              }
              // Diğer boyutlardaki resimler
              ['40x40', '72x72', '190x230'].forEach(size => {
                if (imageObj[`image_${size}`]) {
                  const fileName = imageObj[`image_${size}`].replace('images/', '');
                  imageNames.push(fileName);
                }
              });
            }
          }
        } catch (e) {
          console.warn(`⚠️ Images JSON parse hatası (product ${product.id}):`, e);
        }
      }
    }
    
    // Tekrarlanan dosya adlarını temizle
    const uniqueImageNames = Array.from(new Set(imageNames));
    console.log(`📸 Toplam ${uniqueImageNames.length} benzersiz resim dosyası bulundu.`);
    
    return uniqueImageNames;
    
  } catch (error) {
    console.error('❌ Resim adları toplarken hata:', error);
    throw error;
  }
}

// XML SOURCE'A GÖRE RESİMLERİ SİLME FONKSIYONU
async function deleteImagesForXmlSource(xmlSourceId: string): Promise<number> {
  try {
    const { pageStorage } = await import('./pageStorage');
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Ayarlardan resim klasörü yolunu al
    const imageStoragePath = await pageStorage.getImageStoragePath();
    console.log(`📁 Resim klasörü: ${imageStoragePath}`);
    
    // Bu XML source'a ait resim adlarını topla
    const imageNames = await collectImageNamesForXmlSource(xmlSourceId);
    
    if (imageNames.length === 0) {
      console.log('📸 Silinecek resim bulunamadı.');
      return 0;
    }
    
    let deletedCount = 0;
    console.log(`🗑️ ${imageNames.length} resim dosyası silinecek...`);
    
    for (const imageName of imageNames) {
      try {
        const imagePath = path.join(imageStoragePath, imageName);
        await fs.unlink(imagePath);
        deletedCount++;
        console.log(`✅ Silindi: ${imageName}`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.warn(`⚠️ Dosya bulunamadı (zaten silinmiş): ${imageName}`);
        } else {
          console.error(`❌ Resim silme hatası (${imageName}):`, error);
        }
      }
    }
    
    console.log(`🎉 ${deletedCount}/${imageNames.length} resim dosyası başarıyla silindi.`);
    return deletedCount;
    
  } catch (error) {
    console.error('❌ Resim silme işlemi sırasında hata:', error);
    throw error;
  }
}

// XML SOURCE'A GÖRE TÜM ÜRÜNLERİ VE RESİMLERİ SİLME
export async function deleteProductsByXmlSource(xmlSourceId: string) {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  try {
    console.log(`🗑️ ${xmlSourceId} XML kaynağına ait tüm ürünler siliniyor...`);
    
    // Transaction başlat
    await importConnection.execute('START TRANSACTION');
    
    // 1. Önce resimleri sil (ürünler silinmeden önce resim bilgilerini al)
    const deletedImagesCount = await deleteImagesForXmlSource(xmlSourceId);
    
    // 2. XML source'a ait ürün ID'lerini al
    const [productRows] = await importConnection.execute(
      `SELECT id FROM products WHERE xmlkaynagi = ?`,
      [xmlSourceId]
    );
    
    const productIds = (productRows as any[]).map(row => row.id);
    
    if (productIds.length === 0) {
      console.log('⚠️ Bu XML kaynağına ait ürün bulunamadı.');
      await importConnection.execute('COMMIT');
      return {
        success: true,
        deletedProducts: 0,
        deletedLanguages: 0,
        deletedStocks: 0,
        deletedImages: deletedImagesCount
      };
    }
    
    console.log(`📦 ${productIds.length} ürün bulundu, siliniyor...`);
    
    // 3. İlişkili tabloları temizle
    const productIdsList = productIds.map(() => '?').join(',');
    
    // PRODUCT_STOCKS tablosunu temizle
    const [stocksResult] = await importConnection.execute(
      `DELETE FROM product_stocks WHERE product_id IN (${productIdsList})`,
      productIds
    );
    console.log(`✅ PRODUCT_STOCKS temizlendi: ${(stocksResult as any).affectedRows} kayıt`);
    
    // PRODUCT_LANGUAGES tablosunu temizle
    const [languagesResult] = await importConnection.execute(
      `DELETE FROM product_languages WHERE product_id IN (${productIdsList})`,
      productIds
    );
    console.log(`✅ PRODUCT_LANGUAGES temizlendi: ${(languagesResult as any).affectedRows} kayıt`);
    
    // IMAGES tablosunu temizle (polymorphic relationship)
    const [imagesResult] = await importConnection.execute(
      `DELETE FROM images WHERE imageable_type = 'App\\\\Models\\\\Product' AND imageable_id IN (${productIdsList})`,
      productIds
    );
    console.log(`✅ IMAGES tablosu temizlendi: ${(imagesResult as any).affectedRows} kayıt`);
    
    // 4. Ana PRODUCTS tablosunu temizle
    const [productsResult] = await importConnection.execute(
      `DELETE FROM products WHERE xmlkaynagi = ?`,
      [xmlSourceId]
    );
    console.log(`✅ PRODUCTS tablosu temizlendi: ${(productsResult as any).affectedRows} kayıt`);
    
    // Transaction commit
    await importConnection.execute('COMMIT');
    
    console.log(`🎉 ${xmlSourceId} XML kaynağına ait tüm ürünler ve resimler başarıyla silindi!`);
    
    return {
      success: true,
      deletedProducts: (productsResult as any).affectedRows,
      deletedLanguages: (languagesResult as any).affectedRows,
      deletedStocks: (stocksResult as any).affectedRows,
      deletedImages: deletedImagesCount
    };

  } catch (error) {
    // Transaction rollback
    await importConnection.execute('ROLLBACK');
    console.error('❌ XML source ürün silme hatası, rollback yapıldı:', error);
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