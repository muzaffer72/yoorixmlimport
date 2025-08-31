# XML Ürün İthalat Yönetim Paneli - Kurulum Talimatı

## Sistem Gereksinimleri

- **Node.js**: v18 veya üzeri
- **PostgreSQL**: v13 veya üzeri
- **RAM**: En az 2GB
- **Disk**: En az 1GB boş alan

## 1. Bağımlılıkları Kurma

### Node.js Kurulumu
```bash
# Ubuntu/Debian için
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL için
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

### PostgreSQL Kurulumu
```bash
# Ubuntu/Debian için
sudo apt update
sudo apt install postgresql postgresql-contrib

# CentOS/RHEL için
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

## 2. Veritabanı Kurulumu

```bash
# PostgreSQL kullanıcısına geçiş
sudo -u postgres psql

# Veritabanı ve kullanıcı oluşturma
CREATE DATABASE xml_product_manager;
CREATE USER xml_user WITH ENCRYPTED PASSWORD 'güçlü_şifre_buraya';
GRANT ALL PRIVILEGES ON DATABASE xml_product_manager TO xml_user;
\q
```

## 3. Projeyi İndirme ve Kurma

```bash
# Proje dosyalarını sunucuya yükleyin
# ZIP dosyası olarak veya git clone ile

# Proje dizinine girin
cd xml-product-manager

# Bağımlılıkları yükleyin
npm install
```

## 4. Çevre Değişkenlerini Ayarlama

`.env` dosyası oluşturun:

```bash
# Veritabanı bağlantısı
DATABASE_URL="postgresql://xml_user:güçlü_şifre_buraya@localhost:5432/xml_product_manager"

# PostgreSQL bağlantı detayları
PGHOST=localhost
PGPORT=5432
PGUSER=xml_user
PGPASSWORD=güçlü_şifre_buraya
PGDATABASE=xml_product_manager

# Gemini AI API Anahtarı (opsiyonel - kategori eşleştirme için)
GEMINI_API_KEY=your_gemini_api_key_here

# Session gizli anahtarı
SESSION_SECRET=çok_güçlü_ve_uzun_gizli_anahtar_buraya

# Sunucu ortamı
NODE_ENV=production
```

## 5. Veritabanı Şemasını Oluşturma

```bash
# Veritabanı tablolarını oluştur
npm run db:push
```

## 6. Uygulamayı Başlatma

### Geliştirme Ortamı için:
```bash
npm run dev
```

### Üretim Ortamı için:
```bash
# Uygulamayı build et
npm run build

# PM2 ile başlat (önerilen)
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### PM2 Konfigürasyon Dosyası (ecosystem.config.js)
```javascript
module.exports = {
  apps: [{
    name: 'xml-product-manager',
    script: 'npm',
    args: 'run dev',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    }
  }]
}
```

## 7. Nginx Reverse Proxy Kurulumu (Opsiyonel)

Nginx konfigürasyonu (`/etc/nginx/sites-available/xml-manager`):

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Siteyi etkinleştir
sudo ln -s /etc/nginx/sites-available/xml-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 8. SSL Sertifikası (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## 9. Güvenlik Duvarı Ayarları

```bash
# UFW ile port açma
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

## 10. Sistem Servisi Olarak Çalıştırma

`/etc/systemd/system/xml-manager.service` dosyası oluşturun:

```ini
[Unit]
Description=XML Product Manager
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/xml-product-manager
ExecStart=/usr/bin/npm run dev
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable xml-manager
sudo systemctl start xml-manager
sudo systemctl status xml-manager
```

## 11. Cronjob URL Endpoints

Otomatik XML ithalat işlemleri için webhook URL'leri:

```bash
# Manuel cronjob çalıştırma
POST /api/cronjobs/{id}/run

# Webhook URL (dış servisler için)
POST /api/webhook/cronjob/{id}
```

## 12. Kullanım

- Uygulamaya `http://your-domain.com` adresinden erişin
- İlk olarak XML kaynaklarını ekleyin
- Kategorileri yapılandırın
- Alan eşleştirmelerini yapın
- Cronjob'ları ayarlayın

## Sorun Giderme

### Log Dosyalarını Kontrol Etme
```bash
# PM2 logları
pm2 logs xml-product-manager

# Sistem servisi logları
sudo journalctl -u xml-manager -f
```

### Veritabanı Bağlantı Sorunu
```bash
# PostgreSQL servis durumu
sudo systemctl status postgresql

# Bağlantı testi
psql -h localhost -U xml_user -d xml_product_manager
```

### Port Çakışması
```bash
# 5000 portunu kullanan processleri bul
sudo lsof -i :5000
```

## Güncelleme

```bash
# Uygulamayı durdur
pm2 stop xml-product-manager

# Yeni dosyaları yükle
# git pull veya dosya kopyalama

# Bağımlılıkları güncelle
npm install

# Veritabanını güncelle
npm run db:push

# Uygulamayı başlat
pm2 start xml-product-manager
```

## İletişim

Herhangi bir sorun yaşarsanız, sistem loglarını kontrol edin ve gerekirse destek alın.