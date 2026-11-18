# PixelPhyx Rust/WASM engine

This branch is an offline engine migration. It does not use Photon, room transport, player presence, or multiplayer synchronization in the new engine API.

## Build

```sh
wasm-pack build Website/wasm --target web --release --out-dir ../pkg
```

## Ownership target

| System | Implementation |
|---|---|
| Physics simulation | Rust/WASM |
| Material reactions and chemistry | Rust/WASM |
| Particle movement and collisions | Rust/WASM |
| Ropes and constraints | Rust/WASM |
| Rigid bodies and collisions | Rust/WASM |
| Canvas pixel rendering | Rust/WASM |
| Rendering effects and compositing | Rust/WASM |
| Input handling | Rust/WASM |
| UI and menus | TypeScript |

## Current status

The new `World` WASM API provides simulation state, configurable material properties and reaction pairs, grid particle movement, basic axis-aligned rigid-body integration/collision, pointer-driven brush input, and RGBA frame generation.

This is an engine foundation, not a completed parity port. Existing material IDs/reaction rules, complete rope endpoint solving, robust rigid-body geometry, visual effects/compositing, and the current UI still need to be migrated and validated before replacing the existing runtime. The UI is not yet converted to TypeScript. The existing page/runtime may still contain online UI or transport code; those files have not yet been removed.