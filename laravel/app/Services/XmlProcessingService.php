<?php

namespace App\Services;

use Mtownsend\XmlToArray\XmlToArray;
use Illuminate\Support\Facades\Http;
use App\Models\ActivityLog;

class XmlProcessingService
{
    /**
     * XML dosyasını fetch eder ve parse eder
     */
    public function fetchAndParseXml(string $url): array
    {
        try {
            // XML'i fetch et
            $response = Http::timeout(30)->get($url);
            
            if (!$response->successful()) {
                throw new \Exception("XML fetch failed: " . $response->status());
            }

            $xmlContent = $response->body();
            
            // XML'i array'e çevir
            $xmlArray = XmlToArray::convert($xmlContent);
            
            return [
                'success' => true,
                'data' => $xmlArray,
                'size' => strlen($xmlContent)
            ];
            
        } catch (\Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage()
            ];
        }
    }

    /**
     * XML'den kategorileri çıkarır
     */
    public function extractCategories(array $xmlData, string $categoryTag): array
    {
        $categories = [];
        
        // XML'de category tag'ini ara
        $this->searchForCategories($xmlData, $categoryTag, $categories);
        
        // Unique yap ve temizle
        $categories = array_unique($categories);
        $categories = array_filter($categories, function($cat) {
            return !empty(trim($cat));
        });
        
        return array_values($categories);
    }

    /**
     * Recursive olarak kategorileri arar
     */
    private function searchForCategories(array $data, string $categoryTag, array &$categories): void
    {
        foreach ($data as $key => $value) {
            if ($key === $categoryTag && is_string($value)) {
                $categories[] = trim($value);
            } elseif (is_array($value)) {
                $this->searchForCategories($value, $categoryTag, $categories);
            }
        }
    }

    /**
     * Field mapping'e göre ürün datalarını çıkarır
     */
    public function extractProducts(array $xmlData, array $fieldMapping): array
    {
        $products = [];
        
        // Ana ürün node'unu bul
        $productNodes = $this->findProductNodes($xmlData);
        
        foreach ($productNodes as $node) {
            $product = [];
            
            // Field mapping'e göre alanları çıkar
            foreach ($fieldMapping as $localField => $xmlPath) {
                $value = $this->extractFieldValue($node, $xmlPath);
                $product[$localField] = $value;
            }
            
            $products[] = $product;
        }
        
        return $products;
    }

    /**
     * XML'den ürün node'larını bulur
     */
    private function findProductNodes(array $xmlData): array
    {
        // Yaygın ürün node isimlerini kontrol et
        $commonProductNodes = ['product', 'item', 'urun', 'goods', 'artikel'];
        
        foreach ($commonProductNodes as $nodeName) {
            $found = $this->searchForNodeArray($xmlData, $nodeName);
            if (!empty($found)) {
                return $found;
            }
        }
        
        return [];
    }

    /**
     * Belirli bir node array'ini arar
     */
    private function searchForNodeArray(array $data, string $nodeName): array
    {
        foreach ($data as $key => $value) {
            if ($key === $nodeName && is_array($value)) {
                // Eğer tek ürün varsa array'e çevir
                if (isset($value[0])) {
                    return $value;
                } else {
                    return [$value];
                }
            } elseif (is_array($value)) {
                $found = $this->searchForNodeArray($value, $nodeName);
                if (!empty($found)) {
                    return $found;
                }
            }
        }
        
        return [];
    }

    /**
     * XML path'ine göre field value çıkarır
     */
    private function extractFieldValue(array $node, string $xmlPath): ?string
    {
        $pathParts = explode('.', $xmlPath);
        $current = $node;
        
        foreach ($pathParts as $part) {
            if (!is_array($current) || !isset($current[$part])) {
                return null;
            }
            $current = $current[$part];
        }
        
        return is_string($current) ? trim($current) : (string) $current;
    }

    /**
     * Activity log kaydı oluşturur
     */
    public function logActivity(string $type, string $title, string $description, ?string $entityId = null): void
    {
        ActivityLog::create([
            'type' => $type,
            'title' => $title,
            'description' => $description,
            'entity_id' => $entityId,
            'entity_type' => 'xml_source'
        ]);
    }
}