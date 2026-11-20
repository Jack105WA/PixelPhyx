import { readFile } from 'node:fs/promises';

const pairs = [
  ['main.ts', 'main.js'],
  ['life.ts', 'life.js'],
  ['physics-engine.ts', 'physics-engine.js'],
  ['material-physics.ts', 'material-physics.js'],
  ['wasm-engine.ts', 'wasm-engine.js'],
  ['simulation-core.ts', 'simulation-core.js'],
  ['simulation-state.ts', 'simulation-state.js'],
  ['simulation-protocol.ts', 'simulation-protocol.js']
];

for (const [sourceName, runtimeName] of pairs) {
  const source = await readFile(new URL(sourceName, import.meta.url), 'utf8');
  const runtime = await readFile(new URL(runtimeName, import.meta.url), 'utf8');
  if (source !== runtime) {
    throw new Error(`Source/runtime mismatch: ${sourceName} and ${runtimeName}. Sync them before building.`);
  }
}

console.log(`Verified ${pairs.length} shared simulation source pairs.`);
