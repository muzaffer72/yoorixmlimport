<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cronjobs', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('(UUID())'));
            $table->string('name');
            $table->uuid('xml_source_id');
            $table->enum('frequency', ['hourly', 'daily', 'weekly', 'custom']);
            $table->string('cron_expression')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_run')->nullable();
            $table->timestamp('next_run')->nullable();
            $table->enum('last_run_status', ['success', 'failed', 'running'])->nullable();
            $table->integer('run_count')->default(0);
            $table->integer('failure_count')->default(0);
            $table->timestamps();
            
            $table->foreign('xml_source_id')->references('id')->on('xml_sources')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cronjobs');
    }
};