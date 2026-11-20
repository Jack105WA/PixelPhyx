export const SIMULATION_PROTOCOL_VERSION = 1;
const MAX_WORLD_DIMENSION = 4096;
const WORLD_ARRAY_TYPES = {
  cells: Uint8Array,
  updated: Uint8Array,
  movementBlocks: Uint8Array,
  particleVelocityX: Float32Array,
  particleVelocityY: Float32Array,
  wetness: Float32Array,
  heat: Float32Array,
  heatInputs: Float32Array,
  fuel: Float32Array,
  burn: Float32Array,
  age: Uint16Array,
  corrosion: Float32Array,
  airHeat: Float32Array,
  airNext: Float32Array
};

export function isValidWorldDimensions(width, height) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) &&
    width > 0 && height > 0 && width <= MAX_WORLD_DIMENSION &&
    height <= MAX_WORLD_DIMENSION && width * height <= MAX_WORLD_DIMENSION * MAX_WORLD_DIMENSION;
}

export function isValidSimulationWorld(world, size) {
  if (!world || typeof world !== 'object') return false;
  for (const [key, Type] of Object.entries(WORLD_ARRAY_TYPES)) {
    if (!(world[key] instanceof Type) || world[key].length !== size) return false;
  }
  return true;
}

export function isSimulationWorkerRequest(message) {
  if (!message || typeof message !== 'object' || message.protocolVersion !== SIMULATION_PROTOCOL_VERSION) return false;
  switch (message.type) {
    case 'initialize':
      return isValidWorldDimensions(message.width, message.height) &&
        Number.isFinite(message.gravity) && Number.isFinite(message.ambient) &&
        Number.isSafeInteger(message.simulationTick) && message.simulationTick >= 0 &&
        isValidSimulationWorld(message.world, message.width * message.height) &&
        Array.isArray(message.ropes) && Array.isArray(message.customMaterials);
    case 'tick':
      return Number.isSafeInteger(message.sequence) && message.sequence > 0 &&
        Number.isSafeInteger(message.steps) && message.steps >= 1 && message.steps <= 8;
    case 'command':
      return Number.isSafeInteger(message.sequence) && message.sequence > 0 &&
        !!message.command && typeof message.command === 'object' &&
        typeof message.command.type === 'string' && message.command.type.length > 0;
    case 'resize':
      return Number.isSafeInteger(message.sequence) && message.sequence > 0 &&
        isValidWorldDimensions(message.width, message.height);
    case 'return-buffer':
      return Number.isSafeInteger(message.bufferId) && message.bufferId > 0 &&
        message.buffers && typeof message.buffers === 'object';
    case 'dispose':
      return true;
    default:
      return false;
  }
}

export function isSimulationWorkerResponse(message) {
  if (!message || typeof message !== 'object' || message.protocolVersion !== SIMULATION_PROTOCOL_VERSION) return false;
  switch (message.type) {
    case 'ready':
      return isValidWorldDimensions(message.width, message.height);
    case 'snapshot':
      return Number.isSafeInteger(message.sequence) && message.sequence > 0 &&
        Number.isSafeInteger(message.simulationTick) && message.simulationTick >= 0 &&
        Number.isSafeInteger(message.bufferId) && message.bufferId > 0 &&
        isValidWorldDimensions(message.width, message.height) &&
        isValidSimulationWorld(message.world, message.width * message.height);
    case 'error':
      return typeof message.message === 'string' && message.message.length > 0;
    case 'disposed':
      return true;
    default:
      return false;
  }
}

export function getSimulationTransferables(world) {
  if (!world || typeof world !== 'object') throw new TypeError('A simulation world is required.');
  const buffers = new Set();
  for (const value of Object.values(world)) {
    if (!ArrayBuffer.isView(value) || !(value.buffer instanceof ArrayBuffer)) {
      throw new TypeError('Every simulation world field must be an ArrayBuffer view.');
    }
    buffers.add(value.buffer);
  }
  return [...buffers];
}
