<?php

declare(strict_types=1);

namespace AutoPortAllocator\Services;

use AutoPortAllocator\Data\AllocationPlanResult;
use AutoPortAllocator\Models\GameProfile;
use AutoPortAllocator\Models\PortRule;
use AutoPortAllocator\Models\ServerAllocatedPort;
use AutoPortAllocator\Models\SubRule;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Contracts\Allocations\CreatesAllocations;
use Pterodactyl\Contracts\Servers\UpdatesServerVariable;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\EggVariable;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;

class AutoPortAllocationService
{
    public function __construct(
        private readonly CreatesAllocations $createsAllocations,
        private readonly UpdatesServerVariable $updatesServerVariable,
    ) {}

    /**
     * Resolves and plans port allocations for server creation before the server model is saved.
     *
     * @param  list<int>  $existingAdditional
     * @param  array<string, mixed>  $environment
     */
    public function planForCreation(
        int $eggId,
        Allocation $primaryAllocation,
        array $existingAdditional = [],
        array $environment = []
    ): AllocationPlanResult {
        /** @var GameProfile|null $profile */
        $profile = GameProfile::query()->forEgg($eggId)->with('subRules')->first();

        // Validate primary allocation against profile ranges if configured
        if ($profile !== null) {
            $this->validatePrimaryPortRange($profile, $primaryAllocation);
        }

        /** @var Collection<int, SubRule|PortRule> $rules */
        $rules = $profile !== null && $profile->subRules->isNotEmpty()
            ? $profile->subRules
            : PortRule::query()->where('egg_id', $eggId)->get();

        if ($rules->isEmpty()) {
            return new AllocationPlanResult(
                additionalAllocationIds: $existingAdditional,
                environment: $environment,
                mappedRules: [],
            );
        }

        $node = $primaryAllocation->node ?? Node::query()->findOrFail($primaryAllocation->node_id);
        $claimedIds = array_values(array_unique(array_filter($existingAdditional)));
        $mappedRules = [];

        foreach ($rules as $rule) {
            // SERVER_PORT is Pterodactyl's primary allocation; rules only handle secondary sub-rules
            if (strtoupper($rule->env_variable) === 'SERVER_PORT') {
                continue;
            }

            $allocation = $this->resolveAllocationForRule($rule, $node, $primaryAllocation, $claimedIds);

            if ($allocation === null) {
                continue;
            }

            $claimedIds[] = $allocation->id;
            $environment[$rule->env_variable] = (string) $allocation->port;

            $mappedRules[] = [
                'profile_id' => $profile?->id,
                'sub_rule_id' => $rule instanceof SubRule ? $rule->id : null,
                'rule_id' => $rule instanceof PortRule ? $rule->id : null,
                'allocation_id' => $allocation->id,
                'env_variable' => $rule->env_variable,
                'port_name' => $rule->name,
                'port' => $allocation->port,
            ];
        }

        return new AllocationPlanResult(
            additionalAllocationIds: $claimedIds,
            environment: $environment,
            mappedRules: $mappedRules,
        );
    }

    /**
     * Records the port mappings for a server after creation.
     *
     * @param  list<array{profile_id?: int|null, sub_rule_id?: int|null, rule_id?: int|null, allocation_id: int, env_variable: string, port_name: string, port: int}>  $mappedRules
     */
    public function recordMappings(Server $server, array $mappedRules): void
    {
        if (empty($mappedRules)) {
            return;
        }

        DB::transaction(function () use ($server, $mappedRules): void {
            foreach ($mappedRules as $mapping) {
                ServerAllocatedPort::query()->updateOrCreate(
                    [
                        'server_id' => $server->id,
                        'allocation_id' => $mapping['allocation_id'],
                    ],
                    [
                        'profile_id' => $mapping['profile_id'] ?? null,
                        'sub_rule_id' => $mapping['sub_rule_id'] ?? null,
                        'rule_id' => $mapping['rule_id'] ?? null,
                        'env_variable' => $mapping['env_variable'],
                        'port_name' => $mapping['port_name'],
                    ]
                );
            }
        });
    }

    /**
     * Resolves or auto-creates an unassigned allocation for the primary game port within profile ranges.
     *
     * @throws DisplayException
     */
    public function resolvePrimaryAllocationForProfile(GameProfile $profile, Node $node, string $ip): Allocation
    {
        $ranges = $profile->getAllowedPrimaryRanges();
        if (empty($ranges)) {
            /** @var Allocation|null $free */
            $free = Allocation::query()
                ->where('node_id', $node->id)
                ->where('ip', $ip)
                ->whereNull('server_id')
                ->orderBy('port')
                ->first();

            if ($free !== null) {
                return $free;
            }

            // Fallback across any other available IP on the same node
            $free = Allocation::query()
                ->where('node_id', $node->id)
                ->whereNull('server_id')
                ->orderBy('port')
                ->first();

            if ($free !== null) {
                return $free;
            }

            throw new DisplayException("No available allocation found on node #{$node->id} for game profile \"{$profile->name}\".");
        }

        $allocation = $this->findOrCreateAllocationInRanges($node, $ip, $ranges, autoCreate: true);
        if ($allocation !== null) {
            return $allocation;
        }

        $rangesDisplay = $profile->getFormattedPrimaryRanges();
        throw new DisplayException(
            "Cannot auto-allocate primary port for \"{$profile->name}\": no free port found or created in ranges ({$rangesDisplay}) on node #{$node->id} ({$ip})."
        );
    }

    /**
     * Prepares and auto-reallocates server ports when switching to a new egg:
     * - If the primary port is incompatible with the target egg's game profile,
     *   automatically allocates a valid primary port and releases the old one (Option A).
     * - Releases previous secondary sub-rule allocations back to the node pool.
     *
     * @throws DisplayException
     */
    public function prepareForEggSwitch(Server $server, Egg $newEgg): void
    {
        $server->loadMissing(['allocation', 'allocations', 'node']);
        $currentPrimary = $server->allocation;
        $node = $server->node;

        if ($currentPrimary === null || $node === null) {
            return;
        }

        /** @var GameProfile|null $profile */
        $profile = GameProfile::query()->forEgg($newEgg->id)->first();

        // 1. Check if current primary allocation satisfies target profile
        $newPrimaryAllocation = null;
        if ($profile !== null && ! $profile->containsPrimaryPort($currentPrimary->port)) {
            $newPrimaryAllocation = $this->resolvePrimaryAllocationForProfile($profile, $node, $currentPrimary->ip);
        }

        // 2. Perform port reallocations safely in a transaction
        DB::transaction(function () use ($server, $currentPrimary, $newPrimaryAllocation): void {
            // Release existing secondary allocations tracked by Auto Port Allocator back to node pool
            $trackedPorts = ServerAllocatedPort::query()
                ->where('server_id', $server->id)
                ->with('allocation')
                ->get();

            foreach ($trackedPorts as $tracked) {
                if ($tracked->allocation !== null && $tracked->allocation_id !== $currentPrimary->id) {
                    $tracked->allocation->update(['server_id' => null]);
                }
            }
            ServerAllocatedPort::query()->where('server_id', $server->id)->delete();

            // If primary port needs to be swapped to the new valid allocation
            if ($newPrimaryAllocation !== null) {
                $newPrimaryAllocation->update(['server_id' => $server->id]);
                $server->forceFill(['allocation_id' => $newPrimaryAllocation->id])->save();
                // Release old primary allocation back to node pool (Option A)
                $currentPrimary->update(['server_id' => null]);
            }
        });
    }

    /**
     * Resolves and assigns missing ports for an existing server (e.g. after egg switch or sync).
     */
    public function allocateForExistingServer(Server $server): void
    {
        $server->loadMissing(['egg', 'allocation', 'allocations', 'node']);
        $egg = $server->egg;
        $primary = $server->allocation;

        if ($egg === null || $primary === null) {
            return;
        }

        /** @var GameProfile|null $profile */
        $profile = GameProfile::query()->forEgg($egg->id)->with('subRules')->first();

        /** @var Collection<int, SubRule|PortRule> $rules */
        $rules = $profile !== null && $profile->subRules->isNotEmpty()
            ? $profile->subRules
            : PortRule::query()->where('egg_id', $egg->id)->get();

        if ($rules->isEmpty()) {
            return;
        }

        $existingAllocations = $server->allocations;
        $assignedAllocationIds = $existingAllocations->pluck('id')->all();
        $node = $server->node;

        DB::transaction(function () use ($server, $egg, $profile, $rules, $node, $primary, $assignedAllocationIds): void {
            $claimedIds = $assignedAllocationIds;

            foreach ($rules as $rule) {
                // SERVER_PORT is Pterodactyl's primary allocation; rules only handle secondary sub-rules
                if (strtoupper($rule->env_variable) === 'SERVER_PORT') {
                    continue;
                }

                // Check if this server already has an allocation tracked for this env_variable
                $alreadyTracked = ServerAllocatedPort::query()
                    ->where('server_id', $server->id)
                    ->where('env_variable', $rule->env_variable)
                    ->first();

                if ($alreadyTracked !== null && in_array($alreadyTracked->allocation_id, $claimedIds, true)) {
                    continue;
                }

                $allocation = $this->resolveAllocationForRule($rule, $node, $primary, $claimedIds, $server->id);
                if ($allocation === null) {
                    continue;
                }

                $claimedIds[] = $allocation->id;

                // Assign to server
                if ($allocation->server_id !== $server->id) {
                    $allocation->update(['server_id' => $server->id]);
                }

                // Track mapping
                ServerAllocatedPort::query()->updateOrCreate(
                    [
                        'server_id' => $server->id,
                        'allocation_id' => $allocation->id,
                    ],
                    [
                        'profile_id' => $profile?->id,
                        'sub_rule_id' => $rule instanceof SubRule ? $rule->id : null,
                        'rule_id' => $rule instanceof PortRule ? $rule->id : null,
                        'env_variable' => $rule->env_variable,
                        'port_name' => $rule->name,
                    ]
                );

                // Sync server variable if egg has a matching environment variable
                $eggVariable = EggVariable::query()
                    ->where('egg_id', $egg->id)
                    ->where('env_variable', $rule->env_variable)
                    ->first();

                if ($eggVariable !== null) {
                    $this->updatesServerVariable->update($server, $eggVariable->id, (string) $allocation->port);
                }
            }
        });
    }

    /**
     * Resolves an allocation matching the given rule.
     *
     * @param  list<int>  $claimedIds
     */
    private function resolveAllocationForRule(
        SubRule|PortRule $rule,
        Node $node,
        Allocation $primaryAllocation,
        array $claimedIds,
        ?int $currentServerId = null,
    ): ?Allocation {
        return match ($rule->allocation_type) {
            SubRule::TYPE_OFFSET => $this->resolveOffsetAllocation($rule, $node, $primaryAllocation, $claimedIds, $currentServerId),
            SubRule::TYPE_RANGE => $this->resolveRangeAllocation($rule, $node, $primaryAllocation, $claimedIds),
            default => $this->resolveAnyAvailableAllocation($rule, $node, $primaryAllocation, $claimedIds),
        };
    }

    /**
     * Resolves an allocation by primary port offset (e.g. MTA HTTP = Primary + 2, ASE = Primary + 123).
     *
     * @param  list<int>  $claimedIds
     */
    private function resolveOffsetAllocation(
        SubRule|PortRule $rule,
        Node $node,
        Allocation $primaryAllocation,
        array $claimedIds,
        ?int $currentServerId = null,
    ): ?Allocation {
        $offset = $rule->offset_value ?? 0;
        $targetPort = $primaryAllocation->port + $offset;
        $ip = $primaryAllocation->ip;

        if (! $this->isValidPort($targetPort)) {
            throw new DisplayException(
                "Calculated offset port {$targetPort} for rule \"{$rule->name}\" is outside the valid port range (1024-65535)."
            );
        }

        /** @var Allocation|null $allocation */
        $allocation = Allocation::query()
            ->where('node_id', $node->id)
            ->where('ip', $ip)
            ->where('port', $targetPort)
            ->first();

        if ($allocation === null) {
            if (! $rule->auto_create_allocation) {
                return $this->failOrNull(
                    $rule,
                    "Required offset port {$targetPort} ({$rule->name}) does not exist on node #{$node->id} ({$ip})."
                );
            }

            $allocation = $this->createAndFetchAllocation($node, $ip, $targetPort);
            if ($allocation === null) {
                throw new DisplayException(
                    "Failed to auto-create allocation for offset port {$targetPort} on node #{$node->id} ({$ip})."
                );
            }
        }

        // Verify availability
        if (in_array($allocation->id, $claimedIds, true)) {
            return $this->failOrNull(
                $rule,
                "Offset port {$targetPort} ({$rule->name}) is already claimed by another rule in this deployment."
            );
        }

        if ($allocation->server_id !== null && $allocation->server_id !== $currentServerId) {
            return $this->failOrNull(
                $rule,
                "Offset port {$targetPort} ({$rule->name}) on node #{$node->id} ({$ip}) is already in use by another server."
            );
        }

        return $allocation;
    }

    /**
     * Resolves an available allocation within specified port ranges.
     *
     * @param  list<int>  $claimedIds
     */
    private function resolveRangeAllocation(
        SubRule|PortRule $rule,
        Node $node,
        Allocation $primaryAllocation,
        array $claimedIds
    ): ?Allocation {
        $ip = $primaryAllocation->ip;
        $ranges = $rule instanceof SubRule
            ? $rule->getAllowedRanges()
            : [['start' => $rule->range_start ?? 1024, 'end' => $rule->range_end ?? 65535]];

        $allocation = $this->findOrCreateAllocationInRanges(
            $node,
            $ip,
            $ranges,
            autoCreate: (bool) $rule->auto_create_allocation,
            claimedIds: $claimedIds
        );

        if ($allocation !== null) {
            return $allocation;
        }

        $rangesDisplay = implode(', ', array_map(fn ($r) => "{$r['start']}-{$r['end']}", $ranges));
        return $this->failOrNull(
            $rule,
            "No free allocation found in ranges ({$rangesDisplay}) for rule \"{$rule->name}\" on node #{$node->id} ({$ip})."
        );
    }

    /**
     * Resolves any unassigned allocation on the node and IP, with fallback to other node IPs.
     *
     * @param  list<int>  $claimedIds
     */
    private function resolveAnyAvailableAllocation(
        SubRule|PortRule $rule,
        Node $node,
        Allocation $primaryAllocation,
        array $claimedIds
    ): ?Allocation {
        $ip = $primaryAllocation->ip;

        /** @var Allocation|null $allocation */
        $allocation = Allocation::query()
            ->where('node_id', $node->id)
            ->where('ip', $ip)
            ->whereNull('server_id')
            ->whereNotIn('id', $claimedIds)
            ->orderBy('port')
            ->first();

        // Fallback across any available IP on the same node
        if ($allocation === null) {
            $allocation = Allocation::query()
                ->where('node_id', $node->id)
                ->whereNull('server_id')
                ->whereNotIn('id', $claimedIds)
                ->orderBy('port')
                ->first();
        }

        if ($allocation === null) {
            return $this->failOrNull(
                $rule,
                "No available free allocation found on node #{$node->id} for rule \"{$rule->name}\"."
            );
        }

        return $allocation;
    }

    /**
     * Validates that the primary allocation port is within the profile's allowed primary ranges.
     *
     * @throws DisplayException
     */
    private function validatePrimaryPortRange(GameProfile $profile, Allocation $primaryAllocation): void
    {
        if (! $profile->containsPrimaryPort($primaryAllocation->port)) {
            $rangesDisplay = $profile->getFormattedPrimaryRanges();
            throw new DisplayException(
                "Primary port {$primaryAllocation->port} is outside the allowed primary port ranges ({$rangesDisplay}) for \"{$profile->name}\"."
            );
        }
    }

    /**
     * Finds an unassigned allocation matching ranges, or auto-creates the first available port.
     *
     * @param  list<array{start: int, end: int}>  $ranges
     * @param  list<int>  $claimedIds
     */
    private function findOrCreateAllocationInRanges(
        Node $node,
        string $ip,
        array $ranges,
        bool $autoCreate = false,
        array $claimedIds = []
    ): ?Allocation {
        // 1. Search existing unassigned allocation
        foreach ($ranges as $r) {
            /** @var Allocation|null $allocation */
            $allocation = Allocation::query()
                ->where('node_id', $node->id)
                ->where('ip', $ip)
                ->whereBetween('port', [$r['start'], $r['end']])
                ->whereNull('server_id')
                ->whereNotIn('id', $claimedIds)
                ->orderBy('port')
                ->first();

            if ($allocation !== null) {
                return $allocation;
            }
        }

        // 2. Auto-create on node if enabled
        if ($autoCreate) {
            foreach ($ranges as $r) {
                $start = $r['start'];
                $end = $r['end'];

                $existingPorts = Allocation::query()
                    ->where('node_id', $node->id)
                    ->where('ip', $ip)
                    ->whereBetween('port', [$start, $end])
                    ->pluck('port')
                    ->all();
                $existingPortSet = array_flip($existingPorts);

                for ($port = $start; $port <= $end; $port++) {
                    if (! isset($existingPortSet[$port])) {
                        $created = $this->createAndFetchAllocation($node, $ip, $port);
                        if ($created !== null && ! in_array($created->id, $claimedIds, true)) {
                            return $created;
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Checks if a port number is within the valid networking port range.
     */
    private function isValidPort(int $port): bool
    {
        return $port >= 1024 && $port <= 65535;
    }

    /**
     * Dispatches an allocation creation request and queries the persisted record.
     */
    private function createAndFetchAllocation(Node $node, string $ip, int $port): ?Allocation
    {
        $this->createsAllocations->create($node, [
            'allocation_ip' => $ip,
            'allocation_ports' => [(string) $port],
        ]);

        return Allocation::query()
            ->where('node_id', $node->id)
            ->where('ip', $ip)
            ->where('port', $port)
            ->first();
    }

    /**
     * Throws an exception if the rule is strictly required, or returns null if optional.
     *
     * @throws DisplayException
     */
    private function failOrNull(SubRule|PortRule $rule, string $message): null
    {
        if ($rule->is_required) {
            throw new DisplayException($message);
        }

        return null;
    }
}
