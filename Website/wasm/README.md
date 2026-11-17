# PixelPhyx Rust/WASM engine

This branch is the isolated Rust/WebAssembly migration of the Photon test build.

## Build

Install Rust with the `wasm32-unknown-unknown` target and `wasm-pack`, then run:

```sh
wasm-pack build Website/wasm --target web --release --out-dir ../pkg
```

Generated `Website/pkg/` files are build artifacts and are not committed. The browser entrypoint imports the generated package through `Website/js/wasm-engine.js`.

## Current migration boundary

- Rust/WASM owns particle velocity preparation and base RGBA pixel shading.
- JavaScript still owns pointer input, Photon transport, rope collision queries, chemistry/material reactions, rigid bodies, interpolation, visual effects, and Canvas 2D compositing.
- Existing world/material IDs and Photon serialization remain unchanged.

This is an incremental port, not yet a full Rust replacement. Next stages: move the complete cellular/material solver, ropes and rigid bodies, then remaining canvas-side effects. Keep Photon networking and UI orchestration in JavaScript.
