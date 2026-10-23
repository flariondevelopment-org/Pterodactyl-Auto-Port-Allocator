<?php

declare(strict_types=1);

namespace AutoPortAllocator\Data;

final readonly class AllocationPlanResult
{
    /**
     * @param list<int> $additionalAllocationIds
     * @param array<string, mixed> $environment
     * @param list<array{rule_id: int|null, allocation_id: int, env_variable: string, port_name: string, port: int}> $mappedRules
     */
    public function __construct(
        public array $additionalAllocationIds,
        public array $environment,
        public array $mappedRules,
    ) {}
}
