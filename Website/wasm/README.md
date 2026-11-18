# PixelPhyx Rust/WASM engine

The `photon-wasm` branch is the offline engine migration. The WASM simulation API does not depend on Photon, room transport, player presence, or multiplayer synchronization.

## Build

```sh
wasm-pack build Website/wasm --target web --release --out-dir ../pkg
```

## Target architecture

| System | Final implementation |
|---|---|
| Physics simulation | Rust/WASM |
| Material reactions and chemistry | Rust/WASM |
| Particle movement and collisions | Rust/WASM |
| Ropes and constraints | Rust/WASM |
| Rigid bodies and collisions | Rust/WASM |
| Canvas pixel rendering | Rust/WASM |
| Rendering effects and compositing | Rust/WASM |
| Input coordinate mapping and brush rasterization | Rust/WASM |
| Browser pointer events and tool/UI orchestration | JavaScript |
| UI and menus | TypeScript |

## Migration progress

- **Canvas pixel rendering and effects compositing:** Rust/WASM generates material pixels, wetness/temperature tint, moving-cell overlays, fire/lava/heat glow, bilinearly upscales the quarter-resolution glow mask, and applies the screen blend in one call. JavaScript only uploads the completed RGBA frame; Canvas handles subsequent entity/UI overlays.\n- **Rigid-body core:** body integration, angular motion, sleeping-body handling, oriented-box SAT separation, angular impulses, friction impulses, and impact damage are processed by Rust/WASM. The JavaScript layer still handles grid terrain contacts, car suspension, airborne-particle contacts, dragging, and rendering; those grid-coupled behaviors are not claimed as migrated.\n- **Rope Verlet integration and constraints:** migrated to Rust/WASM with two substeps, Verlet damping, ten distance-constraint passes, anchor weighting, and solid-cell node collision. JavaScript packs the existing rope objects into typed arrays and retains their rendering and interaction representation.
- **Particle movement and cell collisions:** migrated to `step_particles` in Rust/WASM. It handles momentum integration, gravity, empty-cell movement, solid blocking, liquid flow, gas rise, sand displacement, and particle-state transfer. JavaScript now only records visual interpolation from the returned compact move list.
- **Material reactions and chemistry:** migrated to the consolidated `step_chemistry` WASM entry point. It owns acid corrosion, water phase changes, salt dissolution, steam/smoke transitions, fire and lava reactions, fuel consumption, ignition, TNT detonation, moisture transfer, air convection, and thermal conduction.
- **JavaScript material module:** reduced to sand displacement, which belongs to the particle movement migration rather than chemistry.
- **Build validation:** `wasm-pack build` and JavaScript module syntax validation passed in GitHub Actions on the `photon-wasm` branch.
- **Input mapping and brush rasterization:** Rust/WASM converts pointer coordinates into world-grid positions and applies circular brushes and Bresenham line strokes directly to the material grid. JavaScript retains browser pointer events, pointer capture, tool selection, object/rope dragging, and UI orchestration.
- **Not yet migrated:** rope-to-particle impulse/contact handling, airborne-particle rope collisions, rope-aware particle movement checks, remaining rigid-body/grid collision parity, and TypeScript UI. The existing `World` API is still a foundation for those systems, not a completed replacement.

The runtime calls chemistry once per simulation tick to avoid repeated JavaScript/WASM boundary crossings and unnecessary typed-array transfers.
