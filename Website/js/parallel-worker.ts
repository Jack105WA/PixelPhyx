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
function summarizeLocally(cells: Uint8Array, airHeat: Float32Array) {
  let particleCount = 0, heatSum = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] !== 0) particleCount++;
  for (let i = 0; i < airHeat.length; i++) heatSum += airHeat[i];
  return { particleCount, heatSum };
}
export function createParallelWorkers() {
  const workerCount = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const workerSource = `(${parallelSummaryWorker.toString()})()`;
  let workerUrl: string | null = null;
  const workers: Worker[] = [];
  const pending: Array<PendingSummary | null> = Array(workerCount).fill(null);
  let nextJobId = 0, disposed = false, workerFailure: Error | null = null;
  const failWorkers = (error: Error) => {
    if (workerFailure) return;
    workerFailure = error;
    for (let i = 0; i < pending.length; i++) { const task = pending[i]; pending[i] = null; task?.reject(error); }
    workers.forEach(worker => worker.terminate());
  };
  try {
    workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    for (let i = 0; i < workerCount; i++) workers.push(new Worker(workerUrl));
  } catch (cause) { failWorkers(cause instanceof Error ? cause : new Error(String(cause))); }
  workers.forEach((worker, index) => {
    worker.onmessage = (event: MessageEvent<WorkerSummaryResult>) => {
      const task = pending[index];
      if (!task || event.data.id !== task.id) return;
      pending[index] = null; task.resolve(event.data);
    };
    worker.onerror = event => {
      event.preventDefault();
      failWorkers(event.error instanceof Error ? event.error : new Error(event.message || 'Parallel worker failed.'));
    };
    worker.onmessageerror = () => failWorkers(new Error('Parallel worker returned an unreadable message.'));
  });
  return Object.freeze({
    async summarize(cells: Uint8Array, airHeat: Float32Array) {
      if (disposed) throw new Error('Parallel workers have been disposed.');
      // Worker startup/message overhead outweighs parallel work at small resolutions.
      if (cells.length < 100_000) return summarizeLocally(cells, airHeat);
      if (workerFailure || workers.length !== workerCount) return summarizeLocally(cells, airHeat);
      const id = ++nextJobId, totalLength = Math.max(cells.length, airHeat.length);
      const jobs = workers.map((worker, index) => {
        if (workerFailure) return Promise.reject(workerFailure);
        const start = Math.floor(totalLength * index / workerCount);
        const end = Math.floor(totalLength * (index + 1) / workerCount);
        const cellChunk = cells.slice(start, Math.min(end, cells.length));
        const heatChunk = airHeat.slice(start, Math.min(end, airHeat.length));
        return new Promise<WorkerSummaryResult>((resolve, reject) => {
          pending[index] = { id, resolve, reject };
          try { worker.postMessage({ id, cells: cellChunk, airHeat: heatChunk }, [cellChunk.buffer, heatChunk.buffer]); }
          catch (cause) { failWorkers(cause instanceof Error ? cause : new Error(String(cause))); }
        });
      });
      try {
        const parts = await Promise.all(jobs);
        return parts.reduce((sum, part) => ({ particleCount: sum.particleCount + part.particleCount, heatSum: sum.heatSum + part.heatSum }), { particleCount: 0, heatSum: 0 });
      } catch { return summarizeLocally(cells, airHeat); }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const error = new Error('Parallel workers have been disposed.');
      for (let i = 0; i < pending.length; i++) { const task = pending[i]; pending[i] = null; task?.reject(error); }
      workers.forEach(worker => worker.terminate());
      if (workerUrl) URL.revokeObjectURL(workerUrl);
    }
  });
}
