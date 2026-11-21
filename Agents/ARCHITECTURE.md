# Architecture

## System overview

PixelPhyx has four cooperating runtime areas:

1. **Browser client** — renders the interface, captures user input, schedules local simulation, and coordinates modules.
2. **Rust/WebAssembly engine** — owns performance-sensitive grid simulation, chemistry, rendering, and selected geometric/input operations.
3. **Multiplayer transport and relay** — exchanges operations and snapshots between clients through a self-hosted WebSocket server. The room host runs the authoritative simulation.
4. **Offline build** — packages the same browser runtime and generated WASM into a single HTML file with multiplayer disabled.

GitHub Actions builds the WASM package, generates the offline edition, and deploys the website.

## Online browser data flow

```text
Browser input / UI
       |
       v
Website/js/main.js  <----> UI shell / life / material helpers
       |
       +----> wasm-engine.js ----> Website/pkg/ ----> Rust WASM
       |                              |
       |                              +--> chemistry
       |                              +--> grid / particle movement
       |                              +--> ropes / rigid bodies
       |                              +--> rendering / compositing
       |                              +--> pointer mapping / painting
       |
       +----> physics-engine.js (rope contacts and airborne particles)
       |
       +----> netcode/multiplayer.js
                    |
                    +--> ws-rooms.js
                    +--> ws-sync.js
                    +--> ws-codec.js
                    |
                    v
             WebSocket relay (Server/server.js)
                    |
                    v
             Host-authoritative room simulation
```

The exact call sequence is owned by the runtime. Keep module boundaries stable and inspect callers before moving responsibilities.

## Simulation ownership

- Browser event capture, tool selection, UI, local storage, and application orchestration remain JavaScript/TypeScript.
- Rust/WASM provides the grid/particle step, chemistry, rendering, rope stepping, rigid-body stepping, pointer coordinate mapping, brush rasterization, and related performance-sensitive functions.
- The separate JavaScript physics module currently handles rope contacts and airborne-particle interactions. Do not migrate or duplicate these behaviors without tracing their shared arrays and update order.
- Material IDs and parallel per-cell arrays are shared contracts. Treat changes to IDs, dimensions, typed-array lengths, or serialization as cross-system changes.

## Multiplayer flow

- The client netcode is separated into transport/room handling, binary codec, and synchronization.
- Clients send edits/operations to the room host; the host validates/receives approved operations, applies them, assigns ordered revisions, and relays them to peers.
- The host sends chunked world snapshots and rope state. Clients apply host state and use revisions to avoid stale snapshots overwriting newer operations.
- Cursor updates are low-reliability presence data; gameplay edits and required snapshot chunks use reliable delivery.
- The server manages lobby membership, join approval, message routing, and isolated headless browser sessions. The room host remains the simulation authority; host departure requires authority reassignment.
- Room/world state is in memory. It is not durable storage.
- A browser served over HTTPS cannot connect to a plain `ws://` endpoint; configure a TLS reverse proxy and WSS.

## Offline flow

```text
Website source + Website/pkg + shared assets
                 |
                 v
       Offline/build-offline.mjs
                 |
                 v
        Offline/offline.html
                 |
                 v
       Browser opened via file://
```

The generator strips online module imports, embeds the generated WASM glue and binary, inlines the font and pencil icon, and installs an offline multiplayer adapter that rejects multiplayer use. Keep the output self-contained: no external scripts, updater, or raw GitHub dependencies.

## Build and deployment

- `.github/workflows/build-wasm.yml`: builds `Website/wasm` with `wasm-pack` and commits generated `Website/pkg/` output to `main`.
- `.github/workflows/offline-build.yml`: validates the generator, rebuilds `Offline/offline.html`, checks that it is self-contained, and commits changed output.
- `.github/workflows/pages.yml`: compiles website and server TypeScript, syntax-checks browser JS, copies `Website/`, root `assets/`, and offline HTML into the Pages artifact, then deploys GitHub Pages.

Generated artifacts are currently committed by the WASM/offline workflows. The root README's statement that WASM artifacts are not committed is inconsistent with the current workflow and tree; resolve this explicitly rather than relying on either statement.

## Architecture change checklist

Before moving or replacing a subsystem:
1. Identify the current owner and all callers.
2. Document input/output shapes and shared state.
3. Decide which runtime owns the behavior (JS or Rust), avoiding duplicated implementations.
4. Preserve online/offline initialization and multiplayer serialization.
5. Update tests and all affected architecture/status docs.
