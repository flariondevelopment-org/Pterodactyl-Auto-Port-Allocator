<?php

declare(strict_types=1);

namespace AutoPortAllocator\Http\Controllers\Admin;

use AutoPortAllocator\Models\PortRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Pterodactyl\Models\Egg;

#[Group('Auto Port Allocator (Admin)')]
class EggPortRuleController
{
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
            'env_variable' => ['required', 'string', 'max:64'],
            'allocation_type' => ['required', Rule::in([PortRule::TYPE_OFFSET, PortRule::TYPE_ANY_AVAILABLE, PortRule::TYPE_RANGE])],
            'offset_value' => ['nullable', 'required_if:allocation_type,offset', 'integer'],
            'range_start' => ['nullable', 'required_if:allocation_type,range', 'integer', 'between:1024,65535'],
            'range_end' => ['nullable', 'required_if:allocation_type,range', 'integer', 'between:1024,65535'],
            'auto_create_allocation' => ['boolean'],
            'is_required' => ['boolean'],
        ]);

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
            'env_variable' => ['sometimes', 'string', 'max:64'],
            'allocation_type' => ['sometimes', Rule::in([PortRule::TYPE_OFFSET, PortRule::TYPE_ANY_AVAILABLE, PortRule::TYPE_RANGE])],
            'offset_value' => ['nullable', 'integer'],
            'range_start' => ['nullable', 'integer', 'between:1024,65535'],
            'range_end' => ['nullable', 'integer', 'between:1024,65535'],
            'auto_create_allocation' => ['sometimes', 'boolean'],
            'is_required' => ['sometimes', 'boolean'],
        ]);

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
            ->with(['variables:id,egg_id,name,env_variable,default_value'])
            ->get(['id', 'nest_id', 'name', 'author']);

        return new JsonResponse([
            'eggs' => $eggs,
        ]);
    }
}
