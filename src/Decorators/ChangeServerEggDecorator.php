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
        // Pre-validate that the server's primary allocation satisfies the target egg's profile rules
        // BEFORE mutating the server in the database to prevent partial state corruption
        $this->allocator->assertServerCanUseEgg($server, $egg);

        $server = $this->inner->change($server, $egg, $keepVariables);
        $this->allocator->allocateForExistingServer($server);

        return $server;
    }
}
