// Mutable simulation buffers are created here so browser and worker runtimes
// can initialize the same state layout without touching DOM or browser globals.
export function createSimulationState(size, initialTick = 0) {
  const length = Math.max(0, Math.floor(Number(size) || 0));
  return {
    simulationTick: Number.isSafeInteger(initialTick) && initialTick >= 0 ? initialTick : 0,
    cells: new Uint8Array(length),
    updated: new Uint8Array(length),
    movementBlocks: new Uint8Array(length),
    airborneParticles: [],
    movingParticles: [],
    moveByDestination: new Int32Array(length),
    movingDestinations: new Uint8Array(length),
    particleVelocityX: new Float32Array(length),
    particleVelocityY: new Float32Array(length)
  };
}
