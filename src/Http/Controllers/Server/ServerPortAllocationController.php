<?php

declare(strict_types=1);

namespace AutoPortAllocator\Http\Controllers\Server;

use AutoPortAllocator\Models\PortRule;
use AutoPortAllocator\Models\ServerAllocatedPort;
use AutoPortAllocator\Services\AutoPortAllocationService;
use Illuminate\Http\JsonResponse;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Pterodactyl\Models\Server;

#[Group('Auto Port Allocator (Server)')]
class ServerPortAllocationController
{
    public function __construct(
        private readonly AutoPortAllocationService $allocator,
    ) {}

    #[Endpoint('Get Server Allocations & Roles', 'Lists all ports on this server with their assigned Auto Port Allocator roles.')]
    public function index(Server $server): JsonResponse
    {
        $server->loadMissing(['allocation', 'allocations', 'egg']);

        $trackedPorts = ServerAllocatedPort::query()
            ->where('server_id', $server->id)
            ->with(['allocation', 'rule'])
            ->get();

        $eggRules = $server->egg !== null
            ? PortRule::query()->where('egg_id', $server->egg->id)->get()
            : collect();

        // Calculate missing required rules
        $trackedEnvVars = $trackedPorts->pluck('env_variable')->all();
        $missingRules = $eggRules->filter(fn (PortRule $rule) => ! in_array($rule->env_variable, $trackedEnvVars, true))->values();

        return new JsonResponse([
            'primary_allocation' => $server->allocation,
            'all_allocations' => $server->allocations,
            'assigned_roles' => $trackedPorts,
            'egg_rules' => $eggRules,
            'missing_rules' => $missingRules,
        ]);
    }

    #[Endpoint('Sync Server Port Allocations', 'Evaluates the egg rules and automatically provisions/binds missing ports for this server.')]
    public function sync(Server $server): JsonResponse
    {
        $this->allocator->allocateForExistingServer($server);

        return $this->index($server);
    }
}
