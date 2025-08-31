<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GeminiSetting extends Model
{
    use HasFactory;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'api_key',
        'selected_model',
        'is_active'
    ];

    protected $casts = [
        'is_active' => 'boolean'
    ];

    protected $hidden = [
        'api_key'
    ];
}