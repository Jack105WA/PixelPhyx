# Rust and WebAssembly

## Mandatory language rule

All code compiled into WebAssembly must be written in Rust. JavaScript and TypeScript may initialize the WASM package, pass typed arrays, handle browser APIs, and orchestrate application behavior, but must not become a WASM implementation language.

## Crate

- Manifest: `Website/wasm/Cargo.toml`
- Crate: `pixelphyx-wasm`
- Edition: Rust 2021
- Library crate types: `cdylib`, `rlib`
- Binding dependency: `wasm-bindgen`
- Browser package output: `Website/pkg/`

## Rust module map

| Module | Responsibility |
|---|---|
| `lib.rs` | wasm-bindgen public API and module exports |
| `chemistry.rs` | Material reactions, heat, phase changes, corrosion, combustion and related state transitions |
| `engine.rs` | Engine-level orchestration/helpers |
| `grid.rs` | Grid/particle stepping, movement and cell-state transfer |
| `input.rs` | Pointer-to-grid mapping and brush/line rasterization |
| `render.rs` | Pixel frame rendering and compositing |
| `rigid_bodies.rs` | Rigid body stepping |
| `ropes.rs` | Rope constraints and rope stepping |

Keep modules focused. Add a new Rust module when a subsystem has a distinct responsibility and can be exposed through a narrow API.

## JavaScript boundary

The browser wrapper is `Website/js/wasm-engine.ts`. It imports generated bindings from `Website/pkg/pixelphyx_wasm.js`, initializes the module once, and returns a frozen object containing the exported functions.

Current wrapper exports include:
- Velocity preparation and cell rendering.
- Frame rendering and composited frame rendering.
- Particle counting.
- Chemistry stepping.
- Particle stepping.
- Rope stepping and rigid-body stepping.
- Pointer mapping and segment painting.

The authoritative export signatures are in `Website/wasm/src/lib.rs` and generated declarations in `Website/pkg/pixelphyx_wasm.d.ts`. Update the Rust export, wrapper, and generated package together.

## Build

From repository root, with Rust and wasm-pack installed:

```sh
wasm-pack build Website/wasm --target web --release --out-dir ../pkg
```

The CI workflow installs the stable Rust toolchain with `wasm32-unknown-unknown` and wasm-pack, then runs the same build.

For local Rust tests:

```sh
cargo test --manifest-path Website/wasm/Cargo.toml
```

For a release browser package, use the wasm-pack command above and verify the output files under `Website/pkg/`.

## Memory and performance

- Reuse typed arrays for per-cell state where possible.
- Keep array lengths consistent with `width * height` and validate at API boundaries where needed.
- Avoid unnecessary JS↔WASM copies and repeated boundary crossings inside a single simulation tick.
- Return compact move/event data when the browser needs only a small subset of engine state.
- Keep ownership and lifetime of WASM-backed memory explicit; do not retain stale JS views after memory growth or buffer replacement.
- Avoid unnecessary `unsafe`; document and isolate any required use.
- Do not block the browser main thread with unbounded work.

## Offline compatibility

The offline generator embeds the generated WASM glue and binary as data URLs/base64 and initializes the same exported API. Any new export used by the main runtime must also be visible through `wasm-engine.ts` and be available in the generated package before the offline edition is rebuilt.

The offline build validates required exports against the main runtime and parses the generated application script. Keep this validation intact.

## Migration discipline

Do not migrate a subsystem simply because Rust is faster in theory. First identify its data contract and update order, then migrate one cohesive responsibility, preserve the JS interface, and test online and offline behavior. Never leave two competing authoritative implementations of the same simulation rule.
