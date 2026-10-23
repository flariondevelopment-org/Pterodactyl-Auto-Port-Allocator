<?php

declare(strict_types=1);

namespace AutoPortAllocator\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Pterodactyl\Models\Egg;

/**
 * @property int $id
 * @property int $egg_id
 * @property string $name
 * @property string|null $description
 * @property int|null $primary_range_start
 * @property int|null $primary_range_end
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 * @property-read Egg $egg
 * @property-read Collection<int, SubRule> $subRules
 * @property-read Collection<int, ServerAllocatedPort> $serverPorts
 */
class GameProfile extends Model
{
    protected $table = 'auto_port_allocator_profiles';

    protected $fillable = [
        'egg_id',
        'name',
        'description',
        'primary_range_start',
        'primary_range_end',
    ];

    protected $casts = [
        'egg_id' => 'integer',
        'primary_range_start' => 'integer',
        'primary_range_end' => 'integer',
    ];

    public function egg(): BelongsTo
    {
        return $this->belongsTo(Egg::class, 'egg_id');
    }

    public function subRules(): HasMany
    {
        return $this->hasMany(SubRule::class, 'profile_id');
    }

    public function serverPorts(): HasMany
    {
        return $this->hasMany(ServerAllocatedPort::class, 'profile_id');
    }
}
