import { packOperation, unpackOperation, encodeTransfer, decodeTransfer } from './photon-codec.js';

export const EVENTS = {
  OP: 1, SNAPSHOT: 2, ROPES: 3, PROPS: 4,
  JOIN_REQUEST: 5, JOIN_REPLY: 6, SYNC_REQUEST: 7
};

export function createPhotonSync(state) {
  const transfers = new Map();
  let lastRopesAt = 0, lastPropsSignature = '';
  let snapshotBusy = false, pendingSnapshot = null;

  const room = () => state.client?.room || null;
  const send = (code, data, options = {}) => {
    if (!room()) return false;
    try {
      const sent = state.client.sendEvent(code, data, options);
      if (!sent) state.log('Photon could not queue event ' + code + '.');
      return sent;
    } catch (error) {
      state.log('Photon event failed: ' + error.message);
      return false;
    }
  };

  async function sendSnapshot(targetPlayers) {
    if (!state.isHost() || !targetPlayers.length) return;
    const payload = {
      world: state.callbacks.getWorld?.(),
      ropes: state.callbacks.getRopes?.(),
      sentAt: Date.now()
    };
    if (!payload.world) return;
    const chunks = await encodeTransfer(payload);
    for (const chunk of chunks) {
      if (!room() || !state.isHost()) return;
      if (!send(EVENTS.SNAPSHOT, chunk, { reliable: true, channel: 1, targetPlayers })) {
        throw new Error('Photon rejected a world snapshot chunk.');
      }
    }
  }

  function queueSnapshot(targetPlayers) {
    if (!state.isHost() || !targetPlayers.length) return;
    pendingSnapshot = targetPlayers;
    if (snapshotBusy) return;
    snapshotBusy = true;
    (async () => {
      try {
        while (pendingSnapshot && state.isHost()) {
          const recipients = pendingSnapshot;
          pendingSnapshot = null;
          await sendSnapshot(recipients);
        }
      } catch (error) {
        state.log('World snapshot failed: ' + error.message);
      } finally {
        snapshotBusy = false;
      }
    })();
  }

  async function receiveSnapshot(senderNumber, chunk) {
    if (senderNumber !== room()?.masterClientNumber || !chunk ||
        typeof chunk.id !== 'string' || !Number.isInteger(chunk.index) ||
        !Number.isInteger(chunk.total) || chunk.total < 1 || chunk.total > 180 ||
        !(chunk.bytes instanceof Uint8Array)) return;
    let transfer = transfers.get(chunk.id);
    if (!transfer) {
      if (transfers.size >= 3) {
        const oldest = transfers.keys().next().value;
        clearTimeout(transfers.get(oldest)?.timer);
        transfers.delete(oldest);
      }
      transfer = {
        parts: new Array(chunk.total), received: 0,
        compressed: !!chunk.compressed,
        timer: setTimeout(() => transfers.delete(chunk.id), 20000)
      };
      transfers.set(chunk.id, transfer);
    }
    if (transfer.parts.length !== chunk.total || transfer.parts[chunk.index]) return;
    transfer.parts[chunk.index] = chunk.bytes;
    transfer.received++;
    if (transfer.received !== transfer.parts.length) return;
    transfers.delete(chunk.id);
    clearTimeout(transfer.timer);
    try {
      const snapshot = await decodeTransfer(transfer.parts, transfer.compressed);
      if (snapshot.world) state.callbacks.onWorld?.(snapshot.world);
      if (snapshot.ropes) state.callbacks.onRopes?.(snapshot.ropes);
      state.log('World synchronized from the room host.');
    } catch (error) {
      state.log('World snapshot could not be decoded: ' + error.message);
    }
  }

  function handleOperation(senderNumber, operation) {
    if (!operation || typeof operation.type !== 'string') return;
    const masterNumber = room()?.masterClientNumber;
    if (state.isHost() && senderNumber !== masterNumber) {
      if (!state.isApproved(senderNumber)) return;
      const decoded = unpackOperation(operation);
      if (!decoded) return;
      state.callbacks.onOperation?.(decoded);
      const recipients = state.targets(senderNumber);
      if (recipients.length) send(EVENTS.OP, operation, {
        reliable: true, channel: 0, targetPlayers: recipients
      });
      return;
    }
    if (senderNumber === masterNumber) {
      const decoded = unpackOperation(operation);
      if (decoded) state.callbacks.onOperation?.(decoded);
    }
  }

  function setup() {
    state.client.onEvent(EVENTS.OP, ({ senderNumber, data }) => handleOperation(senderNumber, data));
    state.client.onEvent(EVENTS.SNAPSHOT, ({ senderNumber, data }) => receiveSnapshot(senderNumber, data));
    state.client.onEvent(EVENTS.ROPES, ({ senderNumber, data }) => {
      if (senderNumber === room()?.masterClientNumber && Array.isArray(data?.ropes)) {
        state.callbacks.onRopes?.(data);
      }
    });
    state.client.onEvent(EVENTS.PROPS, ({ senderNumber, data }) => {
      if (senderNumber === room()?.masterClientNumber && Array.isArray(data?.items)) {
        state.callbacks.onOperation?.({ type: 'props', items: data.items, by: data.by });
      }
    });
  }

  function requestSnapshot() {
    send(EVENTS.SYNC_REQUEST, { clientId: state.playerId }, {
      reliable: true, receivers: 'masterClient'
    });
  }

  function publishOperation(operation) {
    if (!room() || !operation) return;
    const payload = packOperation({ ...operation, by: state.playerId, createdAt: Date.now() });
    if (state.isHost()) {
      const recipients = state.targets();
      if (recipients.length) send(EVENTS.OP, payload, {
        reliable: true, channel: 0, targetPlayers: recipients
      });
    } else {
      send(EVENTS.OP, payload, { reliable: true, channel: 0, receivers: 'masterClient' });
    }
  }

  function publishWorld(world) {
    if (!state.isHost() || !world) return;
    state.callbacks.getWorld = () => world;
    queueSnapshot(state.targets());
  }

  function publishRopes(ropes) {
    if (!state.isHost() || !Array.isArray(ropes)) return;
    const now = performance.now();
    if (now - lastRopesAt < 90) return;
    lastRopesAt = now;
    const recipients = state.targets();
    if (recipients.length) send(EVENTS.ROPES, {
      by: state.playerId, updatedAt: Date.now(), ropes
    }, { reliable: false, channel: 2, targetPlayers: recipients });
  }

  function publishProps(items) {
    if (!state.isHost() || !Array.isArray(items)) return;
    const signature = JSON.stringify(items);
    if (signature === lastPropsSignature) return;
    lastPropsSignature = signature;
    const recipients = state.targets();
    if (recipients.length) send(EVENTS.PROPS, {
      by: state.playerId, updatedAt: Date.now(), items
    }, { reliable: true, channel: 3, targetPlayers: recipients });
  }

  function dispose() {
    for (const transfer of transfers.values()) clearTimeout(transfer.timer);
    transfers.clear();
    pendingSnapshot = null;
  }

  return { setup, requestSnapshot, queueSnapshot, publishOperation, publishWorld, publishRopes, publishProps, dispose };
}
