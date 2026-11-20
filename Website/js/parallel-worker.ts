type HeatSummaryRequest = { id: number; airHeat: Float32Array };
type HeatSummaryResult = { id: number; heatSum: number };

function heatSummaryWorker(): void {
  self.onmessage = (event: MessageEvent<HeatSummaryRequest>) => {
    const { id, airHeat } = event.data;
    let heatSum = 0;
    for (let i = 0; i < airHeat.length; i++) heatSum += airHeat[i];
    self.postMessage({ id, heatSum } satisfies HeatSummaryResult);
  };
}

type PendingSummary = {
  id: number;
  resolve: (result: HeatSummaryResult) => void;
  reject: (error: Error) => void;
};

function summarizeLocally(airHeat: Float32Array): HeatSummaryResult {
  let heatSum = 0;
  for (let i = 0; i < airHeat.length; i++) heatSum += airHeat[i];
  return { id: 0, heatSum };
}

export function createParallelWorkers() {
  const workerCount = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const workerSource = `(${heatSummaryWorker.toString()})()`;
  let workerUrl: string | null = null;
  const workers: Worker[] = [];
  const pending: Array<PendingSummary | null> = Array(workerCount).fill(null);
  let nextJobId = 0, disposed = false, workerFailure: Error | null = null;

  const failWorkers = (error: Error) => {
    if (workerFailure) return;
    workerFailure = error;
    for (let i = 0; i < pending.length; i++) {
      const task = pending[i];
      pending[i] = null;
      task?.reject(error);
    }
    workers.forEach(worker => worker.terminate());
  };

  try {
    workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    for (let i = 0; i < workerCount; i++) workers.push(new Worker(workerUrl));
  } catch (cause) {
    failWorkers(cause instanceof Error ? cause : new Error(String(cause)));
  }

  workers.forEach((worker, index) => {
    worker.onmessage = (event: MessageEvent<HeatSummaryResult>) => {
      const task = pending[index];
      if (!task || event.data.id !== task.id) return;
      pending[index] = null;
      task.resolve(event.data);
    };
    worker.onerror = event => {
      event.preventDefault();
      failWorkers(event.error instanceof Error ? event.error : new Error(event.message || 'Parallel worker failed.'));
    };
    worker.onmessageerror = () => failWorkers(new Error('Parallel worker returned an unreadable message.'));
  });

  return Object.freeze({
    async summarize(airHeat: Float32Array): Promise<HeatSummaryResult> {
      if (disposed) throw new Error('Parallel workers have been disposed.');
      // Tiny worlds are faster to summarize locally than to copy and dispatch.
      if (airHeat.length < 32768 || workerFailure || workers.length !== workerCount) {
        return summarizeLocally(airHeat);
      }

      const id = ++nextJobId;
      const jobs = workers.map((worker, index) => {
        const start = Math.floor(airHeat.length * index / workerCount);
        const end = Math.floor(airHeat.length * (index + 1) / workerCount);
        const heatChunk = airHeat.slice(start, end);
        return new Promise<HeatSummaryResult>((resolve, reject) => {
          pending[index] = { id, resolve, reject };
          try {
            worker.postMessage({ id, airHeat: heatChunk }, [heatChunk.buffer]);
          } catch (cause) {
            failWorkers(cause instanceof Error ? cause : new Error(String(cause)));
          }
        });
      });

      try {
        const parts = await Promise.all(jobs);
        return parts.reduce((sum, part) => ({ id, heatSum: sum.heatSum + part.heatSum }), { id, heatSum: 0 });
      } catch {
        return summarizeLocally(airHeat);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const error = new Error('Parallel workers have been disposed.');
      for (let i = 0; i < pending.length; i++) {
        const task = pending[i];
        pending[i] = null;
        task?.reject(error);
      }
      workers.forEach(worker => worker.terminate());
      if (workerUrl) URL.revokeObjectURL(workerUrl);
    }
  });
}
