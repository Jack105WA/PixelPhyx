import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLifeSystem } from './life.js';

test('life subsystem state snapshots are independent transferable copies', () => {
  const life = createLifeSystem();
  const cells = new Uint8Array(25);
  const age = new Uint16Array(25);
  const wetness = new Float32Array(25);
  life.step({ cells, age, wetness, width: 5, height: 5, tick: 1 });

  const snapshot = life.getState();
  assert.ok(snapshot instanceof Uint8Array);
  assert.equal(snapshot.length, cells.length);
  snapshot[0] = 2;
  assert.equal(life.getState()[0], 0);
  life.setState(snapshot);
  snapshot[0] = 3;
  assert.equal(life.getState()[0], 2);
});

test('life subsystem restores seed-burial progress and rejects invalid state', () => {
  const source = createLifeSystem();
  const cells = new Uint8Array(25);
  const age = new Uint16Array(25);
  const wetness = new Float32Array(25);
  cells[2] = 23;
  cells[7] = 28;
  wetness[7] = 0.5;
  source.step({ cells, age, wetness, width: 5, height: 5, tick: 1 });
  const snapshot = source.getState();
  const restored = createLifeSystem();
  restored.setState(snapshot);
  assert.deepEqual(restored.getState(), snapshot);
  assert.throws(() => restored.setState([1, 2, 3]), /Uint8Array/);
});
