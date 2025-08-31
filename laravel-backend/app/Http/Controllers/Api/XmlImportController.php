<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\XmlSource;
use App\Services\XmlProcessingService;
use App\Services\GeminiService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class XmlImportController extends Controller
{
    public function __construct(
        private XmlProcessingService $xmlProcessor,
        private GeminiService $geminiService
    ) {}

    /**
     * XML'i test eder ve preview döndürür
     */
    public function testXml(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'url' => 'required|url'
        ]);

        $result = $this->xmlProcessor->fetchAndParseXml($validated['url']);

        if (!$result['success']) {
            return response()->json(['error' => $result['error']], 400);
        }

        // İlk birkaç ürünü preview olarak döndür
        $preview = array_slice($result['data'], 0, 3);

        return response()->json([
            'success' => true,
            'preview' => $preview,
            'totalSize' => $result['size'],
            'productCount' => count($result['data'])
        ]);
    }

    /**
     * XML'den kategorileri çıkarır
     */
    public function extractCategories(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'xml_source_id' => 'required|uuid|exists:xml_sources,id',
            'category_tag' => 'required|string'
        ]);

        $xmlSource = XmlSource::findOrFail($validated['xml_source_id']);
        $result = $this->xmlProcessor->fetchAndParseXml($xmlSource->url);

        if (!$result['success']) {
            return response()->json(['error' => $result['error']], 400);
        }

        $categories = $this->xmlProcessor->extractCategories($result['data'], $validated['category_tag']);

        // XML source'u güncelle
        $xmlSource->update([
            'extracted_categories' => $categories,
            'category_tag' => $validated['category_tag']
        ]);

        $this->xmlProcessor->logActivity(
            'xml_synced',
            'Kategoriler Çıkarıldı',
            count($categories) . ' kategori XML\'den çıkarıldı',
            $xmlSource->id
        );

        return response()->json([
            'success' => true,
            'categories' => $categories,
            'count' => count($categories)
        ]);
    }

    /**
     * AI ile kategori eşleştirmesi yapar
     */
    public function matchCategories(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'xml_categories' => 'required|array',
            'local_categories' => 'required|array'
        ]);

        try {
            $matches = $this->geminiService->matchCategories(
                $validated['xml_categories'],
                $validated['local_categories']
            );

            return response()->json([
                'success' => true,
                'matches' => $matches
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'error' => 'AI category matching failed: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * XML'den ürünleri import eder
     */
    public function importProducts(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'xml_source_id' => 'required|uuid|exists:xml_sources,id',
            'field_mapping' => 'required|array',
            'category_mapping' => 'nullable|array'
        ]);

        $xmlSource = XmlSource::findOrFail($validated['xml_source_id']);
        $result = $this->xmlProcessor->fetchAndParseXml($xmlSource->url);

        if (!$result['success']) {
            return response()->json(['error' => $result['error']], 400);
        }

        // Ürünleri çıkar
        $products = $this->xmlProcessor->extractProducts($result['data'], $validated['field_mapping']);

        // Field mapping'i kaydet
        $xmlSource->update([
            'field_mapping' => $validated['field_mapping'],
            'product_count' => count($products),
            'last_fetch' => now()
        ]);

        $this->xmlProcessor->logActivity(
            'xml_synced',
            'XML Import Tamamlandı',
            count($products) . ' ürün başarıyla import edildi',
            $xmlSource->id
        );

        return response()->json([
            'success' => true,
            'imported_count' => count($products),
            'products' => array_slice($products, 0, 5) // İlk 5 örnek
        ]);
    }

    /**
     * Cron job ile otomatik import yapar
     */
    public function cronImport(string $xmlSourceId): JsonResponse
    {
        try {
            $xmlSource = XmlSource::findOrFail($xmlSourceId);
            
            if ($xmlSource->status !== 'active') {
                return response()->json(['error' => 'XML source is not active'], 400);
            }

            $result = $this->xmlProcessor->fetchAndParseXml($xmlSource->url);

            if (!$result['success']) {
                $xmlSource->update(['status' => 'error']);
                return response()->json(['error' => $result['error']], 400);
            }

            // Field mapping varsa ürünleri import et
            if ($xmlSource->field_mapping) {
                $products = $this->xmlProcessor->extractProducts($result['data'], $xmlSource->field_mapping);
                
                $xmlSource->update([
                    'product_count' => count($products),
                    'last_fetch' => now(),
                    'status' => 'active'
                ]);

                $this->xmlProcessor->logActivity(
                    'xml_synced',
                    'Otomatik Import',
                    count($products) . ' ürün cron job ile import edildi',
                    $xmlSource->id
                );

                return response()->json([
                    'success' => true,
                    'imported_count' => count($products)
                ]);
            }

            return response()->json(['error' => 'Field mapping not configured'], 400);

        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}