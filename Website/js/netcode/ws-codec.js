const DEFAULT_CHUNK_BYTES = 24 * 1024;
const DEFAULT_MAX_TRANSFER_BYTES = 8 * 1024 * 1024;

export function packOperation(operation) {
  if (operation?.type !== 'stroke' || !Array.isArray(operation.points)) return operation;
  const bytes = new Uint8Array(operation.points.length * 4);
  for (let i = 0; i < operation.points.length; i++) {
    const point = operation.points[i];
    const x = Math.max(0, Math.min(65535, Math.round(point.x * 4)));
    const y = Math.max(0, Math.min(65535, Math.round(point.y * 4)));
    const offset = i * 4;
    bytes[offset] = x & 255;
    bytes[offset + 1] = x >>> 8;
    bytes[offset + 2] = y & 255;
    bytes[offset + 3] = y >>> 8;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
  }
  const packed = { ...operation, pointsPacked: btoa(binary), pointScale: 4 };
  delete packed.points;
  return packed;
}

export function unpackOperation(operation) {
  if (operation?.type !== 'stroke' || typeof operation.pointsPacked !== 'string') return operation;
  try {
    const raw = atob(operation.pointsPacked);
    const points = [];
    for (let i = 0; i + 3 < raw.length; i += 4) {
      const x = raw.charCodeAt(i) | (raw.charCodeAt(i + 1) << 8);
      const y = raw.charCodeAt(i + 2) | (raw.charCodeAt(i + 3) << 8);
      points.push({ x: x / 4, y: y / 4 });
    }
    const decoded = { ...operation, points };
    delete decoded.pointsPacked;
    return decoded;
  } catch {
    return null;
  }
}

async function transform(bytes, StreamType) {
  const stream = new Blob([bytes]).stream().pipeThrough(new StreamType('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeTransfer(value, options = {}) {
  const chunkBytes = Math.max(4096, Number(options.chunkBytes) || DEFAULT_CHUNK_BYTES);
  const maxTransferBytes = Math.max(1024 * 1024, Number(options.maxTransferBytes) || DEFAULT_MAX_TRANSFER_BYTES);
  const source = new TextEncoder().encode(JSON.stringify(value));
  let bytes = source;
  let compressed = false;
  if (source.byteLength > 1024 && typeof CompressionStream !== 'undefined') {
    try {
      const zipped = await transform(source, CompressionStream);
      if (zipped.byteLength < source.byteLength) {
        bytes = zipped;
        compressed = true;
      }
    } catch {}
  }
  if (bytes.byteLength > maxTransferBytes) {
    throw new Error('World snapshot exceeds the configured safety limit.');
  }
  const id = crypto.randomUUID();
  const total = Math.ceil(bytes.byteLength / chunkBytes);
  const chunks = [];
  for (let index = 0; index < total; index++) {
    chunks.push({
      id,
      index,
      total,
      compressed,
      bytes: bytes.slice(index * chunkBytes, Math.min(bytes.byteLength, (index + 1) * chunkBytes))
    });
  }
  return chunks;
}

export async function decodeTransfer(parts, compressed, options = {}) {
  const maxTransferBytes = Math.max(1024 * 1024, Number(options.maxTransferBytes) || DEFAULT_MAX_TRANSFER_BYTES);
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  if (!size || size > maxTransferBytes) throw new Error('Invalid snapshot size.');
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  let bytes = joined;
  if (compressed) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decompress server snapshots.');
    bytes = await transform(joined, DecompressionStream);
  }
  if (bytes.byteLength > maxTransferBytes) throw new Error('Decompressed snapshot exceeds the configured safety limit.');
  return JSON.parse(new TextDecoder().decode(bytes));
}
