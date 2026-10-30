<?php

declare(strict_types=1);

namespace AutoPortAllocator;

use AutoPortAllocator\Decorators\ChangeServerEggDecorator;
use AutoPortAllocator\Decorators\CreateServerDecorator;
use AutoPortAllocator\Services\AutoPortAllocationService;
use Pterodactyl\Contracts\Servers\ChangesServerEgg;
use Pterodactyl\Contracts\Servers\CreatesServers;
use Pterodactyl\Contracts\Servers\UpdatesServerVariable;
use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class AutoPortAllocatorProvider extends ExtensionProvider
{
    public function register(): void
    {
        $this->app->singleton(AutoPortAllocationService::class, fn ($app) => new AutoPortAllocationService(
            $app->make(UpdatesServerVariable::class),
            $this->settings(),
        ));
    }

    public function boot(): void
    {
        // Register database migrations
        $this->loadExtensionMigrations();

        // Registers routes/client.php, routes/server.php, routes/admin.php
        $this->registerApiRoutes();

        // Register native extension settings
        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            ExtensionSettingDefinition::make(
                key: 'min_port',
                input: 'min_port',
                default: AutoPortAllocationService::MIN_VALID_PORT,
                rules: ['required', 'integer', 'min:1024', 'max:65535']
            )
                ->label('Minimum Usable Port')
                ->help('The global lowest port boundary for automatic allocations across all profiles (Default: 1024).')
                ->field('number')
                ->tab('General')
                ->frontend()
                ->normalizeUsing(fn ($v): int => (int) $v),

            ExtensionSettingDefinition::make(
                key: 'max_port',
                input: 'max_port',
                default: AutoPortAllocationService::MAX_VALID_PORT,
                rules: ['required', 'integer', 'min:1024', 'max:65535', 'gte:min_port']
            )
                ->label('Maximum Usable Port')
                ->help('The global highest port boundary for automatic allocations across all profiles (Default: 65535).')
                ->field('number')
                ->tab('General')
                ->frontend()
                ->normalizeUsing(fn ($v): int => (int) $v),
        ]));

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
