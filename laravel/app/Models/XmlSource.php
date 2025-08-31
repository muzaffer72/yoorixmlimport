<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class XmlSource extends Model
{
    use HasFactory;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'name',
        'url', 
        'status',
        'last_fetch',
        'product_count',
        'field_mapping',
        'category_tag',
        'use_default_category',
        'default_category_id',
        'extracted_categories'
    ];

    protected $casts = [
        'field_mapping' => 'array',
        'extracted_categories' => 'array',
        'use_default_category' => 'boolean',
        'last_fetch' => 'datetime'
    ];

    public function cronjobs(): HasMany
    {
        return $this->hasMany(Cronjob::class);
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(ActivityLog::class, 'entity_id');
    }
}