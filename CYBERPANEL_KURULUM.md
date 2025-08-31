# XML Management Panel - Cyberpanel Kurulum Kılavuzu

## Sistem Gereksinimleri
- PHP 8.1+ 
- MySQL/MariaDB 10.4+
- Composer
- Node.js 18+ (frontend için)

## Kurulum Adımları

### 1. Dosyaları Yükle
```bash
# Ana dizine dosyaları yükle
cd /home/kullanici.com/xml.kullanici.com

# Laravel backend'i kurmak için
cd laravel
composer install --optimize-autoloader --no-dev
```

### 2. Environment Dosyası
```bash
# .env dosyasını kopyala ve düzenle
cp .env.example .env

# Laravel key oluştur
php artisan key:generate
```

### 3. .env Dosyasını Düzenle
```env
APP_NAME="XML Product Manager"
APP_ENV=production
APP_DEBUG=false
APP_URL=http://xml.hercuma.com

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=herc_xmlaktar
DB_USERNAME=herc_xmlaktar
DB_PASSWORD=güçlü_şifre_buraya

GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Veritabanı Kurulumu
```bash
# Migration'ları çalıştır
php artisan migrate

# Cache temizle
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

### 5. Frontend Build
```bash
# Ana dizinde
npm install
npm run build
```

### 6. Dosya İzinleri
```bash
# Laravel için gerekli izinler
chmod -R 775 laravel/storage
chmod -R 775 laravel/bootstrap/cache
chown -R www-data:www-data laravel/storage
chown -R www-data:www-data laravel/bootstrap/cache
```

## API Proxy Yapısı

Frontend'den Laravel API'ye erişim için proxy sistem:

```php
// public_html/api/index.php
<?php
// Tüm API isteklerini Laravel'e yönlendir
$request_uri = $_SERVER['REQUEST_URI'];
$api_path = str_replace('/api', '', $request_uri);

// Laravel API'ye proxy
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, 'http://localhost:8000/api' . $api_path);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
}

$headers = getallheaders();
$curl_headers = [];
foreach($headers as $key => $value) {
    $curl_headers[] = $key . ': ' . $value;
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $curl_headers);

$result = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

http_response_code($http_code);
header('Content-Type: application/json');
echo $result;
?>
```

### 7. Cron Job Kurulumu
```bash
# Crontab düzenle
crontab -e

# XML sync için dakikada bir çalışacak job
* * * * * cd /path/to/laravel && php artisan schedule:run >> /dev/null 2>&1
```

## Sorun Giderme

### Hata: "Permission denied"
```bash
chmod -R 755 laravel/
chown -R www-data:www-data laravel/
```

### Hata: "Database connection failed"
1. MySQL servisinin çalıştığını kontrol et
2. Veritabanı kullanıcısının izinlerini kontrol et
3. .env dosyasındaki bağlantı bilgilerini kontrol et

### Frontend'den API'ye erişim sorunu
1. .htaccess dosyasının doğru yapılandırıldığını kontrol et
2. PHP proxy dosyasının çalıştığını test et
3. CORS ayarlarını kontrol et

## Güvenlik Önerileri
- .env dosyasını web erişimi dışında tut
- Database şifrelerini güçlü yap
- Production'da debug modunu kapat
- SSL sertifikası kullan