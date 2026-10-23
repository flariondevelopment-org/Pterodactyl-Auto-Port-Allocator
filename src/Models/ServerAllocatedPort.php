<?php

declare(strict_types=1);

namespace AutoPortAllocator\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Server;

/**
 * @property int $id
 * @property int $server_id
 * @property int $allocation_id
 * @property int|null $rule_id
 * @property string $env_variable
 * @property string $port_name
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 * @property-read Server $server
 * @property-read Allocation $allocation
 * @property-read PortRule|null $rule
 */
class ServerAllocatedPort extends Model
{
    protected $table = 'auto_port_allocator_server_ports';

    protected $fillable = [
        'server_id',
        'allocation_id',
        'rule_id',
        'env_variable',
        'port_name',
    ];

    protected $casts = [
        'server_id' => 'integer',
        'allocation_id' => 'integer',
        'rule_id' => 'integer',
    ];

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class, 'server_id');
    }

    public function allocation(): BelongsTo
    {
        return $this->belongsTo(Allocation::class, 'allocation_id');
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(PortRule::class, 'rule_id');
    }
}
