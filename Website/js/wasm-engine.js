import init, { prepare_velocity, render_cells, count_particles } from '../pkg/pixelphyx_wasm.js';

let initialized;
export async function createWasmEngine() {
  initialized ??= init();
  await initialized;
  return Object.freeze({ prepare_velocity, render_cells, count_particles });
}
