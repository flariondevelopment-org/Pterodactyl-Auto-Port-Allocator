<?php

declare(strict_types=1);

namespace AutoPortAllocator\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int $profile_id
 * @property string $name
 * @property string $env_variable
 * @property string $allocation_type
 * @property int|null $offset_value
 * @property int|null $range_start
 * @property int|null $range_end
 * @property list<array{start: int, end: int}>|null $port_ranges
 * @property bool $auto_create_allocation
 * @property bool $is_required
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 * @property-read GameProfile $profile
 * @property-read Collection<int, ServerAllocatedPort> $serverPorts
 */
class SubRule extends Model
{
    public const string TYPE_OFFSET = 'offset';
    public const string TYPE_ANY_AVAILABLE = 'any_available';
    public const string TYPE_RANGE = 'range';

    public const int MIN_PORT = 1024;
    public const int MAX_PORT = 65535;

    protected $table = 'auto_port_allocator_sub_rules';

    protected $fillable = [
        'profile_id',
        'name',
        'env_variable',
        'allocation_type',
        'offset_value',
        'range_start',
        'range_end',
        'port_ranges',
        'auto_create_allocation',
        'is_required',
    ];

    protected $casts = [
        'profile_id' => 'integer',
        'offset_value' => 'integer',
        'range_start' => 'integer',
        'range_end' => 'integer',
        'port_ranges' => 'array',
        'auto_create_allocation' => 'boolean',
        'is_required' => 'boolean',
    ];

    public function profile(): BelongsTo
    {
        return $this->belongsTo(GameProfile::class, 'profile_id');
    }

    public function serverPorts(): HasMany
    {
        return $this->hasMany(ServerAllocatedPort::class, 'sub_rule_id');
    }

    /**
     * @return list<array{start: int, end: int}>
     */
    public function getAllowedRanges(?int $fallbackMin = null, ?int $fallbackMax = null): array
    {
        if (! empty($this->port_ranges) && is_array($this->port_ranges)) {
            $filtered = array_values(array_filter($this->port_ranges, fn ($r) => isset($r['start'], $r['end']) && is_numeric($r['start']) && is_numeric($r['end'])));
            if (! empty($filtered)) {
                return $filtered;
            }
        }

        if ($this->range_start !== null && $this->range_end !== null) {
            return [['start' => (int) $this->range_start, 'end' => (int) $this->range_end]];
        }

        return [['start' => $fallbackMin ?? self::MIN_PORT, 'end' => $fallbackMax ?? self::MAX_PORT]];
    }
}
