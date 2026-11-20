import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('./parallel-worker.js', import.meta.url), 'utf8');
const { createParallelWorkers } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);

function installWorker(config = {}, hardwareConcurrency = 5) {
  const originalWorker = globalThis.Worker;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let created = 0, posted = 0;

  class MockWorker {
    constructor() {
      created++;
      if (config.constructError) throw new Error('Worker construction failed');
      this.terminated = false;
      this.onmessage = null;
      this.onerror = null;
      this.onmessageerror = null;
    }

    postMessage(message) {
      posted++;
      if (config.postError) throw new Error('Worker postMessage failed');
      const { id, cells, airHeat } = message;
      let particleCount = 0, heatSum = 0;
      for (let i = 0; i < cells.length; i++) if (cells[i] !== 0) particleCount++;
      for (let i = 0; i < airHeat.length; i++) heatSum += airHeat[i];
      queueMicrotask(() => {
        if (!this.terminated) this.onmessage?.({ data: { id, particleCount, heatSum } });
      });
    }

    terminate() { this.terminated = true; }
  }

  globalThis.Worker = MockWorker;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { hardwareConcurrency }
  });

  return {
    counts: () => ({ created, posted }),
    restore() {
      if (originalWorker === undefined) delete globalThis.Worker;
      else globalThis.Worker = originalWorker;
      if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
      else delete globalThis.navigator;
    }
  };
}

test('parallel worker summary and recovery behavior', async t => {
  await t.test('uses local aggregation for small worlds', async () => {
    const env = installWorker();
    try {
      const workers = createParallelWorkers();
      const cells = new Uint8Array(320 * 180);
      const heat = new Float32Array(cells.length);
      cells[0] = 1;
      cells[17] = 2;
      heat.fill(2.5);
      const result = await workers.summarize(cells, heat);
      assert.deepEqual(result, { particleCount: 2, heatSum: 320 * 180 * 2.5 });
      assert.equal(env.counts().posted, 0);
      workers.dispose();
    } finally { env.restore(); }
  });

  await t.test('aggregates all worker chunks for large worlds', async () => {
    const env = installWorker();
    try {
      const workers = createParallelWorkers();
      const cells = new Uint8Array(640 * 360);
      const heat = new Float32Array(cells.length);
      for (let i = 0; i < cells.length; i++) {
        if (i % 3 === 0) cells[i] = 1;
        heat[i] = i % 7;
      }
      const expectedCount = Math.ceil(cells.length / 3);
      const expectedHeat = heat.reduce((sum, value) => sum + value, 0);
      assert.deepEqual(await workers.summarize(cells, heat), {
        particleCount: expectedCount,
        heatSum: expectedHeat
      });
      assert.equal(env.counts().posted, 4);
      workers.dispose();
    } finally { env.restore(); }
  });

  await t.test('falls back locally when worker construction fails', async () => {
    const env = installWorker({ constructError: true });
    try {
      const workers = createParallelWorkers();
      const cells = new Uint8Array(640 * 360);
      const heat = new Float32Array(cells.length);
      cells[5] = 1;
      heat[9] = 4;
      assert.deepEqual(await workers.summarize(cells, heat), {
        particleCount: 1,
        heatSum: 4
      });
      workers.dispose();
    } finally { env.restore(); }
  });

  await t.test('falls back locally when posting to a worker fails', async () => {
    const env = installWorker({ postError: true });
    try {
      const workers = createParallelWorkers();
      const cells = new Uint8Array(640 * 360);
      const heat = new Float32Array(cells.length);
      cells[5] = 1;
      cells[15] = 2;
      heat[9] = 4;
      assert.deepEqual(await workers.summarize(cells, heat), {
        particleCount: 2,
        heatSum: 4
      });
      workers.dispose();
    } finally { env.restore(); }
  });

  await t.test('rejects work after disposal', async () => {
    const env = installWorker();
    try {
      const workers = createParallelWorkers();
      workers.dispose();
      await assert.rejects(
        workers.summarize(new Uint8Array(1), new Float32Array(1)),
        /disposed/
      );
    } finally { env.restore(); }
  });
});
