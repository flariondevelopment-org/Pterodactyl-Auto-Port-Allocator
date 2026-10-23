<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('auto_port_allocator_profiles', function (Blueprint $table): void {
            $table->json('primary_port_ranges')->nullable()->after('primary_range_end');
        });

        Schema::table('auto_port_allocator_sub_rules', function (Blueprint $table): void {
            $table->json('port_ranges')->nullable()->after('range_end');
        });
    }

    public function down(): void
    {
        Schema::table('auto_port_allocator_profiles', function (Blueprint $table): void {
            $table->dropColumn('primary_port_ranges');
        });

        Schema::table('auto_port_allocator_sub_rules', function (Blueprint $table): void {
            $table->dropColumn('port_ranges');
        });
    }
};
