# Pixel Phyx Multithreading Plan

## Current status

The persistent Web Workers in `Website/js/parallel-worker.ts` are auxiliary workers for HUD summaries only. They count occupied cells and sum air temperature values. They do not execute physics, chemistry, life, ropes, or rendering. Do not describe the simulation as multithreaded yet.

The simulation remains authoritative on the main thread. Rust/WASM accelerates kernels, but a WASM call is synchronous and does not itself create another thread. The ordered tick dispatcher is now extracted into `Website/js/simulation-core.ts` and shared by the browser and offline builds. It receives stage callbacks, so this is an orchestration extraction—not yet a headless state-owning simulation core.

## Authoritative tick order

The current `tick()` in `Website/js/main.ts` runs these stages in order:

1. Clear per-tick movement bookkeeping: `movingParticles`, destination maps, and `updated`.
2. Run life and soil logic (`lifeSystem.step`), mutating `cells`, `materialState.age`, and `materialState.wetness`.
3. Apply local and remote leafblower impulses.
4. Step rope constraints and rope/grid collision handling (`stepRopes`).
5. Advance `simulationTick`, build rope movement-block flags, and call WASM `step_particles`.
6. Apply returned particle movement triples to JavaScript-side movement/interpolation bookkeeping.
7. Run custom-material movement and reactions (`stepCustomMaterials`).
8. Scan the grid to emit visual effects from material locations.
9. Run WASM `step_chemistry`, including thermal diffusion, acid, combustion, and phase changes.
10. Step visual particles.

This order is behavior-sensitive. In particular, life runs before particle physics, rope blocking is prepared before particle movement, and chemistry runs after custom-material movement and visual emission.

## State ownership inventory

### Core world state — must have one owner

- Grid dimensions: `W`, `H`, `N`.
- Material grid: `cells`.
- Per-cell movement flags: `updated`, `movementBlocks`.
- Per-cell velocities: `particleVelocityX`, `particleVelocityY`.
- Material arrays in `materialState`: `wetness`, `heat`, `heatInputs`, `fuel`, `burn`, `age`, `corrosion`, `airHeat`, and `airNext`.
- Deterministic tick counter: `simulationTick`.

These arrays are mutually dependent. A material swap in Rust moves multiple per-cell state arrays together. Sending only `cells` to a worker would corrupt state alignment.

### Simulation subsystems — also stateful

- Life system: seed burial depth and plant/soil updates.
- Rope state: points, previous positions, anchors, drag flags, and rope lengths.
- Custom materials: definitions, density, gravity/reaction behavior, and emitted particles.
- Particle movement bookkeeping: `movingParticles`, `moveByDestination`, `movingDestinations`, and `snapshotMoves`.
- Visual effects: `airborneParticles` and `movingParticles`.
- Multiplayer authority: host-only simulation, remote leafblowers, incoming operations, snapshots, and publication timing.

### Main-thread responsibilities to retain

- DOM/UI controls and pointer/keyboard input.
- Canvas and WebGL/2D rendering contexts, frame interpolation, and drawing.
- Browser storage, URL state, and multiplayer transport.
- Applying user commands and resizing the world through an explicit worker message protocol.

## Why grid chunking is unsafe

The Rust particle solver scans the grid in a deterministic order and mutates neighboring cells in place. Swaps also move velocity, wetness, heat, heat input, fuel, burn, age, and corrosion values. Movement decisions depend on cells modified earlier in the same tick. Independent workers writing separate grid regions would still race on boundary neighbors and would change scan-order behavior.

Do not partition the current grid into independently mutating workers unless the simulation algorithm is deliberately redesigned around deterministic multi-phase updates and validated against the existing solver.

## Target architecture

Use one persistent simulation worker as the sole owner of all mutable simulation state. Keep UI, input, rendering, and network transport on the main thread.

The main thread should send small commands (paint strokes, tool actions, setting changes, resize, pause/resume, single-step, and multiplayer operations). The worker should run the complete ordered tick and return render-ready snapshots or dirty regions. Rendering must never mutate worker-owned simulation arrays.

Avoid copying every typed array on every frame. Prefer a bounded snapshot protocol with transferable double buffers or compact dirty-region updates. A transferred buffer must not be reused by the sender until ownership is returned. Keep message sequence numbers so stale snapshots cannot overwrite newer state.

## Migration sequence and acceptance criteria

1. **Baseline and parity:** keep TypeScript/runtime source pairs synchronized and run worker tests plus the existing build pipeline. The ordered tick dispatcher has been extracted and its stage order is covered by Node tests.
2. **Define the protocol:** specify initialization, commands, resize, tick scheduling, snapshot ownership, errors, and shutdown. Add protocol tests before moving state.
3. **Extract a headless simulation core:** the dispatcher extraction is complete, but state initialization and subsystem ownership still need to move behind a headless interface. Add deterministic state-hash comparisons before changing ownership.
4. **Run the core in one worker:** move ownership of all simulation arrays into the worker. Keep a main-thread fallback for unsupported environments.
5. **Move rendering data efficiently:** introduce transferable double buffers or dirty-region messages, then verify no buffer is read after transfer and no stale frame is applied.
6. **Integrate browser features:** route pointer input, resize, multiplayer authority, save/load, and offline packaging through the same protocol.
7. **Validate behavior and performance:** compare deterministic fixtures for particles, soil/seed growth, ropes, chemistry, and custom materials. Measure frame time and message-copy cost at every supported resolution.

A migration step is complete only when the authoritative physics/chemistry/life tick is actually running in the worker, behavior tests pass, and the main thread no longer mutates worker-owned simulation state.

## Deployment constraint

Do not rely on `SharedArrayBuffer`, Rayon, or WASM shared-memory threads for the GitHub Pages build unless the hosting setup is changed to provide the required cross-origin isolation headers. Standard Web Workers and transferable `ArrayBuffer` messages work without that requirement.
