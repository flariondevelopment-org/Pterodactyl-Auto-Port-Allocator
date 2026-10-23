<?php

declare(strict_types=1);

namespace AutoPortAllocator\Http\Controllers\Admin;

use AutoPortAllocator\Models\GameProfile;
use AutoPortAllocator\Models\SubRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Pterodactyl\Models\Egg;

#[Group('Auto Port Allocator (Admin Profiles)')]
class GameProfileController
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

    #[Endpoint('List Game Profiles', 'Returns all game profiles along with their configured secondary port sub-rules.')]
    public function index(Request $request): JsonResponse
    {
        $query = GameProfile::query()
            ->with(['egg:id,name', 'subRules'])
            ->orderBy('name');

        if ($request->has('egg_id')) {
            $query->where('egg_id', (int) $request->input('egg_id'));
        }

        return new JsonResponse([
            'profiles' => $query->get(),
        ]);
    }

    #[Endpoint('Create Game Profile', 'Creates a new game profile with primary port range.')]
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'egg_id' => ['required', 'integer', 'exists:eggs,id'],
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:255'],
            'primary_range_start' => ['nullable', 'integer', 'between:1024,65535'],
            'primary_range_end' => ['nullable', 'integer', 'between:1024,65535'],
            'primary_port_ranges' => ['nullable', 'array'],
            'primary_port_ranges.*.start' => ['required_with:primary_port_ranges', 'integer', 'between:1024,65535'],
            'primary_port_ranges.*.end' => ['required_with:primary_port_ranges', 'integer', 'between:1024,65535'],
        ]);

        if (! empty($validated['primary_port_ranges'])) {
            $validated['primary_range_start'] = (int) $validated['primary_port_ranges'][0]['start'];
            $validated['primary_range_end'] = (int) $validated['primary_port_ranges'][0]['end'];
        }

        $profile = GameProfile::query()->create($validated);

        return new JsonResponse([
            'profile' => $profile->load(['egg:id,name', 'subRules']),
            'message' => 'Game profile created successfully.',
        ], 201);
    }

    #[Endpoint('Update Game Profile', 'Updates an existing game profile.')]
    public function update(Request $request, int $profileId): JsonResponse
    {
        $profile = GameProfile::query()->findOrFail($profileId);

        $validated = $request->validate([
            'egg_id' => ['sometimes', 'integer', 'exists:eggs,id'],
            'name' => ['sometimes', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:255'],
            'primary_range_start' => ['nullable', 'integer', 'between:1024,65535'],
            'primary_range_end' => ['nullable', 'integer', 'between:1024,65535'],
            'primary_port_ranges' => ['nullable', 'array'],
            'primary_port_ranges.*.start' => ['required_with:primary_port_ranges', 'integer', 'between:1024,65535'],
            'primary_port_ranges.*.end' => ['required_with:primary_port_ranges', 'integer', 'between:1024,65535'],
        ]);

        if (array_key_exists('primary_port_ranges', $validated) && ! empty($validated['primary_port_ranges'])) {
            $validated['primary_range_start'] = (int) $validated['primary_port_ranges'][0]['start'];
            $validated['primary_range_end'] = (int) $validated['primary_port_ranges'][0]['end'];
        }

        $profile->update($validated);

        return new JsonResponse([
            'profile' => $profile->load(['egg:id,name', 'subRules']),
            'message' => 'Game profile updated successfully.',
        ]);
    }

    #[Endpoint('Delete Game Profile', 'Deletes a game profile and all of its secondary sub-rules.')]
    public function destroy(int $profileId): JsonResponse
    {
        $profile = GameProfile::query()->findOrFail($profileId);
        $profile->delete();

        return new JsonResponse([
            'message' => 'Game profile deleted successfully.',
        ]);
    }

    #[Endpoint('Add Secondary Port (Sub-Rule)', 'Adds a secondary port allocation sub-rule to a game profile.')]
    public function storeSubRule(Request $request, int $profileId): JsonResponse
    {
        $profile = GameProfile::query()->findOrFail($profileId);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'env_variable' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_]+$/'],
            'allocation_type' => ['required', Rule::in([SubRule::TYPE_OFFSET, SubRule::TYPE_ANY_AVAILABLE, SubRule::TYPE_RANGE])],
            'offset_value' => ['nullable', 'required_if:allocation_type,offset', 'integer'],
            'range_start' => ['nullable', 'integer', 'between:1024,65535'],
            'range_end' => ['nullable', 'integer', 'between:1024,65535'],
            'port_ranges' => ['nullable', 'array'],
            'port_ranges.*.start' => ['required_with:port_ranges', 'integer', 'between:1024,65535'],
            'port_ranges.*.end' => ['required_with:port_ranges', 'integer', 'between:1024,65535'],
            'auto_create_allocation' => ['boolean'],
            'is_required' => ['boolean'],
        ]);

        $envVar = strtoupper($validated['env_variable']);
        $this->assertEnvVariableNotReserved($envVar);
        $validated['env_variable'] = $envVar;
        $validated['profile_id'] = $profile->id;

        if (! empty($validated['port_ranges'])) {
            $validated['range_start'] = (int) $validated['port_ranges'][0]['start'];
            $validated['range_end'] = (int) $validated['port_ranges'][0]['end'];
        }

        $subRule = SubRule::query()->create($validated);

        return new JsonResponse([
            'sub_rule' => $subRule,
            'message' => 'Secondary port added successfully.',
        ], 201);
    }

    #[Endpoint('Update Secondary Port (Sub-Rule)', 'Updates an existing secondary port sub-rule.')]
    public function updateSubRule(Request $request, int $subRuleId): JsonResponse
    {
        $subRule = SubRule::query()->findOrFail($subRuleId);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'env_variable' => ['sometimes', 'string', 'max:64', 'regex:/^[A-Za-z0-9_]+$/'],
            'allocation_type' => ['sometimes', Rule::in([SubRule::TYPE_OFFSET, SubRule::TYPE_ANY_AVAILABLE, SubRule::TYPE_RANGE])],
            'offset_value' => ['nullable', 'integer'],
            'range_start' => ['nullable', 'integer', 'between:1024,65535'],
            'range_end' => ['nullable', 'integer', 'between:1024,65535'],
            'port_ranges' => ['nullable', 'array'],
            'port_ranges.*.start' => ['required_with:port_ranges', 'integer', 'between:1024,65535'],
            'port_ranges.*.end' => ['required_with:port_ranges', 'integer', 'between:1024,65535'],
            'auto_create_allocation' => ['sometimes', 'boolean'],
            'is_required' => ['sometimes', 'boolean'],
        ]);

        if (isset($validated['env_variable'])) {
            $envVar = strtoupper($validated['env_variable']);
            $this->assertEnvVariableNotReserved($envVar);
            $validated['env_variable'] = $envVar;
        }

        if (array_key_exists('port_ranges', $validated) && ! empty($validated['port_ranges'])) {
            $validated['range_start'] = (int) $validated['port_ranges'][0]['start'];
            $validated['range_end'] = (int) $validated['port_ranges'][0]['end'];
        }

        $subRule->update($validated);

        return new JsonResponse([
            'sub_rule' => $subRule,
            'message' => 'Secondary port updated successfully.',
        ]);
    }

    #[Endpoint('Delete Secondary Port (Sub-Rule)', 'Deletes a secondary port sub-rule.')]
    public function destroySubRule(int $subRuleId): JsonResponse
    {
        $subRule = SubRule::query()->findOrFail($subRuleId);
        $subRule->delete();

        return new JsonResponse([
            'message' => 'Secondary port deleted successfully.',
        ]);
    }

    #[Endpoint('List Eggs with Variables', 'Lists eggs along with their environment variables to assist profile configuration.')]
    public function eggs(): JsonResponse
    {
        $eggs = Egg::query()
            ->with(['variables' => function ($query) {
                $query->select(['id', 'egg_id', 'name', 'description', 'env_variable', 'default_value'])
                    ->whereNotIn('env_variable', self::RESERVED_ENV_VARIABLES);
            }])
            ->orderBy('name')
            ->get(['id', 'name']);

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
                    "SERVER_PORT is reserved as the server's default primary port. You can configure primary port ranges in the game profile, while sub-rules are for additional secondary ports (e.g. RCON_PORT, QUERY_PORT, HTTP_PORT).",
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
