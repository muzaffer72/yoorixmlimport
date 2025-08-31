<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('xml_sources', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('(UUID())'));
            $table->string('name');
            $table->text('url');
            $table->enum('status', ['active', 'inactive', 'error'])->default('active');
            $table->timestamp('last_fetch')->nullable();
            $table->integer('product_count')->default(0);
            $table->json('field_mapping')->nullable();
            $table->string('category_tag')->nullable();
            $table->boolean('use_default_category')->default(false);
            $table->uuid('default_category_id')->nullable();
            $table->json('extracted_categories')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('xml_sources');
    }
};