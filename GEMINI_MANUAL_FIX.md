# Gemini API Düzeltme Talimatları

## Problem
Sistem şu anda test API (`@google/genai`) kullanıyor ve gerçek Google Gemini API ile çalışmıyor. Bu durum hatalara neden oluyor.

## Çözüm
Aşağıdaki adımları izleyerek sistemi gerçek Google Generative AI API'sini kullanacak şekilde güncelleyebilirsiniz.

## Manuel Kurulum Adımları

### 1. Package Güncellemesi
Node.js yüklü olan bir terminal/command prompt'ta şu komutları çalıştırın:

```bash
cd c:\hercumayoorixml\yoorixmlimportguncel\yoorixmlimport
npm uninstall @google/genai
npm install @google/generative-ai
```

### 2. Kod Değişiklikleri
Bu değişiklikler zaten yapılmıştır, ancak doğrulayabilirsiniz:

#### a) server/geminiService.ts
- ✅ Import değiştirildi: `GoogleGenerativeAI` from `@google/generative-ai`
- ✅ Constructor düzeltildi: `new GoogleGenerativeAI(apiKey)`
- ✅ Method isimları değiştirildi:
  - `testApiKeyAndGetModels` → `validateApiKeyAndGetModels`
  - `testAIConnection` → `validateConnection`
- ✅ Hata yönetimi geliştirildi

#### b) server/routes.ts  
- ✅ Endpoint değiştirildi: `/api/gemini/validate-api-key`
- ✅ Method çağrıları güncellendi

#### c) server/pageStorage.ts
- ✅ Mock test fonksiyonu kaldırıldı

#### d) client/src/pages/settings.tsx
- ✅ API endpoint güncellendi

### 3. Google API Key Alma
1. Google Cloud Console'a gidin: https://console.cloud.google.com/
2. Yeni bir proje oluşturun veya mevcut projeyi seçin
3. "APIs & Services" > "Credentials" menüsüne gidin
4. "Create Credentials" > "API Key" seçin
5. Generative AI API'sini etkinleştirin:
   - "APIs & Services" > "Library" 
   - "Generative Language API" arayın ve etkinleştirin
6. API anahtarınızı kopyalayın

### 4. API Key Konfigürasyonu
1. Uygulamayı başlatın
2. Settings sayfasına gidin
3. "Gemini AI Settings" bölümünde API anahtarınızı girin
4. "Test API Key" butonuna tıklayarak doğrulayın

## Test Etme

Paketi güncelledikten sonra:

```bash
npm run dev
```

Sonra Settings sayfasında:
1. Gerçek Gemini API anahtarınızı girin
2. "Test API Key" butonuna tıklayın
3. Başarılı mesajı görmelisiniz

## Beklenen Değişiklikler

- ❌ Eski hata: "Cannot find module '@google/genai'"
- ✅ Yeni durum: Gerçek Google Generative AI API ile çalışır
- ✅ API key doğrulama çalışır
- ✅ Kategori eşleştirme çalışır
- ✅ Ürün açıklama optimizasyonu çalışır

## Troubleshooting

### Hala hata alıyorsanız:
1. node_modules klasörünü silin: `rm -rf node_modules`
2. Package lock'u silin: `rm package-lock.json`
3. Tekrar kurun: `npm install`

### API hatası alıyorsanız:
1. API anahtarının geçerli olduğunu kontrol edin
2. Google Cloud Console'da Generative AI API'sinin etkin olduğunu kontrol edin
3. API quota'nızı kontrol edin

## Sonuç
Bu güncellemelerden sonra sistem gerçek Google Gemini API kullanacak ve test fonksiyonları yerine gerçek doğrulama yapacaktır.
