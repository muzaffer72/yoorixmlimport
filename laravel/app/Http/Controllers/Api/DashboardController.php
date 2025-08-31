<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function stats(): JsonResponse
    {
        // Mock data for now - same as Node.js version
        $stats = [
            'todayAddedProducts' => 2,
            'updatedProducts' => 15,
            'activeXmlSources' => 3,
            'pendingImports' => 0,
            'totalCategories' => 25,
            'activeCronjobs' => 2
        ];

        return response()->json($stats);
    }

    public function activities(): JsonResponse
    {
        $activities = ActivityLog::orderBy('created_at', 'desc')
            ->take(10)
            ->get();
            
        return response()->json($activities);
    }

    public function recentProducts(): JsonResponse
    {
        // Mock product data - same as Node.js version
        $products = [
            [
                'id' => '76f83141-5d78-4536-8c1c-abc123def456',
                'name' => 'Örnek Ürün 1',
                'price' => '299.99',
                'unit' => 'Adet',
                'currentStock' => 45,
                'created_at' => now()->subDays(1)->toISOString(),
                'xml_source_id' => 'xml-source-1'
            ],
            [
                'id' => '89a74252-6e89-5647-9d2d-def456abc789',
                'name' => 'Örnek Ürün 2', 
                'price' => '149.99',
                'unit' => 'Kg',
                'currentStock' => 120,
                'created_at' => now()->subDays(2)->toISOString(),
                'xml_source_id' => 'xml-source-2'
            ]
        ];

        return response()->json($products);
    }
}