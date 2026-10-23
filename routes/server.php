<?php

declare(strict_types=1);

use AutoPortAllocator\Http\Controllers\Server\ServerPortAllocationController;
use Illuminate\Support\Facades\Route;

// Prefix: /api/client/servers/{server}/extensions/auto-port-allocator
Route::get('/ports', [ServerPortAllocationController::class, 'index'])->name('server.ports.index');
Route::post('/sync', [ServerPortAllocationController::class, 'sync'])->name('server.ports.sync');
