<?php

declare(strict_types=1);

namespace AutoPortAllocator;

use AutoPortAllocator\Decorators\ChangeServerEggDecorator;
use AutoPortAllocator\Decorators\CreateServerDecorator;
use AutoPortAllocator\Services\AutoPortAllocationService;
use Pterodactyl\Contracts\Servers\ChangesServerEgg;
use Pterodactyl\Contracts\Servers\CreatesServers;
use Pterodactyl\Extensions\ExtensionProvider;

class AutoPortAllocatorProvider extends ExtensionProvider
{
    public function register(): void
    {
        $this->app->singleton(AutoPortAllocationService::class);
    }

    public function boot(): void
    {
        // Register database migrations
        $this->loadExtensionMigrations();

        // Registers routes/client.php, routes/server.php, routes/admin.php
        $this->registerApiRoutes();

        // Wrap server creation to automatically calculate and assign secondary ports
        $this->wrapAction(
            CreatesServers::class,
            fn (CreatesServers $inner): CreatesServers => new CreateServerDecorator(
                $inner,
                $this->app->make(AutoPortAllocationService::class),
            ),
        );

        // Wrap egg changing to automatically allocate ports required by the new egg
        $this->wrapAction(
            ChangesServerEgg::class,
            fn (ChangesServerEgg $inner): ChangesServerEgg => new ChangeServerEggDecorator(
                $inner,
                $this->app->make(AutoPortAllocationService::class),
            ),
        );
    }
}
