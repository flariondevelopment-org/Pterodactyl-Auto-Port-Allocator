<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auto_port_allocator_rules', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('egg_id');
            $table->string('name', 100);
            $table->string('env_variable', 64);
            $table->string('allocation_type', 32)->default('offset'); // 'offset', 'any_available', 'range'
            $table->integer('offset_value')->nullable();
            $table->integer('range_start')->nullable();
            $table->integer('range_end')->nullable();
            $table->boolean('auto_create_allocation')->default(true);
            $table->boolean('is_required')->default(true);
            $table->timestamps();

            $table->foreign('egg_id')->references('id')->on('eggs')->cascadeOnDelete();
            $table->index(['egg_id', 'env_variable']);
        });

        Schema::create('auto_port_allocator_server_ports', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('allocation_id');
            $table->unsignedBigInteger('rule_id')->nullable();
            $table->string('env_variable', 64);
            $table->string('port_name', 100);
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('allocation_id')->references('id')->on('allocations')->cascadeOnDelete();
            $table->foreign('rule_id')->references('id')->on('auto_port_allocator_rules')->nullOnDelete();

            $table->unique(['server_id', 'allocation_id']);
            $table->index(['server_id', 'env_variable']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auto_port_allocator_server_ports');
        Schema::dropIfExists('auto_port_allocator_rules');
    }
};
