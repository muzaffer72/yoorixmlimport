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

// 3 tablolu ürün import sistemi (Laravel PHP örneğine uygun)
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
    
    // 1. PRODUCTS tablosuna ana ürün bilgilerini ekle (gerçek tablo yapısına uygun)
    const productSlug = product.name.toLowerCase().replace(/[^a-z0-9çğııöşü]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Math.random().toString(36).substr(2, 5);
    
    const [productResult] = await importConnection.execute(
      `INSERT INTO products (
        brand_id, category_id, user_id, created_by, slug, price, 
        special_discount, special_discount_type, special_discount_start, special_discount_end,
        purchase_cost, barcode, video_provider, video_url, colors, attribute_sets, 
        vat_taxes, has_variant, selected_variants, selected_variants_ids, 
        thumbnail, images, description_images, current_stock, minimum_order_quantity,
        stock_visibility, status, is_approved, is_catalog, external_link, 
        is_featured, is_classified, is_wholesale, contact_info, is_digital, 
        is_refundable, todays_deal, rating, viewed, shipping_type, 
        cash_on_delivery, meta_image, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        product.brandId || null, // brand_id
        product.categoryId || null, // category_id  
        1, // user_id (varsayılan admin)
        1, // created_by (varsayılan admin)
        productSlug, // slug (benzersiz)
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
    return { productId, thumbnailImage, downloadedImages };
    
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