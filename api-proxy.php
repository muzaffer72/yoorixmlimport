<?php
/**
 * API Proxy for Laravel Backend
 * Bu dosya tüm /api/* isteklerini Laravel backend'e yönlendirir
 */

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// OPTIONS request için
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// API path'i al
$request_uri = $_SERVER['REQUEST_URI'];
$parsed_url = parse_url($request_uri);
$path = $parsed_url['path'];

// /api prefix'ini kaldır
$api_path = str_replace('/api', '', $path);

// Query string'i ekle
$query_string = isset($parsed_url['query']) ? '?' . $parsed_url['query'] : '';

// Laravel backend URL
$laravel_url = 'http://localhost:8000/api' . $api_path . $query_string;

// cURL ile Laravel'e istek gönder
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $laravel_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

// POST/PUT data
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'PATCH'])) {
    $input = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $input);
}

// Headers'ı aktar
$headers = [];
foreach ($_SERVER as $key => $value) {
    if (substr($key, 0, 5) == 'HTTP_') {
        $header = str_replace('_', '-', substr($key, 5));
        $headers[] = $header . ': ' . $value;
    }
}

// Content-Type header'ı özel olarak ekle
if (isset($_SERVER['CONTENT_TYPE'])) {
    $headers[] = 'Content-Type: ' . $_SERVER['CONTENT_TYPE'];
}

curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

// Response'u al
$result = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$content_type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

// Error kontrolü
if (curl_error($ch)) {
    http_response_code(500);
    echo json_encode(['error' => 'Backend connection failed: ' . curl_error($ch)]);
    curl_close($ch);
    exit();
}

curl_close($ch);

// Response headers'ı ayarla
http_response_code($http_code);
if ($content_type) {
    header('Content-Type: ' . $content_type);
} else {
    header('Content-Type: application/json');
}

// Response'u gönder
echo $result;
?>