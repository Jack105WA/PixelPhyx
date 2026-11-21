# Codebase Structure

This document describes the repository layout observed on `main`. Update it whenever directories or important files change.

```text
/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/
│       ├── build-wasm.yml
│       ├── offline-build.yml
│       └── pages.yml
├── AGENTS.md
├── Agents/                       # Agent/developer context and architecture docs
├── assets/                       # Shared SVG and font assets
├── Offline/
│   ├── PixelPhyx-Offline-Loader.html
│   ├── build-offline.mjs
│   ├── build-offline.mts
│   ├── offline.html              # Generated single-file offline game
│   └── tsconfig.json
├── Server/
│   ├── server.js / server.ts     # Node.js relay and hosting server
│   ├── Start Server.bat
│   ├── Configure Firewall.ps1
│   ├── config.yml
│   ├── download-website.js / .ts
│   ├── package.json
│   ├── tsconfig.json
│   └── version.json
├── Website/
│   ├── index.html                # Browser application shell
│   ├── favicon.ico
│   ├── js/
│   │   ├── main.js / main.ts     # Main app runtime/orchestration
│   │   ├── life.js / life.ts     # Plant/life simulation
│   │   ├── physics-engine.js / .ts # Rope and airborne particle interactions
│   │   ├── material-physics.js / .ts
│   │   ├── wasm-engine.js / .ts  # Rust/WASM initialization and API wrapper
│   │   ├── ui.js / ui.ts         # UI shell, modal and keyboard behavior
│   │   ├── server-list.js / .ts
│   │   └── netcode/
│   │       ├── multiplayer.js / .ts
│   │       ├── ws-codec.js / .ts
│   │       ├── ws-rooms.js / .ts
│   │       └── ws-sync.js / .ts
│   ├── pkg/                      # Generated wasm-pack browser package
│   ├── tsconfig.json
│   └── wasm/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs            # wasm-bindgen exports
│           ├── chemistry.rs
│           ├── engine.rs
│           ├── grid.rs
│           ├── input.rs
│           ├── render.rs
│           ├── rigid_bodies.rs
│           └── ropes.rs
├── CREDITS.md
├── LICENSE
└── README.md
```

## Ownership map

| Area | Responsibility | Start here |
|---|---|---|
| Browser shell | Layout, canvas, controls, modals, styling | `Website/index.html` |
| App orchestration | World state, tools, simulation scheduling, input integration | `Website/js/main.ts` |
| Material state | Material IDs, state buffers, JavaScript-side material helpers | `Website/js/material-physics.ts` |
| Life and vegetation | Plant definitions and growth behavior | `Website/js/life.ts` |
| Rope/airborne solver | Rope geometry, contacts, airborne particles | `Website/js/physics-engine.ts` |
| Rust/WASM API | Initialization and exported functions | `Website/js/wasm-engine.ts`, `Website/wasm/src/lib.rs` |
| Rust simulation | Chemistry, grid movement, rendering, constraints, input rasterization | `Website/wasm/src/` |
| Multiplayer transport | Client lifecycle, room operations, codec, sync | `Website/js/netcode/` |
| Self-hosted relay | HTTP hosting, WebSocket routing, lobby/room authority | `Server/server.ts` |
| Offline bundling | Embed runtime, generated WASM, fonts and assets | `Offline/build-offline.mjs` |
| Deployment | TypeScript checks, validation, site packaging and Pages deployment | `.github/workflows/pages.yml` |

## Source and generated files

- TypeScript files are the editable source where a matching `.ts` file exists. The website TypeScript config compiles `js/**/*.ts` into the same `js/` directory.
- JavaScript files are the browser runtime loaded by the website. After editing TypeScript, ensure the generated JavaScript is synchronized and validated.
- Rust source lives only in `Website/wasm/src/`. The wasm-pack output lives in `Website/pkg/`.
- `Offline/offline.html` is generated. Edit its template/build script or source modules, then rebuild; do not hand-edit generated application code.
- Some repository files have no paired TypeScript source. Inspect the actual file before deciding where a change belongs.

## Adding code

Prefer extending an existing subsystem. Add a new module only when it represents a distinct responsibility with a stable interface. Avoid creating directories for one-off files. Update this map when a file or subsystem is added, moved, or removed.
