<?php

declare(strict_types=1);

namespace AutoPortAllocator\Decorators;

use AutoPortAllocator\Services\AutoPortAllocationService;
use Pterodactyl\Contracts\Servers\CreatesServers;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Objects\DeploymentObject;
use Pterodactyl\Models\Server;

final readonly class CreateServerDecorator implements CreatesServers
{
    public function __construct(
        private CreatesServers $inner,
        private AutoPortAllocationService $allocator,
    ) {}

    public function create(array $input, ?DeploymentObject $deployment = null): Server
    {
        // For automated deployment objects where primary allocation is determined dynamically:
        if ($deployment instanceof DeploymentObject) {
            $server = $this->inner->create($input, $deployment);
            $this->allocator->allocateForExistingServer($server);

            return $server;
        }

        // Standard creation with specified primary allocation
        $eggId = (int) ($input['egg_id'] ?? 0);
        $allocationId = (int) ($input['allocation_id'] ?? 0);

        if ($eggId > 0 && $allocationId > 0) {
            /** @var Allocation|null $primaryAllocation */
            $primaryAllocation = Allocation::query()->with('node')->find($allocationId);

            if ($primaryAllocation !== null) {
                $plan = $this->allocator->planForCreation(
                    eggId: $eggId,
                    primaryAllocation: $primaryAllocation,
                    existingAdditional: (array) ($input['allocation_additional'] ?? []),
                    environment: (array) ($input['environment'] ?? []),
                );

                $input['allocation_additional'] = $plan->additionalAllocationIds;
                $input['environment'] = $plan->environment;

                $server = $this->inner->create($input, null);
                $this->allocator->recordMappings($server, $plan->mappedRules);

                return $server;
            }
        }

        return $this->inner->create($input, null);
    }
}
