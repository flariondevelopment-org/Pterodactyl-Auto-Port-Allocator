<?php

declare(strict_types=1);

use AutoPortAllocator\Http\Controllers\StatusController;
use Illuminate\Support\Facades\Route;

// Final URL: GET /api/client/extensions/auto-port-allocator/status
Route::get('/status', StatusController::class)->name('status');
