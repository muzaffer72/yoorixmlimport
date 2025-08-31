<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\JsonResponse;

class CategoryController extends Controller
{
    public function index(): JsonResponse
    {
        // Mock categories - same as Node.js version
        $categories = [
            ['id' => 'cat-electronics', 'name' => 'Elektronik', 'parent_id' => null, 'created_at' => now()],
            ['id' => 'cat-phones', 'name' => 'Telefonlar', 'parent_id' => 'cat-electronics', 'created_at' => now()],
            ['id' => 'cat-laptops', 'name' => 'Bilgisayarlar', 'parent_id' => 'cat-electronics', 'created_at' => now()],
            ['id' => 'cat-clothing', 'name' => 'Giyim', 'parent_id' => null, 'created_at' => now()],
            ['id' => 'cat-mens', 'name' => 'Erkek Giyim', 'parent_id' => 'cat-clothing', 'created_at' => now()],
            ['id' => 'cat-womens', 'name' => 'Kadın Giyim', 'parent_id' => 'cat-clothing', 'created_at' => now()],
            ['id' => 'cat-home', 'name' => 'Ev & Yaşam', 'parent_id' => null, 'created_at' => now()],
            ['id' => 'cat-kitchen', 'name' => 'Mutfak', 'parent_id' => 'cat-home', 'created_at' => now()],
            ['id' => 'cat-furniture', 'name' => 'Mobilya', 'parent_id' => 'cat-home', 'created_at' => now()],
            ['id' => 'cat-sports', 'name' => 'Spor', 'parent_id' => null, 'created_at' => now()]
        ];

        return response()->json($categories);
    }
}