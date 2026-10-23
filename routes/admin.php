<?php

declare(strict_types=1);

use AutoPortAllocator\Http\Controllers\Admin\EggPortRuleController;
use Illuminate\Support\Facades\Route;

// Prefix: /api/admin/extensions/auto-port-allocator
Route::get('/rules', [EggPortRuleController::class, 'index'])->name('admin.rules.index');
Route::post('/rules', [EggPortRuleController::class, 'store'])->name('admin.rules.store');
Route::put('/rules/{rule}', [EggPortRuleController::class, 'update'])->name('admin.rules.update');
Route::delete('/rules/{rule}', [EggPortRuleController::class, 'destroy'])->name('admin.rules.destroy');
Route::get('/eggs', [EggPortRuleController::class, 'eggs'])->name('admin.eggs.index');
