<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('(UUID())'));
            $table->enum('type', ['product_added', 'stock_updated', 'price_updated', 'xml_synced', 'category_mapped']);
            $table->string('title');
            $table->text('description')->nullable();
            $table->text('old_value')->nullable();
            $table->text('new_value')->nullable();
            $table->uuid('entity_id')->nullable();
            $table->enum('entity_type', ['product', 'xml_source', 'category'])->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
    }
};