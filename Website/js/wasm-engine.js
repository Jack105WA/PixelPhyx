import init, { prepare_velocity, render_cells, render_frame, render_composited_frame, count_particles, step_chemistry, step_particles, step_ropes, step_rigid_bodies } from '../pkg/pixelphyx_wasm.js';

let initialized;
export async function createWasmEngine() {
  initialized ??= init();
  await initialized;
  return Object.freeze({ prepare_velocity, render_cells, render_frame, render_composited_frame, count_particles, step_chemistry, step_particles, step_ropes, step_rigid_bodies });
}
