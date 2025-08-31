<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\XmlSource;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class XmlSourceController extends Controller
{
    public function index(): JsonResponse
    {
        $xmlSources = XmlSource::orderBy('created_at', 'desc')->get();
        return response()->json($xmlSources);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'url' => 'required|url',
            'status' => 'in:active,inactive,error',
            'field_mapping' => 'nullable|array',
            'category_tag' => 'nullable|string',
            'use_default_category' => 'boolean',
            'default_category_id' => 'nullable|uuid',
            'extracted_categories' => 'nullable|array'
        ]);

        $xmlSource = XmlSource::create($validated);
        return response()->json($xmlSource, 201);
    }

    public function show(XmlSource $xmlSource): JsonResponse
    {
        return response()->json($xmlSource);
    }

    public function update(Request $request, XmlSource $xmlSource): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'string|max:255',
            'url' => 'url',
            'status' => 'in:active,inactive,error',
            'field_mapping' => 'nullable|array',
            'category_tag' => 'nullable|string',
            'use_default_category' => 'boolean',
            'default_category_id' => 'nullable|uuid',
            'extracted_categories' => 'nullable|array'
        ]);

        $xmlSource->update($validated);
        return response()->json($xmlSource);
    }

    public function destroy(XmlSource $xmlSource): JsonResponse
    {
        $xmlSource->delete();
        return response()->json(['message' => 'XML source deleted successfully']);
    }
}