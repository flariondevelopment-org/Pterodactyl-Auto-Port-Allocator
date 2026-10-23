<?php

declare(strict_types=1);

namespace AutoPortAllocator\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Knuckles\Scribe\Attributes\Endpoint;

class StatusController
{
    #[Endpoint('Get status', 'Returns a heartbeat for the Auto Port Allocator extension.')]
    public function __invoke(): JsonResponse
    {
        return new JsonResponse([
            'extension' => 'auto-port-allocator',
            'status' => 'ok',
        ]);
    }
}
