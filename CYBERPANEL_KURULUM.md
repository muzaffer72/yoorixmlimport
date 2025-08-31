# Cyberpanel Kurulum Rehberi

## 1. Dosyaları Yükleme
- Tüm proje dosyalarını `/home/domain.com/public_html/` klasörüne yükleyin
- SSH ile bağlanın veya File Manager kullanın

## 2. Node.js Kurulumu (Cyberpanel)
```bash
# Cyberpanel'de Node.js etkinleştir
# Terminal'den:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 3. Veritabanı Kurulumu
Cyberpanel'de:
- Database → Create Database
- Database Name: `xml_manager`
- Username: `xml_user` 
- Password: güçlü şifre
- Host: `localhost`

## 4. Bağımlılıkları Yükleme
```bash
cd /home/domain.com/public_html
npm install
```

## 5. Ortam Değişkenleri (.env)
```bash
# Ana sistem veritabanı (MySQL)
DATABASE_URL="mysql://xml_user:şifreniz@localhost:3306/xml_manager"

# Gemini AI (opsiyonel)
GEMINI_API_KEY=your_api_key_here

# Session güvenlik
SESSION_SECRET=uzun_güvenli_anahtar_buraya

# Ortam
NODE_ENV=production
```

## 6. Veritabanı Tablolarını Oluşturma
```bash
npm run db:push
```

## 7. Uygulamayı Başlatma
```bash
# Geliştirme modu
npm run dev

# Üretim modu
NODE_ENV=production npm run dev
```

## 8. Port Ayarı (Cyberpanel)
- App → Create App
- App Type: Node.js
- Port: 5000
- Startup File: index.js

## 9. Domain Bağlama
- Domain'inizi 5000 portuna yönlendirin
- Veya reverse proxy ile 80/443'e yönlendirin

## Kullanım
1. Ana sistem veritabanı: XML kaynakları ve ayarları için
2. Hedef veritabanı: Ayarlar sayfasından ekleyeceğiniz e-ticaret veritabanı
3. XML'ler parse edilip hedef veritabanına yazılır

## Sorun Giderme
- Port 5000'in açık olduğunu kontrol edin
- MySQL servisinin çalıştığını kontrol edin
- Log dosyalarını kontrol edin: `pm2 logs` veya konsol çıktısı