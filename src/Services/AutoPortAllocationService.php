<?php

declare(strict_types=1);

namespace AutoPortAllocator\Services;

use AutoPortAllocator\Data\AllocationPlanResult;
use AutoPortAllocator\Models\PortRule;
use AutoPortAllocator\Models\ServerAllocatedPort;
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
        /** @var Collection<int, PortRule> $rules */
        $rules = PortRule::query()->where('egg_id', $eggId)->get();

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
                'rule_id' => $rule->id,
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
     * @param  list<array{rule_id: int|null, allocation_id: int, env_variable: string, port_name: string, port: int}>  $mappedRules
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
                        'rule_id' => $mapping['rule_id'],
                        'env_variable' => $mapping['env_variable'],
                        'port_name' => $mapping['port_name'],
                    ]
                );
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

        /** @var Collection<int, PortRule> $rules */
        $rules = PortRule::query()->where('egg_id', $egg->id)->get();
        if ($rules->isEmpty()) {
            return;
        }

        $existingAllocations = $server->allocations;
        $assignedAllocationIds = $existingAllocations->pluck('id')->all();
        $node = $server->node;

        DB::transaction(function () use ($server, $egg, $rules, $node, $primary, $assignedAllocationIds): void {
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
                        'rule_id' => $rule->id,
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
        PortRule $rule,
        Node $node,
        Allocation $primaryAllocation,
        array $claimedIds,
        ?int $currentServerId = null,
    ): ?Allocation {
        return match ($rule->allocation_type) {
            PortRule::TYPE_OFFSET => $this->resolveOffsetAllocation($rule, $node, $primaryAllocation, $claimedIds, $currentServerId),
            PortRule::TYPE_RANGE => $this->resolveRangeAllocation($rule, $node, $primaryAllocation, $claimedIds),
            default => $this->resolveAnyAvailableAllocation($rule, $node, $primaryAllocation, $claimedIds),
        };
    }

    /**
     * Resolves an allocation by primary port offset (e.g. MTA HTTP = Primary + 2, ASE = Primary + 123).
     *
     * @param  list<int>  $claimedIds
     */
    private function resolveOffsetAllocation(
        PortRule $rule,
        Node $node,
        Allocation $primaryAllocation,
        array $claimedIds,
        ?int $currentServerId = null,
    ): ?Allocation {
        $offset = $rule->offset_value ?? 0;
        $targetPort = $primaryAllocation->port + $offset;
        $ip = $primaryAllocation->ip;

        if ($targetPort < 1024 || $targetPort > 65535) {
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
                if ($rule->is_required) {
                    throw new DisplayException(
                        "Required offset port {$targetPort} ({$rule->name}) does not exist on node #{$node->id} ({$ip})."
                    );
                }

                return null;
            }

            // Automatically create the allocation on the node
            $this->createsAllocations->create($node, [
                'allocation_ip' => $ip,
                'allocation_ports' => [$targetPort],
            ]);

            $allocation = Allocation::query()
                ->where('node_id', $node->id)
                ->where('ip', $ip)
                ->where('port', $targetPort)
                ->firstOrFail();
        }

        if ($allocation->server_id !== null && $allocation->server_id !== $currentServerId) {
            if ($rule->is_required) {
                throw new DisplayException(
                    "Required offset port {$targetPort} ({$rule->name}) on {$ip} is already occupied by another server."
                );
            }

            return null;
        }

        if (in_array($allocation->id, $claimedIds, true)) {
            throw new DisplayException(
                "Port conflict: port {$targetPort} ({$rule->name}) has already been claimed in this allocation batch."
            );
        }

        return $allocation;
    }

    /**
     * Resolves any available unassigned allocation on the same node (preferring the same IP).
     *
     * @param  list<int>  $claimedIds
     */
    private function resolveAnyAvailableAllocation(
        PortRule $rule,
        Node $node,
        Allocation $primaryAllocation,
        array $claimedIds,
    ): ?Allocation {
        // Try same IP first
        $allocation = Allocation::query()
            ->where('node_id', $node->id)
            ->where('ip', $primaryAllocation->ip)
            ->whereNull('server_id')
            ->whereNotIn('id', $claimedIds)
            ->orderBy('port')
            ->first();

        // If none on same IP, try any unassigned on the node
        if ($allocation === null) {
            $allocation = Allocation::query()
                ->where('node_id', $node->id)
                ->whereNull('server_id')
                ->whereNotIn('id', $claimedIds)
                ->orderBy('port')
                ->first();
        }

        if ($allocation === null && $rule->is_required) {
            throw new DisplayException(
                "No available unassigned port found on node #{$node->id} for rule \"{$rule->name}\" ({$rule->env_variable})."
            );
        }

        return $allocation;
    }

    /**
     * Resolves an allocation within a designated port range.
     *
     * @param  list<int>  $claimedIds
     */
    private function resolveRangeAllocation(
        PortRule $rule,
        Node $node,
        Allocation $primaryAllocation,
        array $claimedIds,
    ): ?Allocation {
        $start = $rule->range_start;
        $end = $rule->range_end;

        if ($start === null || $end === null || $start > $end) {
            throw new DisplayException("Invalid port range configured for rule \"{$rule->name}\".");
        }

        $allocation = Allocation::query()
            ->where('node_id', $node->id)
            ->where('ip', $primaryAllocation->ip)
            ->whereBetween('port', [$start, $end])
            ->whereNull('server_id')
            ->whereNotIn('id', $claimedIds)
            ->orderBy('port')
            ->first();

        if ($allocation === null && $rule->auto_create_allocation) {
            // Find existing ports on node/ip within range
            $existingPorts = Allocation::query()
                ->where('node_id', $node->id)
                ->where('ip', $primaryAllocation->ip)
                ->whereBetween('port', [$start, $end])
                ->pluck('port')
                ->all();

            $free = array_diff(range($start, $end), $existingPorts);
            if (! empty($free)) {
                $targetPort = reset($free);
                $this->createsAllocations->create($node, [
                    'allocation_ip' => $primaryAllocation->ip,
                    'allocation_ports' => [$targetPort],
                ]);

                $allocation = Allocation::query()
                    ->where('node_id', $node->id)
                    ->where('ip', $primaryAllocation->ip)
                    ->where('port', $targetPort)
                    ->first();
            }
        }

        if ($allocation === null && $rule->is_required) {
            throw new DisplayException(
                "No available port in range {$start}-{$end} on node #{$node->id} for rule \"{$rule->name}\"."
            );
        }

        return $allocation;
    }
}
