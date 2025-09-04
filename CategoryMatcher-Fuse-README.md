# CategoryMatcher - Fuse.js Implementation

Bu güncellemede, kategori eşleştirmesini Gemini API'sından Fuse.js'e geçirdik. Fuse.js, fuzzy string searching için optimize edilmiş bir JavaScript kütüphanesidir.

## Yapılan Değişiklikler

### 1. Kütüphane Değişikliği
- ❌ Gemini API (AI tabanlı eşleştirme)
- ✅ Fuse.js (Fuzzy string matching)

### 2. Avantajları

#### Performans
- **Hızlı**: Lokal hesaplama, API çağrısı yok
- **Çevrimdışı**: İnternet bağlantısı gerektirmez
- **Düşük gecikme**: Milisaniye seviyesinde yanıt süresi

#### Maliyet
- **Ücretsiz**: API key veya ücretli servis gerektirmez
- **Sınırsız kullanım**: İstek limiti yok

#### Güvenilirlik
- **Kararlı sonuçlar**: Her seferinde aynı girdi için aynı sonuç
- **Bağımsızlık**: Dış servislere bağımlılık yok
- **Özelleştirilebilir**: Algoritmayı ihtiyaçlara göre ayarlayabilir

### 3. Özellikler

#### Türkçe Karakter Desteği
```typescript
private normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    // ...
}
```

#### Esnek Eşleştirme
- **Threshold**: 0.4 (40% benzerlik yeterli)
- **Distance**: 100 karakter mesafesine kadar arama
- **Weight**: Kategori adı %100, açıklama %30 ağırlık
- **Fuzzy**: Yazım hatalarına toleranslı

#### Çoklu Sonuç Desteği
```typescript
// Tek eşleşme
const result = matcher.findCategory('Akıllı Telefon');

// Çoklu eşleşme (en iyi 5 sonuç)
const results = matcher.findMultipleCategories('Elektronik', 5);
```

### 4. API Değişiklikleri

#### Yeni Constructor
```typescript
// Eski (parametre yok)
const matcher = new CategoryMatcher();

// Yeni (kategoriler gerekli)
const matcher = new CategoryMatcher(categories);
```

#### Yeni Metodlar
```typescript
// Tekil kategori arama
findCategory(xmlCategory: string): {
  category: Category | null;
  confidence: number;
  alternatives: Array<{ category: Category; confidence: number }>;
}

// Çoklu kategori arama
findMultipleCategories(xmlCategory: string, limit?: number): Array<{
  category: Category;
  confidence: number;
  matches?: Array<{ key: string; value: string; indices: readonly [number, number][] }>;
}>

// Kategori listesi güncelleme
updateCategories(categories: Category[]): void
```

### 5. Güven Skorları

Güven skorları 0-1 arasında (100% = tam eşleşme):

- **Yüksek güven (>80%)**: Kesin eşleşme, otomatik olarak kullanılabilir
- **Orta güven (60-80%)**: İyi eşleşme, manuel onay önerilir
- **Düşük güven (40-60%)**: Zayıf eşleşme, alternatifler kontrolü gerekli
- **Eşleşmedi (<=40%)**: Manuel kategori seçimi gerekli

### 6. Kullanım Örneği

```typescript
import { CategoryMatcher } from './categoryMatcher';

const categories = [
  { id: '1', name: 'Elektronik', ... },
  { id: '2', name: 'Telefon', ... },
  // ...
];

const matcher = new CategoryMatcher(categories);

// XML'den gelen kategori
const xmlCategory = 'Akıllı Telefonlar';

// Eşleştirme yap
const result = matcher.findCategory(xmlCategory);

if (result.category && result.confidence > 0.8) {
  console.log(`Yüksek güvenle eşleşti: ${result.category.name}`);
} else if (result.alternatives.length > 0) {
  console.log('Alternatif öneriler:', result.alternatives);
}
```

### 7. Performans Karşılaştırması

| Özellik | Gemini API | Fuse.js |
|---------|------------|---------|
| Hız | ~2-5 saniye | ~1-10 ms |
| Maliyet | Ücretli | Ücretsiz |
| İnternet | Gerekli | Gereksiz |
| Doğruluk | Yüksek | Orta-Yüksek |
| Özelleştirme | Sınırlı | Tam |

### 8. Yapılandırma Seçenekleri

```typescript
const fuseOptions = {
  keys: [
    { name: 'name', weight: 1 },           // Kategori adı (ana ağırlık)
    { name: 'description', weight: 0.3 }    // Açıklama (düşük ağırlık)
  ],
  threshold: 0.4,          // Eşleşme toleransı (0=kesin, 1=her şey)
  distance: 100,           // Maksimum karakter mesafesi
  minMatchCharLength: 2,   // Minimum eşleşme uzunluğu
  includeScore: true,      // Güven skorunu dahil et
  includeMatches: true,    // Eşleşen kısımları göster
  ignoreLocation: true,    // Konumu önemseme
  findAllMatches: true,    // Tüm eşleşmeleri bul
  shouldSort: true         // Sonuçları sırala
};
```

Bu güncelleme ile kategori eşleştirmesi daha hızlı, güvenilir ve maliyet-etkin hale gelmiştir.
