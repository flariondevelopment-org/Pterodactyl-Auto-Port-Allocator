<?php

declare(strict_types=1);

namespace AutoPortAllocator\Decorators;

use AutoPortAllocator\Services\AutoPortAllocationService;
use Pterodactyl\Contracts\Servers\ChangesServerEgg;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Server;

final readonly class ChangeServerEggDecorator implements ChangesServerEgg
{
    public function __construct(
        private ChangesServerEgg $inner,
        private AutoPortAllocationService $allocator,
    ) {}

    public function change(Server $server, Egg $egg, bool $keepVariables = false): Server
    {
        // 1. Prepare server ports: auto-reallocate primary if incompatible with new profile, release old allocations (Option A)
        $this->allocator->prepareForEggSwitch($server, $egg);

        // 2. Perform the inner Pterodactyl egg change
        $server = $this->inner->change($server, $egg, $keepVariables);

        // 3. Automatically allocate and bind secondary sub-rules for the new egg
        $this->allocator->allocateForExistingServer($server);

        return $server;
    }
}
