<?php

declare(strict_types=1);

namespace AutoPortAllocator\Http\Controllers\Admin;

use AutoPortAllocator\Models\PortRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\EggVariable;

#[Group('Auto Port Allocator (Admin)')]
class EggPortRuleController
{
    public const array RESERVED_ENV_VARIABLES = [
        'SERVER_PORT',
        'SERVER_MEMORY',
        'SERVER_IP',
        'ENV',
        'HOME',
        'USER',
        'STARTUP',
        'SERVER_UUID',
        'UUID',
    ];

    #[Endpoint('List Port Rules', 'Returns all auto port allocation rules.')]
    public function index(Request $request): JsonResponse
    {
        $query = PortRule::query()->with('egg:id,name,nest_id');

        if ($request->has('egg_id')) {
            $query->where('egg_id', (int) $request->input('egg_id'));
        }

        return new JsonResponse([
            'rules' => $query->get(),
        ]);
    }

    #[Endpoint('Create Port Rule', 'Creates a new port allocation rule for an egg.')]
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'egg_id' => ['required', 'integer', 'exists:eggs,id'],
            'name' => ['required', 'string', 'max:100'],
            'env_variable' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_]+$/'],
            'allocation_type' => ['required', Rule::in([PortRule::TYPE_OFFSET, PortRule::TYPE_ANY_AVAILABLE, PortRule::TYPE_RANGE])],
            'offset_value' => ['nullable', 'required_if:allocation_type,offset', 'integer'],
            'range_start' => ['nullable', 'required_if:allocation_type,range', 'integer', 'between:1024,65535'],
            'range_end' => ['nullable', 'required_if:allocation_type,range', 'integer', 'between:1024,65535'],
            'auto_create_allocation' => ['boolean'],
            'is_required' => ['boolean'],
        ]);

        $envVar = strtoupper($validated['env_variable']);
        $this->assertEnvVariableNotReserved($envVar);
        $validated['env_variable'] = $envVar;

        $rule = PortRule::query()->create($validated);

        return new JsonResponse([
            'rule' => $rule->load('egg:id,name,nest_id'),
            'message' => 'Rule created successfully.',
        ], 201);
    }

    #[Endpoint('Update Port Rule', 'Updates an existing port allocation rule.')]
    public function update(Request $request, int $ruleId): JsonResponse
    {
        $rule = PortRule::query()->findOrFail($ruleId);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'env_variable' => ['sometimes', 'string', 'max:64', 'regex:/^[A-Za-z0-9_]+$/'],
            'allocation_type' => ['sometimes', Rule::in([PortRule::TYPE_OFFSET, PortRule::TYPE_ANY_AVAILABLE, PortRule::TYPE_RANGE])],
            'offset_value' => ['nullable', 'integer'],
            'range_start' => ['nullable', 'integer', 'between:1024,65535'],
            'range_end' => ['nullable', 'integer', 'between:1024,65535'],
            'auto_create_allocation' => ['sometimes', 'boolean'],
            'is_required' => ['sometimes', 'boolean'],
        ]);

        if (isset($validated['env_variable'])) {
            $envVar = strtoupper($validated['env_variable']);
            $this->assertEnvVariableNotReserved($envVar);
            $validated['env_variable'] = $envVar;
        }

        $rule->update($validated);

        return new JsonResponse([
            'rule' => $rule->load('egg:id,name,nest_id'),
            'message' => 'Rule updated successfully.',
        ]);
    }

    #[Endpoint('Delete Port Rule', 'Deletes a port allocation rule.')]
    public function destroy(int $ruleId): JsonResponse
    {
        $rule = PortRule::query()->findOrFail($ruleId);
        $rule->delete();

        return new JsonResponse([
            'message' => 'Rule deleted successfully.',
        ]);
    }

    #[Endpoint('List Eggs with Variables', 'Lists eggs along with their environment variables to assist rule configuration.')]
    public function eggs(): JsonResponse
    {
        $eggs = Egg::query()
            ->with(['variables' => function ($query) {
                $query->select(['id', 'egg_id', 'name', 'description', 'env_variable', 'default_value'])
                    ->whereNotIn('env_variable', self::RESERVED_ENV_VARIABLES);
            }])
            ->get(['id', 'nest_id', 'name', 'author']);

        return new JsonResponse([
            'eggs' => $eggs,
        ]);
    }

    /**
     * @throws ValidationException
     */
    private function assertEnvVariableNotReserved(string $envVariable): void
    {
        if ($envVariable === 'SERVER_PORT') {
            throw ValidationException::withMessages([
                'env_variable' => [
                    "SERVER_PORT is reserved as the server's default primary port. Auto Port Allocator rules must be configured as sub-rules targeting additional variables (e.g. RCON_PORT, QUERY_PORT).",
                ],
            ]);
        }

        if (in_array($envVariable, self::RESERVED_ENV_VARIABLES, true)) {
            throw ValidationException::withMessages([
                'env_variable' => [
                    "The environment variable '{$envVariable}' is reserved by Pterodactyl and cannot be assigned by a port rule.",
                ],
            ]);
        }
    }
}
}
