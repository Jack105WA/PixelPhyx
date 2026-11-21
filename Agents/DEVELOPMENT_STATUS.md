# Development Status

_Last reviewed: 2026-11-20. Statuses reflect repository inspection and observed CI evidence, not a complete manual QA pass._

Status definitions are authoritative in the root `AGENTS.md`. In particular, `COMPLETED` requires testing and verification.

| System | Status | Description | Known issues / remaining work | Relevant files |
|---|---|---|---|---|
| Browser application shell | FUNCTIONAL | Main browser page, toolbar, side panels, canvas and dialogs exist. | Manual browser/responsive smoke test not performed in this review. | `Website/index.html` |
| Core app orchestration | NEEDS IMPROVEMENT | Main runtime owns world state, material selection, input, simulation scheduling and integrations. | Large orchestration module; continue extracting responsibilities behind stable interfaces. TS/JS pair must stay synchronized. | `Website/js/main.ts`, `Website/js/main.js` |
| Material system | FUNCTIONAL | Material definitions and state buffers integrate with simulation and rendering. | Verify material ID consistency across JS, Rust, offline build and multiplayer payloads after changes. | `Website/js/material-physics.ts`, `Website/js/main.ts` |
| Life and vegetation | NEEDS IMPROVEMENT | Multiple plant definitions and growth logic exist, with soil and grass material support. | Procedural growth, environmental conditions, spread and planting ergonomics need continued behavior testing. | `Website/js/life.ts`, `Website/js/main.ts` |
| Particle/grid physics | FUNCTIONAL | Rust exports particle stepping; JS integrates world orchestration and visual interpolation. | Runtime performance and edge cases not manually profiled in this review. | `Website/wasm/src/grid.rs`, `Website/wasm/src/engine.rs`, `Website/js/wasm-engine.ts` |
| Chemistry/reactions | FUNCTIONAL | Rust chemistry module and consolidated WASM step entry point exist. | Verify reaction edge cases and state-array compatibility when changing materials. | `Website/wasm/src/chemistry.rs`, `Website/wasm/src/lib.rs` |
| Pixel rendering | FUNCTIONAL | Rust/WASM rendering and compositing exports are integrated through wrapper. | Browser visual regression/performance test not run in this review. | `Website/wasm/src/render.rs`, `Website/js/wasm-engine.ts` |
| Rope and airborne physics | NEEDS IMPROVEMENT | Dedicated JS solver handles rope contacts, rope motion, and airborne particle behavior; Rust rope stepping also exists. | Rope-to-particle interactions and ownership boundaries require careful review; do not duplicate solver behavior. | `Website/js/physics-engine.ts`, `Website/wasm/src/ropes.rs`, `Website/wasm/src/rigid_bodies.rs` |
| Input rasterization | FUNCTIONAL | Rust/WASM maps pointers and paints circular brushes/line segments. | Test all tools, pointer edges, brush radii and canvas sizes after changes. | `Website/wasm/src/input.rs`, `Website/js/main.ts` |
| Multiplayer client/netcode | NEEDS IMPROVEMENT | WebSocket codec, rooms, transport and synchronization are split into modules; snapshots and reliable operations are implemented. | Full host/client integration, reconnect, out-of-order update and host migration QA not verified here. | `Website/js/netcode/` |
| Self-hosted server | NEEDS IMPROVEMENT | Node.js relay, lobby handling, headless authoritative simulation, launcher and YAML configuration exist. | Requires user-hosted process/network access; in-memory rooms do not persist; HTTPS requires WSS. No public matchmaking backend. | `Server/server.ts`, `Server/config.yml`, `Server/Start Server.bat` |
| WASM build pipeline | FUNCTIONAL | GitHub Actions workflow builds Rust target and publishes `Website/pkg/`. | Confirm latest dedicated build workflow on demand; tracked generated package policy conflicts with README wording. | `.github/workflows/build-wasm.yml`, `Website/wasm/`, `Website/pkg/` |
| Offline edition | FUNCTIONAL | Generator embeds runtime, WASM, font and assets into a standalone HTML file; CI validates generated output. | Manual offline `file://` and no-network browser test not performed in this review. | `Offline/build-offline.mjs`, `Offline/offline.html` |
| GitHub Pages deployment | FUNCTIONAL | Workflow compiles TS, checks browser JS, assembles site and deploys Pages. A recent deployment completed successfully. | Re-run after changes; manual production smoke test not performed here. | `.github/workflows/pages.yml` |
| Agent documentation | COMPLETED | Required seven-file documentation set is being added in this commit. | Keep it current as implementation changes. | `AGENTS.md`, `Agents/` |

## Verification record

- Repository tree and current source files inspected on `main`.
- A recent Pages deployment for commit `1aa8718dc16c03e72949b1562d0ca2f0075c2318` was observed with conclusion `success`.
- An offline build workflow produced the current generated `Offline/offline.html` commit `6e85f1b7152e002fe72167c85703b2ace5a7ca6c`.
- No local Rust, TypeScript, browser, offline, or multiplayer tests were run during this documentation-only change.

Update this table after each meaningful implementation or test. Do not promote a row to `COMPLETED` without verified tests.
