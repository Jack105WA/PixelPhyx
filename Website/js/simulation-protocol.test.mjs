import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSimulationState } from './simulation-state.js';
import { isSimulationWorkerRequest, isSimulationWorkerResponse, getSimulationTransferables, SIMULATION_PROTOCOL_VERSION } from './simulation-protocol.js';

function worldOf(size) {
  const state = createSimulationState(size);
  return {
    cells: state.cells, updated: state.updated, movementBlocks: state.movementBlocks,
    particleVelocityX: state.particleVelocityX, particleVelocityY: state.particleVelocityY,
    wetness: new Float32Array(size), heat: new Float32Array(size), heatInputs: new Float32Array(size),
    fuel: new Float32Array(size), burn: new Float32Array(size), age: new Uint16Array(size),
    corrosion: new Float32Array(size), airHeat: new Float32Array(size), airNext: new Float32Array(size)
  };
}

test('simulation protocol validates initialization dimensions and all state arrays', () => {
  const world = worldOf(160 * 90);
  const message = { type: 'initialize', protocolVersion: SIMULATION_PROTOCOL_VERSION, width: 160, height: 90, gravity: 1, ambient: 20, simulationTick: 0, world, ropes: [], customMaterials: [] };
  assert.equal(isSimulationWorkerRequest(message), true);
  assert.equal(isSimulationWorkerRequest({ ...message, width: 161 }), false);
  assert.equal(isSimulationWorkerRequest({ ...message, world: { ...world, age: new Float32Array(world.cells.length) } }), false);
});

test('simulation protocol validates ordered commands and bounded tick batches', () => {
  const base = { protocolVersion: SIMULATION_PROTOCOL_VERSION, sequence: 1 };
  assert.equal(isSimulationWorkerRequest({ ...base, type: 'tick', steps: 8 }), true);
  assert.equal(isSimulationWorkerRequest({ ...base, type: 'tick', steps: 9 }), false);
  assert.equal(isSimulationWorkerRequest({ ...base, type: 'command', command: { type: 'paint', payload: {} } }), true);
  assert.equal(isSimulationWorkerRequest({ ...base, type: 'command', command: {} }), false);
  assert.equal(isSimulationWorkerRequest({ ...base, type: 'resize', width: 640, height: 360 }), true);
});

test('simulation protocol validates snapshots and rejects unsupported versions', () => {
  const world = worldOf(12);
  const snapshot = { type: 'snapshot', protocolVersion: SIMULATION_PROTOCOL_VERSION, sequence: 2, simulationTick: 14, bufferId: 1, width: 4, height: 3, world };
  assert.equal(isSimulationWorkerResponse(snapshot), true);
  assert.equal(isSimulationWorkerResponse({ ...snapshot, protocolVersion: 99 }), false);
  assert.equal(isSimulationWorkerResponse({ type: 'error', protocolVersion: SIMULATION_PROTOCOL_VERSION, message: 'bad state' }), true);
});

test('simulation transfer list contains each unique backing buffer once', () => {
  const world = worldOf(4);
  world.alias = world.cells.subarray(0, 2);
  const transferables = getSimulationTransferables(world);
  assert.equal(transferables.length, Object.keys(world).length - 1);
  assert.ok(transferables.includes(world.cells.buffer));
  assert.throws(() => getSimulationTransferables({ cells: [1, 2] }), /ArrayBuffer view/);
});
