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

// Resim URL'sini indirip sunucuya kaydet
export async function downloadImage(imageUrl: string, productId: number, imageIndex: number): Promise<string | null> {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      return null;
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`❌ Failed to download image: ${imageUrl}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const extension = imageUrl.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `product_${productId}_${imageIndex}.${extension}`;
    const filePath = `/home/hercuma.com/public_html/public/images/${fileName}`;

    // Node.js fs ile dosya kaydet
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, Buffer.from(buffer));
    
    console.log(`📸 Image downloaded: ${fileName}`);
    return fileName;
  } catch (error) {
    console.error(`❌ Error downloading image ${imageUrl}:`, error);
    return null;
  }
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
        video_provider = ?, video_url = ?,
        updated_at = NOW()
       WHERE id = ?`,
      [
        product.price,
        product.stock || 0,
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
        product.stock || 0,
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
export async function batchImportProductsToMySQL(products: any[], batchSize = 100) {
  if (!importConnection) {
    throw new Error('Import database not connected');
  }

  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  console.log(`🚀 BATCH IMPORT başlatılıyor: ${products.length} ürün, ${batchSize}'li gruplar halinde`);
  
  // TABLE STRUCTURE DEBUG - Console başında göster
  console.log(`\n🚨 === TABLE STRUCTURE DEBUG ===`);
  const [describeResult] = await importConnection.execute('DESCRIBE products');
  console.log(`📊 Products table has ${(describeResult as any[]).length} columns:`);
  (describeResult as any[]).forEach((col, index) => {
    console.log(`  ${index + 1}. ${col.Field} (${col.Type})`);
  });
  console.log(`🚨 === END TABLE DEBUG ===\n`);

  // Ürünleri batch'lere böl
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    console.log(`📦 Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(products.length/batchSize)}: ${batch.length} ürün işleniyor...`);

    try {
      // Transaction başlat
      await importConnection.execute('START TRANSACTION');

      for (const product of batch) {
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
                 p.short_description = ?, p.description = ?, p.thumbnail = ?, p.images = ?,
                 p.video_provider = ?, p.video_url = ?, p.updated_at = NOW(),
                 pl.name = ?, pl.short_description = ?, pl.description = ?,
                 pl.tags = ?, pl.meta_title = ?, pl.meta_description = ?,
                 ps.price = ?, ps.current_stock = ?
               WHERE p.id = ?`,
              [
                product.name || null, product.price || 0, product.unit || 'adet', product.stock || 0, '[]', '[]', // products
                product.shortDescription || null, product.description || null, '{}', '[]', '', '', // products devamı
                product.name || null, product.shortDescription || null, product.description || null, // product_languages
                product.tags || null, product.metaTitle || product.name || null, product.metaDescription || null,
                product.price || 0, product.stock || 0, // product_stocks
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
            
            // 1. Products tablosuna ekle
            const [productResult] = await importConnection.execute(
              `INSERT INTO products (
                brand_id, category_id, user_id, created_by, slug, name, price, unit,
                purchase_cost, barcode, current_stock, minimum_order_quantity,
                status, is_approved, is_catalog, external_link, is_refundable, 
                cash_on_delivery, colors, attribute_sets, short_description, description,
                thumbnail, images, video_provider, video_url, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                product.brandId || 1, 
                product.categoryId || 1, 
                1, // user_id
                1, // created_by
                productSlug, 
                product.name || null,
                product.price || 0,
                product.unit || 'adet',
                (product.price || 0) * 0.7, // purchase_cost
                product.sku || null, 
                product.stock || 0, 
                product.minimumOrderQuantity || 1,
                'published', 
                1, // is_approved
                product.isCatalog ? 1 : 0, 
                product.externalLink || null,
                product.isRefundable ? 1 : 0, 
                product.cashOnDelivery ? 1 : 0,
                '[]', // colors (boş JSON array)
                '[]', // attribute_sets (boş JSON array)
                product.shortDescription || null, // short_description
                product.description || null, // description
                '{}', // thumbnail (boş JSON object)
                '[]', // images (boş JSON array)
                '', // video_provider
                '', // video_url
                new Date(), // created_at 
                new Date()  // updated_at
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
                product_id, name, sku, price, current_stock, image
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                productId, 
                null, // name (null)
                product.sku || null, 
                product.price || 0, 
                product.stock || 0, 
                '[]' // image (boş array string)
              ]
            );

            addedCount++;
          }
        } catch (productError) {
          console.error(`❌ Ürün işleme hatası (${product.name}):`, productError.message);
          skippedCount++;
        }
      }

      // Transaction commit
      await importConnection.execute('COMMIT');
      console.log(`✅ Batch tamamlandı: ${batch.length} ürün işlendi`);

    } catch (batchError) {
      // Transaction rollback
      await importConnection.execute('ROLLBACK');
      console.error('❌ Batch hatası, rollback yapıldı:', batchError.message);
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
  stock: number;
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
}) {
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
        cash_on_delivery, meta_image, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
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
        '[]', // selected_variants (JSON)
        '[]', // selected_variants_ids (JSON)
        '{}', // thumbnail (JSON) - sonra güncellenecek
        '[]', // images (JSON) - sonra güncellenecek
        '[]', // description_images (JSON)
        product.stock || 0, // current_stock
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
        product.stock || 0,
        JSON.stringify([]) // image (şimdilik boş)
      ]
    );
    console.log(`✅ Product stock data created`);

    // 4. RESİMLERİ İNDİR VE KAYDET
    const downloadedImages: string[] = [];
    let thumbnailImage = '';

    // Thumbnail resmi indir
    if (product.thumbnail && product.thumbnail.trim() !== '') {
      const downloadedThumbnail = await downloadImage(product.thumbnail, productId, 0);
      if (downloadedThumbnail) {
        thumbnailImage = downloadedThumbnail;
      }
    }

    // Diğer resimleri indir
    if (product.images && product.images.length > 0) {
      for (let i = 0; i < product.images.length; i++) {
        const imageUrl = product.images[i];
        if (imageUrl && imageUrl.trim() !== '') {
          const downloadedImage = await downloadImage(imageUrl, productId, i + 1);
          if (downloadedImage) {
            downloadedImages.push(downloadedImage);
          }
        }
      }
    }

    // 5. İNDİRİLEN RESİMLERİ VERİTABANINDA GÜNCELLE
    if (thumbnailImage || downloadedImages.length > 0) {
      await importConnection.execute(
        `UPDATE products SET thumbnail = ?, images = ? WHERE id = ?`,
        [
          JSON.stringify(thumbnailImage ? [thumbnailImage] : []),
          JSON.stringify(downloadedImages),
          productId
        ]
      );
      console.log(`📸 Updated product images: thumbnail=${thumbnailImage}, images=${downloadedImages.length}`);
    }

    // 6. IMAGES TABLOSUNA RESİM KAYITLARINI EKLE
    if (thumbnailImage) {
      await importConnection.execute(
        `INSERT INTO images (imageable_type, imageable_id, file_name, file_path, alt_text) VALUES (?, ?, ?, ?, ?)`,
        ['App\\Models\\Product', productId, thumbnailImage, `/public/images/${thumbnailImage}`, product.name]
      );
    }

    for (const imageName of downloadedImages) {
      await importConnection.execute(
        `INSERT INTO images (imageable_type, imageable_id, file_name, file_path, alt_text) VALUES (?, ?, ?, ?, ?)`,
        ['App\\Models\\Product', productId, imageName, `/public/images/${imageName}`, product.name]
      );
    }

    console.log(`🎉 Complete product import finished for: ${product.name} (ID: ${productId})`);
    return { productId, thumbnailImage, downloadedImages, isUpdate: false };
    
  } catch (error) {
    console.error('❌ Error in 3-table product import:', error);
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