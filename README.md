# PixelPhyx

PixelPhyx is a browser-based 2D pixel physics and chemistry sandbox featuring falling particles, liquids, gases, material reactions, explosions, ropes, and multiplayer.

## Play online

Production: https://jack105wa.github.io/PixelPhyx/

The production game runs its simulation engine compiled from Rust to WebAssembly.

## Play offline

Download the standalone HTML edition from the [latest GitHub release](https://github.com/Jack105WA/PixelPhyx/releases/latest).

The offline edition is generated from Website/ by Offline/build-offline.mjs. Local offline play does not require multiplayer services.

## Self-hosted multiplayer

Photon has been removed. Multiplayer now uses a self-hosted WebSocket server in `Server/`.

1. Download the repository's `Server/` folder (or the source ZIP).
2. Install Node.js 20 or newer.
3. Run `Start Server.bat`.
4. Open the LAN URL printed in the server console, such as `http://192.168.1.20:3000`.
5. Players on the same network open that same address. For internet access, forward the configured TCP port to the host PC and share its public IP address.

The server serves the game locally and hosts room discovery, lobby capacity, player membership, join approvals, and gameplay message delivery. The room host remains the physics authority; if the host disconnects, authority moves to another connected player.

Edit `Server/config.yml` to set the server name, bind address, port, maximum players per lobby, and maximum active lobby count. The launcher checks for updates and refreshes the local game files when the server release changes. It does not overwrite config.yml.

Worlds are currently held in memory and are not persisted after a server restart. Custom materials remain excluded from multiplayer.

## Controls

- **Draw:** place the selected material.
- **Line:** drag to draw a straight material line.
- **Rope:** drag to create a rope; right-click to delete.
- **Grab:** drag rope points.
- **Erase:** remove particles.
- **Box:** place a block of the selected material.
- **Blast:** place TNT and ignite it with fire.
- **Heat / Cool:** place fire or ice.
- **Brush size:** use the slider or mouse wheel.
- **Gravity:** adjust gravity strength.
- **Simulation speed:** change the simulation rate multiplier.
- **Ambient temperature:** adjust the world temperature.
- **Space:** pause or resume.
- **Step:** advance one simulation step while paused.
- **Right click:** erase.
- **Export PNG:** save an image of the current experiment.

## Rust and WebAssembly

The production Rust/WASM engine moves performance-sensitive simulation and pixel-processing systems into Rust compiled to browser WebAssembly. JavaScript continues to handle browser events, application orchestration, multiplayer integration, and UI.

The WASM package is built during CI; generated package artifacts are not committed to the repository.

## GitHub Pages deployment

GitHub Pages must use **GitHub Actions** as its source in repository Settings → Pages. The workflow in .github/workflows/pages.yml builds Rust/WASM and the standalone offline edition.

## Repository layout

- `Website/` contains the browser game and published site.
- `Website/js/` contains browser-side game, simulation integration, and UI modules.
- `Website/js/netcode/` contains WebSocket multiplayer transport, rooms, and synchronization.
- `Website/wasm/` contains Rust source for the WebAssembly engine.
- `Server/` contains the self-hosted Windows server and YAML configuration.
- `Offline/` contains the generated standalone offline edition and its build script.
- `.github/workflows/` contains GitHub Actions automation.
