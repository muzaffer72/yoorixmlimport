<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Cronjob extends Model
{
    use HasFactory;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'name',
        'xml_source_id',
        'frequency',
        'cron_expression',
        'is_active',
        'last_run',
        'next_run',
        'last_run_status',
        'run_count',
        'failure_count'
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'last_run' => 'datetime',
        'next_run' => 'datetime',
        'run_count' => 'integer',
        'failure_count' => 'integer'
    ];

    public function xmlSource(): BelongsTo
    {
        return $this->belongsTo(XmlSource::class);
    }
}