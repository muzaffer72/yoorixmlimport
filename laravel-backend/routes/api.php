<?php

use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\XmlSourceController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\CronjobController;
use App\Http\Controllers\Api\XmlImportController;
use App\Http\Controllers\Api\SettingsController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

// Dashboard routes
Route::prefix('dashboard')->group(function () {
    Route::get('/stats', [DashboardController::class, 'stats']);
    Route::get('/activities', [DashboardController::class, 'activities']);
    Route::get('/recent-products', [DashboardController::class, 'recentProducts']);
});

// XML Sources
Route::apiResource('xml-sources', XmlSourceController::class);

// Categories
Route::get('/categories', [CategoryController::class, 'index']);

// Cronjobs
Route::apiResource('cronjobs', CronjobController::class);

// XML Import
Route::prefix('xml-import')->group(function () {
    Route::post('/test', [XmlImportController::class, 'testXml']);
    Route::post('/extract-categories', [XmlImportController::class, 'extractCategories']);
    Route::post('/match-categories', [XmlImportController::class, 'matchCategories']);
    Route::post('/import-products', [XmlImportController::class, 'importProducts']);
    Route::post('/cron-import/{xmlSourceId}', [XmlImportController::class, 'cronImport']);
});

// Settings
Route::prefix('settings')->group(function () {
    Route::get('/gemini', [SettingsController::class, 'getGeminiSettings']);
    Route::post('/gemini', [SettingsController::class, 'updateGeminiSettings']);
    Route::post('/gemini/test', [SettingsController::class, 'testGeminiKey']);
    Route::get('/gemini/models', [SettingsController::class, 'getAvailableModels']);
});