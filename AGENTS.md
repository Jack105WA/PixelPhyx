# AGENTS.md — PixelPhyx Development Guidelines

## 1. Project Overview

PixelPhyx is a modular, browser-based simulation and experimentation platform.

All development must prioritize:

- Modularity and maintainability.
- Performance and scalability.
- Reliable client/server synchronization.
- Cross-browser compatibility where possible.
- Offline functionality.
- Easy modification and extension.
- Clear separation between frontend, backend, and simulation logic.

All code must be designed so individual systems can be modified, replaced, or expanded without breaking unrelated functionality.

## 2. Documentation Structure

A root-level `Agents/` directory MUST be maintained.

This directory contains project documentation that helps developers and AI agents understand the current state of the codebase.

Required structure:

```text
/
├── AGENTS.md
├── Agents/
│   ├── CURRENT_CONTEXT.md
│   ├── CODEBASE_STRUCTURE.md
│   ├── CODEBASE_RULES.md
│   ├── DEVELOPMENT_STATUS.md
│   ├── ARCHITECTURE.md
│   ├── WASM.md
│   └── CHANGELOG.md
└── [project files]
```

### Documentation Responsibilities

**CURRENT_CONTEXT.md**
- Current project state.
- Current development focus.
- Recently completed work.
- Known issues.
- Current priorities.
- Important implementation details.
- Anything an incoming developer or AI agent needs to know.

**CODEBASE_STRUCTURE.md**
- Directory and file structure.
- Description of important files.
- Where different systems are implemented.
- Where new functionality belongs.

**CODEBASE_RULES.md**
- Coding conventions.
- Naming conventions.
- Architectural requirements.
- Rules for modifying existing systems.
- Rules for adding new functionality.

**DEVELOPMENT_STATUS.md**
Track the status of individual systems.

Use these statuses:

- `NOT STARTED` — Work has not started.
- `IN PROGRESS` — Currently being developed.
- `FUNCTIONAL` — Implemented and working.
- `NEEDS IMPROVEMENT` — Functional but requires improvements.
- `BROKEN` — Known to be malfunctioning.
- `BLOCKED` — Cannot progress because of another issue.
- `COMPLETED` — Finished, tested, and verified.

Each system should include:
- Current status.
- Description.
- Known issues.
- Remaining work.
- Relevant files.

**ARCHITECTURE.md**
- Overall application architecture.
- System relationships.
- Data flow.
- Client/server communication.
- Simulation architecture.
- Important dependencies.

**WASM.md**
- WebAssembly architecture.
- Rust modules and crates.
- Compilation instructions.
- JavaScript/Rust communication.
- Memory management.
- Performance considerations.

**CHANGELOG.md**
- Important modifications.
- Added systems.
- Removed functionality.
- Bug fixes.
- Architectural changes.

### Documentation Maintenance

Documentation MUST be updated whenever a significant change is made.

When modifying a system:
1. Update its development status.
2. Update relevant architecture documentation.
3. Update current context if the overall project state changes.
4. Update the changelog for significant changes.
5. Update the codebase structure when files or directories change.

Never allow documentation to become misleading or significantly outdated.

## 3. Modularity Requirements

**Everything MUST be modular.**

This is one of the most important project requirements.

All systems must be designed to be independently understandable, maintainable, and replaceable.

Requirements:

- Avoid unnecessarily large files.
- Avoid monolithic systems.
- Separate unrelated functionality.
- Use clear interfaces between modules.
- Minimize dependencies between systems.
- Avoid duplicated functionality.
- Keep configuration separate from implementation.
- Make important settings easy to locate and modify.
- Avoid hardcoded values when configuration is more appropriate.
- Use reusable utilities and shared components where appropriate.

### Change Isolation

Changing one system should not unexpectedly break another.

For example:
- Changing rendering must not break simulation logic.
- Changing simulation logic must not break the UI.
- Changing networking must not break offline functionality.
- Changing materials must not break unrelated materials.
- Changing simulation speed must not break synchronization.
- Changing the canvas size must not break rendering or world coordinates.

When systems need to communicate, use clearly defined interfaces.

Avoid tightly coupling unrelated systems.

### Configuration

Keep frequently modified settings centralized where practical.

Examples:
- Simulation settings.
- Rendering settings.
- World settings.
- Material properties.
- Growth conditions.
- Networking configuration.
- Performance settings.

Do not scatter configuration values throughout unrelated files.

## 4. WebAssembly and Rust Requirements

**ALL WebAssembly (WASM) code MUST be written in Rust.**

This is mandatory.

- Rust is the only permitted language for WebAssembly modules.
- Do not introduce C, C++, AssemblyScript, or other languages for WASM.
- JavaScript and TypeScript may handle browser integration and application logic.
- Rust should handle functionality intended to execute inside WebAssembly.
- Keep Rust modules modular.
- Avoid placing unrelated functionality into one large Rust crate.
- Use clear interfaces between Rust and JavaScript/TypeScript.
- Keep WASM compilation reproducible.
- Document dependencies and build requirements.

### Rust Development

- Prefer safe Rust.
- Avoid unnecessary `unsafe` code.
- Document any required `unsafe` blocks.
- Avoid unnecessary allocations.
- Consider memory ownership and lifecycle.
- Optimize performance without sacrificing correctness.
- Keep Rust modules independently testable.

### WASM Integration

JavaScript/TypeScript should communicate with Rust through defined interfaces.

Avoid:
- Duplicated simulation logic in Rust and JavaScript.
- Unnecessary WASM initialization.
- Uncontrolled memory growth.
- Blocking the main browser thread.
- Unnecessary data copying between JavaScript and WASM.

WASM functionality must have a clearly defined fallback strategy when required for offline or compatibility support.

## 5. Frontend Development

The frontend should remain modular.

Separate:
- UI components.
- Rendering.
- Input handling.
- Simulation interfaces.
- State management.
- Networking.
- Storage.
- Configuration.

Requirements:

- Keep UI components independent of simulation internals.
- Avoid direct manipulation of unrelated systems.
- Reuse existing components.
- Keep styles organized.
- Avoid unnecessary dependencies.
- Ensure the application remains usable at different screen sizes.

## 6. Simulation Development

Simulation systems should be independently maintainable.

Examples include:
- Physics.
- Gravity.
- Particles.
- Materials.
- Temperature.
- Fluids.
- Life and biological growth.
- Vegetation.
- Terrain.
- Environmental conditions.

Requirements:

- Keep individual simulation systems separate.
- Avoid hardcoding behavior for individual materials.
- Support extensible material properties.
- Keep simulation configuration accessible.
- Avoid unnecessary global state.
- Ensure simulation systems interact through defined interfaces.

Simulation improvements must not introduce regressions in existing systems.

## 7. Client/Server Architecture

Client and server responsibilities must be clearly separated.

Requirements:

- Maintain consistent world state.
- Prevent unnecessary synchronization traffic.
- Avoid visual popping and temporary disappearance of objects.
- Handle delayed and out-of-order updates.
- Keep simulation speed synchronized.
- Keep gravity synchronized.
- Keep canvas/world dimensions synchronized.
- Handle disconnections and reconnections.
- Avoid unnecessary server workload.

The server should remain authoritative where server-side simulation or shared state requires it.

Offline functionality must continue working independently of server connectivity.

## 8. Performance Requirements

Performance is a priority.

Always consider:
- CPU usage.
- GPU usage.
- Memory usage.
- WASM performance.
- Rendering overhead.
- Network traffic.
- Simulation complexity.

Requirements:

- Avoid unnecessary per-frame allocations.
- Avoid expensive repeated calculations.
- Use efficient data structures.
- Avoid unnecessary rendering.
- Use batching where appropriate.
- Avoid blocking the main thread.
- Profile before implementing major optimizations.

Do not sacrifice correctness for small performance improvements.

## 9. Code Modification Rules

Before modifying code:

1. Read this `AGENTS.md`.
2. Read the relevant documentation in `Agents/`.
3. Inspect the existing implementation.
4. Understand how the affected system interacts with other systems.
5. Identify potential regressions.

When implementing changes:

- Prefer modifying existing systems over duplicating them.
- Do not rewrite entire systems unnecessarily.
- Preserve existing functionality unless explicitly instructed otherwise.
- Avoid unrelated changes.
- Keep changes focused.
- Follow existing project conventions.
- Do not introduce unnecessary dependencies.
- Do not create unnecessary directories or files.

When adding a new feature:

1. Determine where it belongs.
2. Design its interfaces.
3. Implement it as an independent module where practical.
4. Integrate it with existing systems.
5. Test the new functionality.
6. Test affected existing functionality.
7. Update documentation.

## 10. Testing Requirements

Never assume code works simply because it compiles.

Test relevant functionality after every significant change.

Where applicable, verify:

- Build success.
- TypeScript compilation.
- Rust compilation.
- WASM compilation.
- Runtime functionality.
- Offline functionality.
- Client/server synchronization.
- Existing features.
- Browser console errors.
- Performance regressions.

Fix errors introduced by your changes before considering work complete.

Do not mark functionality as `COMPLETED` until it has been tested and verified.

## 11. Git and Repository Rules

- Work on the existing branch unless instructed otherwise.
- Do not create branches without permission.
- Avoid unnecessary commits.
- Keep commits focused and descriptive.
- Do not commit broken or unfinished changes as completed work.
- Do not overwrite unrelated user changes.
- Preserve existing project history.

Repository: https://github.com/Jack105WA/PixelPhyx

## 12. AI Agent Responsibilities

Every AI agent working on PixelPhyx must:

- Read this file before making changes.
- Read relevant files inside `Agents/`.
- Understand the current project architecture.
- Inspect existing code before replacing it.
- Follow all modularity requirements.
- Use Rust for all WASM code.
- Keep documentation updated.
- Test changes.
- Report what was changed.
- Report any remaining issues.
- Never claim something works without verification.

### Context Preservation

Before finishing a substantial task, update `Agents/CURRENT_CONTEXT.md`.

Record:
- What was changed.
- Why it was changed.
- Which files were modified.
- Current implementation status.
- Remaining problems.
- What should be worked on next.

This ensures another agent can continue development without needing to reconstruct the entire development history.

## 13. Final Development Principles

The following principles take priority throughout PixelPhyx development:

1. **Modularity:** Every system should be independently maintainable.
2. **Isolation:** Changes should not unexpectedly break unrelated systems.
3. **Extensibility:** New functionality should be easy to add.
4. **Maintainability:** Code should be easy to understand and modify.
5. **Performance:** Avoid unnecessary resource consumption.
6. **Reliability:** Existing functionality must remain stable.
7. **Documentation:** Keep project context and architecture accurate.
8. **Consistency:** Follow established project conventions.
9. **Rust WASM:** All WebAssembly must be written in Rust.
10. **Verification:** Test changes before declaring them complete.

When choosing between a quick implementation and a maintainable implementation, prioritize the maintainable implementation without introducing unnecessary complexity.

**PixelPhyx should remain easy to extend, modify, debug, and maintain as the project grows.**
