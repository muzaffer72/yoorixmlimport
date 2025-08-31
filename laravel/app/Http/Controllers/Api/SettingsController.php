<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GeminiSetting;
use App\Services\GeminiService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class SettingsController extends Controller
{
    public function __construct(private GeminiService $geminiService) {}

    /**
     * Gemini ayarlarını getirir
     */
    public function getGeminiSettings(): JsonResponse
    {
        $settings = GeminiSetting::where('is_active', true)->first();

        if (!$settings) {
            return response()->json([
                'api_key' => '',
                'selected_model' => 'gemini-2.5-flash',
                'is_active' => false,
                'is_configured' => false
            ]);
        }

        return response()->json([
            'api_key' => $settings->api_key ? '***API_KEY_SET***' : '',
            'selected_model' => $settings->selected_model,
            'is_active' => $settings->is_active,
            'is_configured' => !empty($settings->api_key)
        ]);
    }

    /**
     * Gemini ayarlarını günceller
     */
    public function updateGeminiSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'api_key' => 'required|string',
            'selected_model' => 'required|string'
        ]);

        // API key'i test et
        if (!$this->geminiService->testApiKey($validated['api_key'])) {
            return response()->json([
                'error' => 'Geçersiz API key. Lütfen doğru Gemini API anahtarını girin.'
            ], 400);
        }

        // Mevcut aktif ayarları pasif yap
        GeminiSetting::where('is_active', true)->update(['is_active' => false]);

        // Yeni ayarları kaydet
        $settings = GeminiSetting::create([
            'api_key' => $validated['api_key'],
            'selected_model' => $validated['selected_model'],
            'is_active' => true
        ]);

        return response()->json([
            'message' => 'Gemini ayarları başarıyla güncellendi',
            'settings' => [
                'api_key' => '***API_KEY_SET***',
                'selected_model' => $settings->selected_model,
                'is_active' => $settings->is_active,
                'is_configured' => true
            ]
        ]);
    }

    /**
     * API key'i test eder
     */
    public function testGeminiKey(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'api_key' => 'required|string'
        ]);

        $isValid = $this->geminiService->testApiKey($validated['api_key']);

        return response()->json([
            'valid' => $isValid,
            'message' => $isValid ? 'API key geçerli' : 'API key geçersiz'
        ]);
    }

    /**
     * Mevcut kullanılabilir modelleri listeler
     */
    public function getAvailableModels(): JsonResponse
    {
        $models = [
            'gemini-2.5-flash' => 'Gemini 2.5 Flash (Hızlı)',
            'gemini-2.5-pro' => 'Gemini 2.5 Pro (Gelişmiş)',
            'gemini-1.5-flash' => 'Gemini 1.5 Flash',
            'gemini-1.5-pro' => 'Gemini 1.5 Pro'
        ];

        return response()->json($models);
    }
}