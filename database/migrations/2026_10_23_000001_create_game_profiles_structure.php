<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auto_port_allocator_profiles', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('egg_id');
            $table->string('name', 100);
            $table->string('description', 255)->nullable();
            $table->integer('primary_range_start')->nullable();
            $table->integer('primary_range_end')->nullable();
            $table->timestamps();

            $table->foreign('egg_id')->references('id')->on('eggs')->cascadeOnDelete();
            $table->index('egg_id');
        });

        Schema::create('auto_port_allocator_sub_rules', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('profile_id');
            $table->string('name', 100);
            $table->string('env_variable', 64);
            $table->string('allocation_type', 32)->default('offset'); // 'offset', 'any_available', 'range'
            $table->integer('offset_value')->nullable();
            $table->integer('range_start')->nullable();
            $table->integer('range_end')->nullable();
            $table->boolean('auto_create_allocation')->default(true);
            $table->boolean('is_required')->default(true);
            $table->timestamps();

            $table->foreign('profile_id')->references('id')->on('auto_port_allocator_profiles')->cascadeOnDelete();
            $table->index(['profile_id', 'env_variable']);
        });

        Schema::table('auto_port_allocator_server_ports', function (Blueprint $table): void {
            $table->unsignedBigInteger('profile_id')->nullable()->after('allocation_id');
            $table->unsignedBigInteger('sub_rule_id')->nullable()->after('profile_id');

            $table->foreign('profile_id')->references('id')->on('auto_port_allocator_profiles')->nullOnDelete();
            $table->foreign('sub_rule_id')->references('id')->on('auto_port_allocator_sub_rules')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('auto_port_allocator_server_ports', function (Blueprint $table): void {
            $table->dropForeign(['profile_id']);
            $table->dropForeign(['sub_rule_id']);
            $table->dropColumn(['profile_id', 'sub_rule_id']);
        });

        Schema::dropIfExists('auto_port_allocator_sub_rules');
        Schema::dropIfExists('auto_port_allocator_profiles');
    }
};
