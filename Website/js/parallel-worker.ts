type WorkerSummaryRequest = { id: number; cells: Uint8Array; airHeat: Float32Array };
type WorkerSummaryResult = { id: number; particleCount: number; heatSum: number };

function parallelSummaryWorker(): void {
  self.onmessage = (event: MessageEvent<WorkerSummaryRequest>) => {
    const { id, cells, airHeat } = event.data;
    let particleCount = 0, heatSum = 0;
    for (let i = 0; i < cells.length; i++) if (cells[i] !== 0) particleCount++;
    for (let i = 0; i < airHeat.length; i++) heatSum += airHeat[i];
    self.postMessage({ id, particleCount, heatSum } satisfies WorkerSummaryResult);
  };
}

type PendingSummary = { id: number; resolve: (result: WorkerSummaryResult) => void; reject: (error: Error) => void };

export function createParallelWorkers() {
  const workerCount = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const workerSource = `(${parallelSummaryWorker.toString()})()`;
  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  const workers = Array.from({ length: workerCount }, () => new Worker(workerUrl));
  const pending: Array<PendingSummary | null> = Array(workerCount).fill(null);
  let nextJobId = 0, disposed = false, workerFailure: Error | null = null;

  workers.forEach((worker, index) => {
    worker.onmessage = (event: MessageEvent<WorkerSummaryResult>) => {
      const task = pending[index];
      if (!task || event.data.id !== task.id) return;
      pending[index] = null;
      task.resolve(event.data);
    };
    worker.onerror = event => {
      const error = event.error instanceof Error ? event.error : new Error(event.message);
      workerFailure = error;
      const task = pending[index];
      if (task) { pending[index] = null; task.reject(error); }
    };
  });

  return Object.freeze({
    async summarize(cells: Uint8Array, airHeat: Float32Array) {
      if (disposed) throw new Error('Parallel workers have been disposed.');
      if (workerFailure) throw workerFailure;
      const id = ++nextJobId, totalLength = Math.max(cells.length, airHeat.length);
      const jobs = workers.map((worker, index) => {
        const start = Math.floor(totalLength * index / workerCount);
        const end = Math.floor(totalLength * (index + 1) / workerCount);
        const cellChunk = cells.slice(start, Math.min(end, cells.length));
        const heatChunk = airHeat.slice(start, Math.min(end, airHeat.length));
        return new Promise<WorkerSummaryResult>((resolve, reject) => {
          pending[index] = { id, resolve, reject };
          worker.postMessage({ id, cells: cellChunk, airHeat: heatChunk }, [cellChunk.buffer, heatChunk.buffer]);
        });
      });
      const parts = await Promise.all(jobs);
      return parts.reduce((sum, part) => ({
        particleCount: sum.particleCount + part.particleCount,
        heatSum: sum.heatSum + part.heatSum
      }), { particleCount: 0, heatSum: 0 });
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
