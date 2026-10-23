<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('auto_port_allocator_profiles', function (Blueprint $table): void {
            $table->json('egg_ids')->nullable()->after('egg_id');
        });

        // Migrate existing egg_id values into egg_ids JSON array
        $profiles = DB::table('auto_port_allocator_profiles')->whereNotNull('egg_id')->get();
        foreach ($profiles as $profile) {
            DB::table('auto_port_allocator_profiles')
                ->where('id', $profile->id)
                ->update(['egg_ids' => json_encode([(int) $profile->egg_id])]);
        }
    }

    public function down(): void
    {
        Schema::table('auto_port_allocator_profiles', function (Blueprint $table): void {
            $table->dropColumn('egg_ids');
        });
    }
};
