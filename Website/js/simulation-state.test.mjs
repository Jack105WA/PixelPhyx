import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSimulationState } from './simulation-state.js';

test('simulation state allocates aligned typed arrays', () => {
  const state = createSimulationState(160 * 90, 42);
  assert.equal(state.simulationTick, 42);
  for (const key of ['cells', 'updated', 'movementBlocks', 'moveByDestination', 'movingDestinations', 'particleVelocityX', 'particleVelocityY']) {
    assert.equal(state[key].length, 160 * 90, key);
  }
  assert.ok(state.cells instanceof Uint8Array);
  assert.ok(state.particleVelocityX instanceof Float32Array);
  assert.ok(state.particleVelocityY instanceof Float32Array);
  assert.deepEqual(state.airborneParticles, []);
  assert.deepEqual(state.movingParticles, []);
});

test('simulation state clamps invalid sizes and ticks safely', () => {
  const state = createSimulationState(-5, -1);
  assert.equal(state.cells.length, 0);
  assert.equal(state.simulationTick, 0);
  assert.equal(createSimulationState(2.9).cells.length, 2);
});
