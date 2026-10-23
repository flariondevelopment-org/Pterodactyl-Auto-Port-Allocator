<?php

declare(strict_types=1);

use AutoPortAllocator\Http\Controllers\Admin\EggPortRuleController;
use AutoPortAllocator\Http\Controllers\Admin\GameProfileController;
use Illuminate\Support\Facades\Route;

// Prefix: /api/admin/extensions/auto-port-allocator

// Game Profile routes
Route::get('/profiles', [GameProfileController::class, 'index'])->name('admin.profiles.index');
Route::post('/profiles', [GameProfileController::class, 'store'])->name('admin.profiles.store');
Route::put('/profiles/{profile}', [GameProfileController::class, 'update'])->name('admin.profiles.update');
Route::delete('/profiles/{profile}', [GameProfileController::class, 'destroy'])->name('admin.profiles.destroy');

// Sub-rule (secondary ports) routes
Route::post('/profiles/{profile}/sub-rules', [GameProfileController::class, 'storeSubRule'])->name('admin.profiles.sub-rules.store');
Route::put('/sub-rules/{subRule}', [GameProfileController::class, 'updateSubRule'])->name('admin.sub-rules.update');
Route::delete('/sub-rules/{subRule}', [GameProfileController::class, 'destroySubRule'])->name('admin.sub-rules.destroy');

// Egg listing with variable helper
Route::get('/eggs', [GameProfileController::class, 'eggs'])->name('admin.eggs.index');

// Legacy flat rule endpoints
Route::get('/rules', [EggPortRuleController::class, 'index'])->name('admin.rules.index');
Route::post('/rules', [EggPortRuleController::class, 'store'])->name('admin.rules.store');
Route::put('/rules/{rule}', [EggPortRuleController::class, 'update'])->name('admin.rules.update');
Route::delete('/rules/{rule}', [EggPortRuleController::class, 'destroy'])->name('admin.rules.destroy');
