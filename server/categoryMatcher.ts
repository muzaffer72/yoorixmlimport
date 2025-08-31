import type { Category } from "@shared/schema";

// Metin benzerlik hesaplama algoritmaları
export class CategoryMatcher {
  
  // Levenshtein Distance algoritması - iki string arasındaki mesafeyi hesaplar
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  // Metinleri normalize etme - Türkçe karakterler ve büyük/küçük harf
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u')
      .replace(/[^a-z0-9\s]/g, '') // Özel karakterleri kaldır
      .replace(/\s+/g, ' ') // Çoklu boşlukları tek boşluğa çevir
      .trim();
  }
  
  // Kelime bazlı benzerlik hesaplama
  private calculateWordSimilarity(str1: string, str2: string): number {
    const words1 = this.normalizeText(str1).split(' ');
    const words2 = this.normalizeText(str2).split(' ');
    
    let matches = 0;
    let totalWords = Math.max(words1.length, words2.length);
    
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1 === word2 || this.levenshteinDistance(word1, word2) <= 1) {
          matches++;
          break;
        }
      }
    }
    
    return matches / totalWords;
  }
  
  // Genel benzerlik skoru hesaplama (0-1 arası)
  private calculateSimilarity(xmlCategory: string, localCategory: string): number {
    const norm1 = this.normalizeText(xmlCategory);
    const norm2 = this.normalizeText(localCategory);
    
    // Tam eşleşme kontrolü
    if (norm1 === norm2) {
      return 1.0;
    }
    
    // Substring kontrolü
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return 0.9;
    }
    
    // Levenshtein distance bazlı benzerlik
    const maxLen = Math.max(norm1.length, norm2.length);
    const distance = this.levenshteinDistance(norm1, norm2);
    const levenshteinSimilarity = 1 - (distance / maxLen);
    
    // Kelime bazlı benzerlik
    const wordSimilarity = this.calculateWordSimilarity(xmlCategory, localCategory);
    
    // Ağırlıklı ortalama (kelime benzerliği daha önemli)
    return (levenshteinSimilarity * 0.4) + (wordSimilarity * 0.6);
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
      const similarities = localCategories.map(category => ({
        category,
        confidence: this.calculateSimilarity(xmlCategory, category.name)
      })).sort((a, b) => b.confidence - a.confidence);
      
      const bestMatch = similarities[0];
      const alternatives = similarities.slice(1, 3); // En iyi 2 alternatif
      
      results.push({
        xmlCategory,
        suggestedCategory: bestMatch && bestMatch.confidence > 0.3 ? bestMatch.category : null,
        confidence: bestMatch ? bestMatch.confidence : 0,
        alternatives: alternatives.filter(alt => alt.confidence > 0.2)
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
    medium: Array<any>; // 0.5 < confidence <= 0.8
    low: Array<any>; // 0.3 < confidence <= 0.5
    noMatch: Array<any>; // confidence <= 0.3
  } {
    return {
      high: mappings.filter(m => m.confidence > 0.8),
      medium: mappings.filter(m => m.confidence > 0.5 && m.confidence <= 0.8),
      low: mappings.filter(m => m.confidence > 0.3 && m.confidence <= 0.5),
      noMatch: mappings.filter(m => m.confidence <= 0.3)
    };
  }
}