function heatSummaryWorker() {
  self.onmessage = event => {
    const { id, airHeat } = event.data;
    let heatSum = 0;
    for (let i = 0; i < airHeat.length; i++) heatSum += airHeat[i];
    self.postMessage({ id, heatSum });
  };
}

function summarizeLocally(airHeat) {
  let heatSum = 0;
  for (let i = 0; i < airHeat.length; i++) heatSum += airHeat[i];
  return { id: 0, heatSum };
}

export function createParallelWorkers() {
  const workerCount = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const workerSource = `(${heatSummaryWorker.toString()})()`;
  let workerUrl = null;
  const workers = [];
  const pending = Array(workerCount).fill(null);
  let nextJobId = 0, disposed = false, workerFailure = null;

  const failWorkers = error => {
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
    worker.onmessage = event => {
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
    async summarize(airHeat) {
      if (disposed) throw new Error('Parallel workers have been disposed.');
      if (airHeat.length < 32768 || workerFailure || workers.length !== workerCount) {
        return summarizeLocally(airHeat);
      }

      const id = ++nextJobId;
      const jobs = workers.map((worker, index) => {
        const start = Math.floor(airHeat.length * index / workerCount);
        const end = Math.floor(airHeat.length * (index + 1) / workerCount);
        const heatChunk = airHeat.slice(start, end);
        return new Promise((resolve, reject) => {
          pending[index] = { id, resolve, reject };
          try { worker.postMessage({ id, airHeat: heatChunk }, [heatChunk.buffer]); }
          catch (cause) { failWorkers(cause instanceof Error ? cause : new Error(String(cause))); }
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
