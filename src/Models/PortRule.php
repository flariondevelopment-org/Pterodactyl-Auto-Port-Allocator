<?php

declare(strict_types=1);

namespace AutoPortAllocator\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Pterodactyl\Models\Egg;

/**
 * @property int $id
 * @property int $egg_id
 * @property string $name
 * @property string $env_variable
 * @property string $allocation_type
 * @property int|null $offset_value
 * @property int|null $range_start
 * @property int|null $range_end
 * @property bool $auto_create_allocation
 * @property bool $is_required
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 * @property-read Egg $egg
 */
class PortRule extends Model
{
    public const TYPE_OFFSET = 'offset';
    public const TYPE_ANY_AVAILABLE = 'any_available';
    public const TYPE_RANGE = 'range';

    protected $table = 'auto_port_allocator_rules';

    protected $fillable = [
        'egg_id',
        'name',
        'env_variable',
        'allocation_type',
        'offset_value',
        'range_start',
        'range_end',
        'auto_create_allocation',
        'is_required',
    ];

    protected $casts = [
        'egg_id' => 'integer',
        'offset_value' => 'integer',
        'range_start' => 'integer',
        'range_end' => 'integer',
        'auto_create_allocation' => 'boolean',
        'is_required' => 'boolean',
    ];

    public function egg(): BelongsTo
    {
        return $this->belongsTo(Egg::class, 'egg_id');
    }

    public function serverPorts(): HasMany
    {
        return $this->hasMany(ServerAllocatedPort::class, 'rule_id');
    }
}
