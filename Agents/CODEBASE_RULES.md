# Codebase Rules

These rules supplement and operationalize the root `AGENTS.md`. The root file takes precedence if a conflict exists.

## Core design

- Everything must be modular, independently understandable, and straightforward to change.
- Keep boundaries between UI, simulation, rendering, networking, storage, and configuration.
- Prefer small focused modules and explicit interfaces over monolithic files or implicit global coupling.
- A change to one subsystem must not unexpectedly alter another subsystem.
- Reuse existing abstractions. Do not duplicate a system to avoid understanding the existing one.
- Keep frequently tuned values in a suitable central configuration or material definition.
- Do not add dependencies without a concrete need.
- Avoid one-file directories and unnecessary directory creation.

## Language and build rules

- **All WebAssembly implementation code must be written in Rust.** Never add C/C++, AssemblyScript, or another language as a WASM source.
- JavaScript/TypeScript may handle browser integration, UI, orchestration, and network protocol code.
- Keep Rust modules separated by domain and expose a deliberate `wasm-bindgen` API through `Website/wasm/src/lib.rs`.
- Where a TypeScript source file exists, edit the TypeScript source first and regenerate/check its paired JavaScript output with the repository's TypeScript build.
- Do not blindly overwrite paired JavaScript files: inspect whether they contain generated output or intentional runtime-specific differences.
- Treat `Website/pkg/` as generated wasm-pack output. Do not hand-edit generated glue, declarations, or binary files.
- Treat `Offline/offline.html` as generated output. Modify source modules or `Offline/build-offline.mjs`, then run the generator.
- Preserve the standalone offline build's no-network/no-external-script requirements.

## Simulation rules

- Keep material IDs and state-array indexing consistent across JavaScript, Rust, offline builds, and multiplayer serialization.
- Avoid duplicated physics or chemistry behavior across JS and Rust. Decide which engine owns each behavior.
- Use stable, bounded data structures for per-tick work. Avoid avoidable allocations and repeated full-world scans.
- Keep rendering derived from simulation state; do not make visual effects authoritative physics state.
- Preserve deterministic/authoritative multiplayer behavior where applicable.
- New life, plant, and material behaviors must integrate through shared material properties and existing simulation interfaces, not scattered material-specific branches.
- Test edge cases at world boundaries, empty/full cells, high simulation speeds, and interactions with ropes/airborne particles.

## Multiplayer and server rules

- Keep WebSocket encoding/decoding, room lifecycle, and synchronization responsibilities separated under `Website/js/netcode/`.
- Validate inbound payload shape, lengths, counts, IDs, and numeric values before applying them.
- Preserve host authority and operation ordering; account for delayed snapshots and duplicate operations.
- Avoid broadcasting full world state when a smaller reliable operation or targeted snapshot is sufficient.
- Offline mode must not require a server or multiplayer module to initialize.
- The relay is self-hosted. Do not imply that a public matchmaking service or arbitrary IP server exists unless implemented and verified.
- Do not persist secrets, tokens, or private server addresses in tracked configuration. Keep safe defaults and document firewall exposure.

## Browser/UI rules

- Keep UI modules independent from simulation internals; inject callbacks or narrow interfaces.
- Keep keyboard shortcuts from intercepting text inputs, textareas, selects, or editable content.
- Preserve keyboard, pointer, touch, and keyboard-focus accessibility when changing controls.
- Tool icons must retain accessible names even when visible labels are hidden. Use the existing tooltip convention.
- Keep responsive behavior and canvas/world coordinate mapping consistent.

## Testing and verification

Before declaring work complete, run the narrowest relevant checks and then affected integration checks.

Typical checks:
- Website TypeScript: `npx --yes --package typescript@5.9.3 tsc -p Website/tsconfig.json`
- Server TypeScript: `npx --yes --package typescript@5.9.3 tsc -p Server/tsconfig.json`
- Rust/WASM: `wasm-pack build Website/wasm --target web --release --out-dir ../pkg`
- Offline build: `node --check Offline/build-offline.mjs && node Offline/build-offline.mjs`
- Browser JS syntax: `node --input-type=module --check < path/to/module.js`
- Rust unit tests: `cargo test --manifest-path Website/wasm/Cargo.toml` where applicable.

Also test the affected feature in a browser. For canvas/simulation changes, test drawing, erasing, pause/step, world resizing, and material interactions. For multiplayer changes, test host/client joins, approval, strokes, snapshots, reconnect/disconnect, and host transfer. For offline changes, open the generated HTML from `file://` with networking disabled.

A successful build is not proof of runtime correctness. Do not mark a system `COMPLETED` without direct verification.

## Change workflow

1. Read root `AGENTS.md` and relevant documents in `Agents/`.
2. Inspect the existing implementation and its callers.
3. Identify data contracts, shared state, and regression risks.
4. Make the smallest coherent modular change.
5. Run relevant tests/builds and fix introduced failures.
6. Update `DEVELOPMENT_STATUS.md`, `ARCHITECTURE.md`, `CODEBASE_STRUCTURE.md`, `CHANGELOG.md`, and `CURRENT_CONTEXT.md` when warranted.
7. Report exact files changed, tests run, results, and remaining limitations.

## Git rules

- Work on the existing branch. Do not create a branch without explicit permission.
- Preserve unrelated changes and repository history.
- Keep commits focused and descriptive.
- Do not claim a test passed unless its output was observed.
