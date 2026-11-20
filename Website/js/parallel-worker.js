function parallelSummaryWorker() {
  self.onmessage = event => {
    const { id, cells, airHeat } = event.data;
    let particleCount = 0;
    let heatSum = 0;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== 0) particleCount++;
    }
    for (let i = 0; i < airHeat.length; i++) heatSum += airHeat[i];
    self.postMessage({ id, particleCount, heatSum });
  };
}

export function createParallelWorkers() {
  const workerCount = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const workerSource = `(${parallelSummaryWorker.toString()})()`;
  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  const workers = Array.from({ length: workerCount }, () => new Worker(workerUrl));
  const pending = Array(workerCount).fill(null);
  let nextJobId = 0;
  let disposed = false;
  let workerFailure = null;

  workers.forEach((worker, index) => {
    worker.onmessage = event => {
      const task = pending[index];
      if (!task || event.data.id !== task.id) return;
      pending[index] = null;
      task.resolve(event.data);
    };
    worker.onerror = event => {
      const task = pending[index];
      const error = event.error instanceof Error ? event.error : new Error(event.message);
      workerFailure = error;
      if (task) {
        pending[index] = null;
        task.reject(error);
      }
    };
  });

  return Object.freeze({
    async summarize(cells, airHeat) {
      if (disposed) throw new Error('Parallel workers have been disposed.');
      if (workerFailure) throw workerFailure;
      const id = ++nextJobId;
      const totalLength = Math.max(cells.length, airHeat.length);
      const jobs = workers.map((worker, index) => {
        const start = Math.floor(totalLength * index / workerCount);
        const end = Math.floor(totalLength * (index + 1) / workerCount);
        const cellChunk = cells.slice(start, Math.min(end, cells.length));
        const heatChunk = airHeat.slice(start, Math.min(end, airHeat.length));
        return new Promise((resolve, reject) => {
          pending[index] = { id, resolve, reject };
          worker.postMessage(
            { id, cells: cellChunk, airHeat: heatChunk },
            [cellChunk.buffer, heatChunk.buffer]
          );
        });
      });
      const parts = await Promise.all(jobs);
      return parts.reduce(
        (summary, part) => ({
          particleCount: summary.particleCount + part.particleCount,
          heatSum: summary.heatSum + part.heatSum
        }),
        { particleCount: 0, heatSum: 0 }
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const task of pending) task?.reject(new Error('Parallel workers have been disposed.'));
      workers.forEach(worker => worker.terminate());
      URL.revokeObjectURL(workerUrl);
    }
  });
}
