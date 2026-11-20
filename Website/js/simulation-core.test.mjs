import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSimulationTick } from './simulation-core.js';

test('simulation core preserves the authoritative tick order', () => {
  const calls = [];
  const stage = name => (...args) => { calls.push(name); return name === 'advanceParticlePhysics' ? new Int32Array([1, 2, 3]) : name === 'stepChemistry' ? 2 : undefined; };
  const result = runSimulationTick({
    beginTick: stage('beginTick'), stepLife: stage('stepLife'),
    applyLeafblowerImpulses: stage('applyLeafblowerImpulses'), stepRopes: stage('stepRopes'),
    advanceParticlePhysics: stage('advanceParticlePhysics'), recordParticleMoves: stage('recordParticleMoves'),
    stepCustomMaterials: stage('stepCustomMaterials'), emitMaterialEffects: stage('emitMaterialEffects'),
    stepChemistry: stage('stepChemistry'), onDetonations: stage('onDetonations'),
    stepVisualParticles: stage('stepVisualParticles')
  });
  assert.deepEqual(calls, [
    'beginTick', 'stepLife', 'applyLeafblowerImpulses', 'stepRopes',
    'advanceParticlePhysics', 'recordParticleMoves', 'stepCustomMaterials',
    'emitMaterialEffects', 'stepChemistry', 'onDetonations', 'stepVisualParticles'
  ]);
  assert.equal(result.moveTriples.length, 3);
  assert.equal(result.detonations, 2);
});

test('simulation core skips detonation callback when chemistry returns zero', () => {
  let detonations = 0;
  const noop = () => {};
  const result = runSimulationTick({
    beginTick: noop, stepLife: noop, applyLeafblowerImpulses: noop, stepRopes: noop,
    advanceParticlePhysics: () => new Int32Array(), recordParticleMoves: noop,
    stepCustomMaterials: noop, emitMaterialEffects: noop, stepChemistry: () => 0,
    onDetonations: () => detonations++, stepVisualParticles: noop
  });
  assert.equal(result.detonations, 0);
  assert.equal(detonations, 0);
});
