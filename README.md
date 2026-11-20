# PixelPhyx ![Logo](https://github.com/Jack105WA/PixelPhyx/blob/main/Website/assets/PixelPhyxLOGO.png?raw=true)

Pixelphyx is a online 2D Physics Simulator ![pencil](https://github.com/Jack105WA/PixelPhyx/blob/main/Website/assets/pencil.png?raw=true) featuring multiplayer ![globe](https://github.com/Jack105WA/PixelPhyx/blob/main/Website/assets/globe.png?raw=true), Simulated Reactions and more!

<p align="center">
  <a href="https://jack105wa.github.io/PixelPhyx/">
    <img src="https://shields.io" alt="Websites" />
  </a>
  <a href="https://github.com/Jack105WA/PixelPhyx/blob/main/Offline/PixelPhyx-Offline-Loader.html">
    <img src="https://shields.io" alt="Download Offline" />
  </a>
</p>

## Play online

Production Site: https://jack105wa.github.io/PixelPhyx/

The production game runs its simulation engine compiled from Rust to WebAssembly.

## Play offline

Download the [standalone offline HTML edition](https://raw.githubusercontent.com/Jack105WA/PixelPhyx/main/Offline/offline.html) directly. Save the file and open it in a browser; it does not need the loader, GitHub, or a server.

The offline edition is generated from Website/ by Offline/build-offline.mjs. Local offline play does not require multiplayer services.

## Self-hosted multiplayer

Photon has been removed. Multiplayer uses a self-hosted WebSocket relay in `Server/`. The relay is separate from the game website and does not host or download client files.

1. Download the repository's `Server/` folder.
2. Install Node.js 20 or newer.
3. Run `Start Server.bat`.
4. Keep the server running. It prints the WebSocket port in the console.
5. Open the game client separately from GitHub Pages or another static web host. Select **Online**, enter the host's LAN IP (or public IP for internet play), and press **Connect to server**.
6. For internet access, forward the configured TCP port (default `3000`) to the host PC and share its public IP address.

The relay handles lobby discovery, lobby limits, player membership, join approvals, and gameplay message delivery. The room host remains the physics authority; if the host disconnects, authority moves to another connected player.

Edit `Server/config.yml` to set the server name, bind address, port, maximum players per lobby, and maximum active lobby count. The launcher only updates server files and does not download, bundle, or host the game website. It does not overwrite config.yml.

A client loaded over HTTPS requires a WSS endpoint; configure a TLS reverse proxy in front of the server for secure WebSockets. Worlds are held in memory and are not persisted after a server restart. Custom materials remain excluded from multiplayer.

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
