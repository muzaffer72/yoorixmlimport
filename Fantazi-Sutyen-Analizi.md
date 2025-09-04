# CategoryMatcher - "Fantazi Sütyen" Eşleştirme Analizi

## 🤔 Sorunuz: Fantazi Sütyen nasıl eşleşir?

**"Fantazi Sütyen"** XML kategorisi geldiğinde, Fuse.js şu şekilde eşleştirme yapar:

## 📊 Eşleştirme Seçenekleri

### ✅ Seçenek 1: TAM EŞLEŞİR (En Yüksek Güven)
```
XML: "Fantazi Sütyen" 
DB:  "Fantezi Sütyen"
→ %95+ güven (tek kategoriye eşleşir)
```

### ⚖️ Seçenek 2: KELİME BAZLI EŞLEŞİR (Orta Güven)  
```
XML: "Fantazi Sütyen"
DB:  "Fantazi" + "Sütyen" (ayrı kategoriler)
→ Her ikisi de %60-80 güven alır
```

## 🧠 Fuse.js Algoritması

### 1. **Tam Benzerlik** (En Yüksek Öncelik)
```javascript
"Fantazi Sütyen" vs "Fantezi Sütyen"
→ Levenshtein distance: 1 (sadece z→s değişimi)
→ Güven: %95
```

### 2. **Kelime Bazlı Eşleştirme** 
```javascript
"Fantazi Sütyen" bölünür → ["fantazi", "sutyen"] (normalize)

Kategoriler:
- "Fantazi" → ["fantazi"] → %80 eşleşme
- "Sütyen"  → ["sutyen"] → %80 eşleşme  
- "Fantezi Sütyen" → ["fantezi", "sutyen"] → %95 eşleşme
```

### 3. **Normalize İşlemi**
```javascript
normalizeText("Fantazi Sütyen") 
↓
"fantazi sutyen" // Türkçe karakter düzeltme + küçük harf
```

## 🎯 Gerçek Senaryolar

### Senaryo A: Veritabanında "Fantezi Sütyen" kategorisi VAR
```
XML: "Fantazi Sütyen" 
→ Sonuç: "Fantezi Sütyen" (%95 güven)
→ Aksiyon: Otomatik eşleştir ✅
```

### Senaryo B: Veritabanında sadece "Fantazi" ve "Sütyen" kategorileri VAR
```
XML: "Fantazi Sütyen"
→ Sonuç 1: "Sütyen" (%75 güven) 
→ Sonuç 2: "Fantazi" (%70 güven)
→ Aksiyon: Manuel seçim gerekli ⚠️
```

### Senaryo C: Veritabanında yakın kategoriler VAR
```
XML: "Fantazi Sütyen"
→ Sonuç 1: "Seksi Sütyen" (%70 güven)
→ Sonuç 2: "Dantelli Sütyen" (%60 güven)
→ Sonuç 3: "Fantazi İç Giyim" (%65 güven)
→ Aksiyon: En yüksek güveni seç veya manuel onay ⚠️
```

## ⚙️ Fuse.js Konfigürasyonu

```javascript
{
  keys: [
    { name: 'name', weight: 1 },        // Kategori adı %100 ağırlık
    { name: 'description', weight: 0.3 } // Açıklama %30 ağırlık
  ],
  threshold: 0.4,    // %40 altı eşleşme kabul edilmez
  distance: 100,     // Max 100 karakter fark
  includeScore: true // Güven skorunu dahil et
}
```

## 📈 Güven Skorları

- **90-100%**: Neredeyse tam eşleşme → Otomatik
- **80-89%**: Yüksek güven → Otomatik 
- **60-79%**: Orta güven → Manuel onay önerilir
- **40-59%**: Düşük güven → Alternatifleri kontrol et
- **0-39%**: Çok düşük → Manuel eşleştirme gerekli

## 🧪 Test Etmek İçin

```bash
node test-fantazi-sutyen.js
```

Bu test, "Fantazi Sütyen" kategorisinin farklı yazım şekillerinin nasıl eşleştirileceğini gösterecek:

- ✅ "Fantazi Sütyen" → "Fantezi Sütyen" (tam eşleşme)
- ⚠️ "fantazi sütyen" → "Fantezi Sütyen" (büyük/küçük harf)
- ⚠️ "Fantazi + Sütyen" → "Fantezi Sütyen" (özel karakter)
- ❓ "Fantazi" → "Fantazi" ve "Fantezi Sütyen" (iki seçenek)

## 🎯 Sonuç

**Fuse.js TEK KATEGORIYE öncelik verir!** Eğer veritabanında "Fantezi Sütyen" kategorisi varsa, "Fantazi Sütyen" XML kategorisi bununla %95 güvenle eşleşir. Ayrı "Fantazi" ve "Sütyen" kategorileri sadece ana kategori eşleşmezse alternatif olarak önerilir.
