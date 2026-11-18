# PixelPhyx

PixelPhyx is a browser-based 2D pixel physics and chemistry sandbox featuring falling particles, liquids, gases, material reactions, explosions, ropes, rigid-body props, and multiplayer.

## Play online

Production: https://jack105wa.github.io/PixelPhyx/

The production game runs its simulation engine compiled from Rust to WebAssembly.

## Play offline

Download the standalone HTML edition from the [latest GitHub release](https://github.com/Jack105WA/PixelPhyx/releases/latest).

The offline edition is generated from Website/ by Offline/build-offline.mjs. Local offline play does not require the online multiplayer services.

## Multiplayer

Multiplayer uses Photon Realtime Core 6 for browser connections, room discovery, room membership, and reliable gameplay events. The room's Photon master client is the physics authority; other clients render interpolated world snapshots instead of simulating a separate copy of the particle world.

Drawing, erasing, material placement, ropes, props, settings, pause/resume, and single-step requests are relayed through the room host. Room hosts approve join requests, and Photon transfers master-client ownership if the host leaves. World snapshots are compressed and chunked; ropes use small, frequent state updates, and prop state is sent only when it changes.

Photon uses secure WebSockets and Photon Cloud relay. It does not provide direct LAN peer-to-peer transport. The App ID in browser code is a public application identifier, not a secret. Usage, CCU limits, and billing are controlled in the [Photon Dashboard](https://dashboard.photonengine.com/).

## Controls

- **Draw:** place the selected material.
- **Line:** drag to draw a straight material line.
- **Rope:** drag to create a rope; right-click to delete.
- **Props:** spawn cars, buckets, balls, crates, and barrels.
- **Grab:** drag rope points or props.
- **Erase:** remove particles.
- **Box:** place a block of the selected material.
- **Blast:** place TNT and ignite it with fire.
- **Heat / Cool:** place fire or ice.
- **Brush size:** use the slider or mouse wheel.
- **Gravity:** adjust gravity strength.
- **Simulation speed:** change the simulation rate multiplier. The physics clock uses fixed simulation steps.
- **Ambient temperature:** adjust the world temperature; heat and cold affect water and ice.
- **Space:** pause or resume.
- **Step:** advance one simulation step while paused in supported multiplayer sessions.
- **Right click:** erase.
- **Export PNG:** save an image of the current experiment.

## Rust and WebAssembly

The production Rust/WASM engine moves performance-sensitive simulation and pixel-processing systems into Rust compiled to browser WebAssembly:

- Physics force integration and particle movement/collisions.
- Material reactions, chemistry, and heat simulation.
- Rope constraints and rigid-body collision solving.
- Canvas pixel rendering and rendering effects compositing.
- Input coordinate mapping and brush rasterization.

JavaScript continues to handle browser events, application orchestration, multiplayer integration, and drawing UI/entity overlays. The UI shell is written in TypeScript and compiled to browser-ready JavaScript.

The WASM package is built during CI; generated package artifacts are not committed to the repository.

## GitHub Pages deployment

GitHub Pages must use **GitHub Actions** as its source in repository Settings → Pages.

The workflow in .github/workflows/pages.yml:
- Publishes main as the production site root.
- Builds the Rust/WASM package from main and includes it in the production site.
- Rebuilds the standalone offline edition on main.

## Repository layout

- Website/ contains the browser game and published site.
- Website/js/ contains the browser-side game, simulation integration, and UI modules.
- Website/js/netcode/ contains Photon multiplayer transport, room, synchronization, and codec modules.
- Website/wasm/ contains the Rust source for the WebAssembly engine.
- Offline/offline.html is the generated standalone offline edition.
- Offline/PixelPhyx-Offline.html loads the latest standalone build.
- Offline/build-offline.mjs builds the standalone offline edition.
- .github/workflows/ contains GitHub Actions automation.
