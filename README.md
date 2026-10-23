# Auto Port Allocator (Pterodactyl 2.0 Extension)

Pterodactyl 2.0 extension to automatically allocate and assign secondary/tertiary ports (e.g. `RCON_PORT`, `HTTP_PORT`, `ASE_PORT`, `APP_PORT`) for game servers requiring multi-port setups (such as Rust, Multi Theft Auto, Palworld, ARK).

## Core Architecture: Base Port & Sub-Rules

In Pterodactyl, a server's default port is always bound to the primary allocation and exposed via the core environment variable `SERVER_PORT`.

Auto Port Allocator organizes additional ports as **Sub-Rules**:
- **Default Game Port (`SERVER_PORT`):** Fixed primary allocation anchor; managed natively by Pterodactyl.
- **Port Sub-Rules:** Defined per Egg to automatically provision extra ports and inject them directly into server environment variables:
  - **Fixed Offset:** `SERVER_PORT + offset` (e.g. MTA HTTP = `SERVER_PORT + 2`, ASE = `SERVER_PORT + 123`).
  - **Any Available:** Assigns any free port on the node/IP (e.g. Rust RCON or Rust+ companion app).
  - **Port Range:** Selects an available port from a specified range (e.g. 28000–28100).

## Features
- **Zero-Touch Server Creation:** Automatically determines and binds required sub-rule ports during `CreateServer`.
- **Egg Switch Synchronization:** Automatically adjusts and allocates ports when switching eggs (`ChangeServerEgg`).
- **One-Click Manual Sync:** Server port view allows server owners and admins to inspect roles and resolve missing ports on demand.
- **Smart Variable Selector:** Admin panel automatically loads non-reserved environment variables configured on each Egg for instant rule setup.
- **Reserved Keyword Protection:** Prevents conflicts by strictly blocking attempts to overwrite reserved Pterodactyl variables (such as `SERVER_PORT`, `SERVER_MEMORY`, `SERVER_IP`).

## Requirements
- Pterodactyl Panel 2.0+
- PHP 8.3+
- Node.js 22+

## Documentation
See [AGENTS.md](./AGENTS.md) for architectural details, internal classes, and extension development guidelines.
