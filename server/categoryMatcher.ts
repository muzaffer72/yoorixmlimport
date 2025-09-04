import type { Category } from "@shared/schema";
import Fuse from 'fuse.js';

// Fuse.js tabanlı gelişmiş kategori eşleştirme sınıfı
export class CategoryMatcher {
  private fuse: Fuse<Category>;
  
  constructor(categories: Category[]) {
    // Fuse.js konfigürasyonu - Türkçe karakterler için optimize edilmiş
    const fuseOptions = {
      keys: [
        { name: 'name', weight: 1 },
        { name: 'description', weight: 0.3 }
      ],
      threshold: 0.4, // 0.0 = tam eşleşme, 1.0 = her şey eşleşir
      distance: 100, // Maksimum karakter mesafesi
      minMatchCharLength: 2, // Minimum eşleşme karakter uzunluğu
      includeScore: true, // Skor bilgisini dahil et
      includeMatches: true, // Eşleşen kısımları dahil et
      ignoreLocation: true, // Konumu göz ardı et (metin içinde herhangi bir yerde eşleşebilir)
      useExtendedSearch: false, // Genişletilmiş arama sözdizimi
      findAllMatches: true, // Tüm eşleşmeleri bul
      shouldSort: true // Sonuçları skora göre sırala
    };
    
    // Kategorileri normalize et ve Fuse instance'ı oluştur
    const normalizedCategories = categories.map(category => ({
      ...category,
      name: this.normalizeText(category.name),
      description: category.description ? this.normalizeText(category.description) : ''
    }));
    
    this.fuse = new Fuse(normalizedCategories, fuseOptions);
  }
  
  // Metinleri normalize etme - Türkçe karakterler ve büyük/küçük harf
  private normalizeText(text: string): string {
    if (!text) return '';
    
    return text
      .toLowerCase()
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u')
      .replace(/[^a-z0-9\s]/g, ' ') // Özel karakterleri boşluğa çevir
      .replace(/\s+/g, ' ') // Çoklu boşlukları tek boşluğa çevir
      .trim();
  }
  
  // Tek bir kategoriyi arama
  public findCategory(xmlCategory: string): {
    category: Category | null;
    confidence: number;
    alternatives: Array<{ category: Category; confidence: number }>;
  } {
    const normalizedQuery = this.normalizeText(xmlCategory);
    const results = this.fuse.search(normalizedQuery, { limit: 5 });
    
    if (results.length === 0) {
      return {
        category: null,
        confidence: 0,
        alternatives: []
      };
    }
    
    // Fuse.js skoru tersine çevir (düşük skor = yüksek benzerlik)
    const bestMatch = results[0];
    const confidence = 1 - (bestMatch.score || 1);
    
    const alternatives = results.slice(1, 3).map(result => ({
      category: result.item,
      confidence: 1 - (result.score || 1)
    }));
    
    return {
      category: confidence > 0.6 ? bestMatch.item : null,
      confidence,
      alternatives
    };
  }
  
  // XML kategorilerini yerel kategorilerle eşleştirme
  public autoMapCategories(
    xmlCategories: string[], 
    localCategories: Category[]
  ): Array<{
    xmlCategory: string;
    suggestedCategory: Category | null;
    confidence: number;
    alternatives: Array<{ category: Category; confidence: number }>;
  }> {
    const results = [];
    
    for (const xmlCategory of xmlCategories) {
      const result = this.findCategory(xmlCategory);
      
      results.push({
        xmlCategory,
        suggestedCategory: result.category,
        confidence: result.confidence,
        alternatives: result.alternatives
      });
    }
    
    return results;
  }
  
  // Güven skoruna göre kategorileme
  public categorizeByConfidence(mappings: Array<{
    xmlCategory: string;
    suggestedCategory: Category | null;
    confidence: number;
  }>): {
    high: Array<any>; // confidence > 0.8
    medium: Array<any>; // 0.6 < confidence <= 0.8
    low: Array<any>; // 0.4 < confidence <= 0.6
    noMatch: Array<any>; // confidence <= 0.4
  } {
    return {
      high: mappings.filter(m => m.confidence > 0.8),
      medium: mappings.filter(m => m.confidence > 0.6 && m.confidence <= 0.8),
      low: mappings.filter(m => m.confidence > 0.4 && m.confidence <= 0.6),
      noMatch: mappings.filter(m => m.confidence <= 0.4)
    };
  }
  
  // Çoklu arama - birden fazla kategori önerisi
  public findMultipleCategories(xmlCategory: string, limit: number = 5): Array<{
    category: Category;
    confidence: number;
    matches?: Array<{ key: string; value: string; indices: readonly [number, number][] }>;
  }> {
    const normalizedQuery = this.normalizeText(xmlCategory);
    const results = this.fuse.search(normalizedQuery, { limit });
    
    return results.map(result => ({
      category: result.item,
      confidence: 1 - (result.score || 1),
      matches: result.matches?.map(match => ({
        key: match.key || '',
        value: match.value || '',
        indices: match.indices || []
      }))
    }));
  }
  
  // Kategori önerisi güncelleme - yeni kategoriler eklendiğinde
  public updateCategories(categories: Category[]): void {
    const normalizedCategories = categories.map(category => ({
      ...category,
      name: this.normalizeText(category.name),
      description: category.description ? this.normalizeText(category.description) : ''
    }));
    
    this.fuse.setCollection(normalizedCategories);
  }
}