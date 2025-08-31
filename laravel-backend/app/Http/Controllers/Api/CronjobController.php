<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cronjob;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class CronjobController extends Controller
{
    public function index(): JsonResponse
    {
        $cronjobs = Cronjob::with('xmlSource')->orderBy('created_at', 'desc')->get();
        return response()->json($cronjobs);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'xml_source_id' => 'required|uuid|exists:xml_sources,id',
            'frequency' => 'required|in:hourly,daily,weekly,custom',
            'cron_expression' => 'nullable|string',
            'is_active' => 'boolean'
        ]);

        $cronjob = Cronjob::create($validated);
        return response()->json($cronjob->load('xmlSource'), 201);
    }

    public function show(Cronjob $cronjob): JsonResponse
    {
        return response()->json($cronjob->load('xmlSource'));
    }

    public function update(Request $request, Cronjob $cronjob): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'string|max:255',
            'xml_source_id' => 'uuid|exists:xml_sources,id',
            'frequency' => 'in:hourly,daily,weekly,custom',
            'cron_expression' => 'nullable|string',
            'is_active' => 'boolean'
        ]);

        $cronjob->update($validated);
        return response()->json($cronjob->load('xmlSource'));
    }

    public function destroy(Cronjob $cronjob): JsonResponse
    {
        $cronjob->delete();
        return response()->json(['message' => 'Cronjob deleted successfully']);
    }
}