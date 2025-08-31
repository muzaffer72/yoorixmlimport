<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use App\Models\GeminiSetting;

class GeminiService
{
    private string $apiKey;
    private string $model;

    public function __construct()
    {
        // Gemini ayarlarını yükle
        $setting = GeminiSetting::where('is_active', true)->first();
        
        $this->apiKey = $setting?->api_key ?? env('GEMINI_API_KEY', '');
        $this->model = $setting?->selected_model ?? 'gemini-2.5-flash';
    }

    /**
     * Kategorileri AI ile local kategorilerle eşleştirir
     */
    public function matchCategories(array $xmlCategories, array $localCategories): array
    {
        if (empty($this->apiKey)) {
            throw new \Exception('Gemini API key not configured');
        }

        $prompt = $this->buildCategoryMatchingPrompt($xmlCategories, $localCategories);

        try {
            $response = Http::withHeaders([
                'Content-Type' => 'application/json'
            ])->post("https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent?key={$this->apiKey}", [
                'contents' => [
                    [
                        'parts' => [
                            ['text' => $prompt]
                        ]
                    ]
                ],
                'generationConfig' => [
                    'temperature' => 0.1,
                    'topK' => 1,
                    'topP' => 1,
                    'maxOutputTokens' => 2048,
                ]
            ]);

            if (!$response->successful()) {
                throw new \Exception('Gemini API request failed: ' . $response->body());
            }

            $data = $response->json();
            $text = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';

            return $this->parseCategoryMatchingResponse($text);

        } catch (\Exception $e) {
            throw new \Exception('Category matching failed: ' . $e->getMessage());
        }
    }

    /**
     * Kategori eşleştirme prompt'u oluşturur
     */
    private function buildCategoryMatchingPrompt(array $xmlCategories, array $localCategories): string
    {
        $xmlCategoriesText = implode(', ', $xmlCategories);
        $localCategoriesText = implode(', ', $localCategories);

        return "XML'den gelen kategorileri local kategorilerle eşleştir. Türkçe kategori isimlerini anlam olarak en uygun olanlarla eşleştir.

XML Kategorileri: {$xmlCategoriesText}

Local Kategoriler: {$localCategoriesText}

Cevabını şu JSON formatında ver:
{
  \"matches\": [
    {\"xml_category\": \"XML kategori adı\", \"local_category\": \"Eşleşen local kategori adı\", \"confidence\": 0.95},
    ...
  ]
}

Sadece JSON formatında cevap ver, başka açıklama ekleme.";
    }

    /**
     * AI response'unu parse eder
     */
    private function parseCategoryMatchingResponse(string $response): array
    {
        try {
            // JSON'u temizle (markdown formatından çıkar)
            $cleaned = preg_replace('/```json\s*|\s*```/', '', $response);
            $cleaned = trim($cleaned);

            $data = json_decode($cleaned, true);

            if (!$data || !isset($data['matches'])) {
                throw new \Exception('Invalid response format');
            }

            return $data['matches'];

        } catch (\Exception $e) {
            throw new \Exception('Failed to parse AI response: ' . $e->getMessage());
        }
    }

    /**
     * Ürün açıklamasını AI ile iyileştirir
     */
    public function improveProductDescription(string $originalDescription): string
    {
        if (empty($this->apiKey) || empty($originalDescription)) {
            return $originalDescription;
        }

        $prompt = "Aşağıdaki ürün açıklamasını Türkçe olarak düzenle ve iyileştir. Daha anlaşılır ve satış odaklı hale getir:

\"{$originalDescription}\"

Sadece düzenlenmiş açıklamayı ver, başka açıklama ekleme.";

        try {
            $response = Http::withHeaders([
                'Content-Type' => 'application/json'
            ])->post("https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent?key={$this->apiKey}", [
                'contents' => [
                    [
                        'parts' => [
                            ['text' => $prompt]
                        ]
                    ]
                ],
                'generationConfig' => [
                    'temperature' => 0.3,
                    'maxOutputTokens' => 500,
                ]
            ]);

            if ($response->successful()) {
                $data = $response->json();
                $improvedText = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
                return trim($improvedText) ?: $originalDescription;
            }

            return $originalDescription;

        } catch (\Exception $e) {
            // Hata durumunda orijinal açıklamayı döndür
            return $originalDescription;
        }
    }

    /**
     * API key'in geçerli olup olmadığını test eder
     */
    public function testApiKey(string $apiKey): bool
    {
        try {
            $response = Http::withHeaders([
                'Content-Type' => 'application/json'
            ])->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$apiKey}", [
                'contents' => [
                    [
                        'parts' => [
                            ['text' => 'Test message']
                        ]
                    ]
                ]
            ]);

            return $response->successful();

        } catch (\Exception $e) {
            return false;
        }
    }
}