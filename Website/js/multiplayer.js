import { createRealtimeClient } from 'https://esm.sh/@photonengine/realtime-core@6.0.2';
import { packOperation, unpackOperation, encodeTransfer, decodeTransfer } from './photon-codec.js';

const APP_ID = 'a974c6dd-9d62-4359-bd08-90650e551d09';
const APP_VERSION = 'pixelphyx-1';
const EVENTS = { OP: 1, SNAPSHOT: 2, ROPES: 3, PROPS: 4, JOIN_REQUEST: 5, JOIN_REPLY: 6, SYNC_REQUEST: 7 };

export function createMultiplayer(callbacks = {}) {
  let client = null, playerId = '', roomName = '', pendingApproval = null;
  let roomListOff = null, lastRopesAt = 0, lastPropsSignature = '';
  let snapshotBusy = false, pendingSnapshot = null;
  const approvedPlayers = new Set();
  const transfers = new Map();
  const pendingRequests = new Map();

  const report = (state, label) => callbacks.onStatus?.(state, label);
  const log = message => callbacks.onLog?.(message);
  const room = () => client?.room || null;
  const localNumber = () => client?.localPlayer?.number || 0;
  const isHost = () => !!room()?.isMasterClient;
  const approved = number => number === localNumber() || approvedPlayers.has(number) ||
    !!room()?.getPlayer(number)?.customProperties?.approved;
  const targets = except => (room()?.players || [])
    .filter(player => player.number !== localNumber() && player.number !== except && approved(player.number))
    .map(player => player.number);

  function roster() {
    const people = {};
    for (const player of room()?.players || []) {
      const properties = player.customProperties || {};
      const id = properties.clientId || 'photon-' + player.number;
      people[id] = {
        name: properties.name || player.name || 'Guest',
        color: properties.color || '#65d6ad',
        photonNumber: player.number,
        isHost: !!player.isMasterClient,
        approved: approved(player.number)
      };
    }
    callbacks.onPlayers?.(people);
  }

  function setLocalIdentity(identity, isApproved) {
    client.setPlayerProperties({
      clientId: playerId,
      name: String(identity?.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest',
      color: /^#[0-9a-f]{6}$/i.test(identity?.color || '') ? identity.color : '#65d6ad',
      approved: !!isApproved
    });
    if (isApproved) approvedPlayers.add(localNumber());
    else approvedPlayers.delete(localNumber());
    roster();
  }

  function send(code, data, options = {}) {
    if (!room()) return false;
    try {
      const sent = client.sendEvent(code, data, options);
      if (!sent) log('Photon could not queue event ' + code + '.');
      return sent;
    } catch (error) {
      log('Photon event failed: ' + error.message);
      return false;
    }
  }

  async function sendSnapshot(targetPlayers) {
    if (!isHost() || !targetPlayers.length) return;
    const payload = {
      world: callbacks.getWorld?.(),
      ropes: callbacks.getRopes?.(),
      sentAt: Date.now()
    };
    if (!payload.world) return;
    const chunks = await encodeTransfer(payload);
    for (const chunk of chunks) {
      if (!room() || !isHost()) return;
      if (!send(EVENTS.SNAPSHOT, chunk, { reliable: true, channel: 1, targetPlayers })) {
        throw new Error('Photon rejected a world snapshot chunk.');
      }
    }
  }

  function queueSnapshot(targetPlayers) {
    if (!isHost() || !targetPlayers.length) return;
    pendingSnapshot = targetPlayers;
    if (snapshotBusy) return;
    snapshotBusy = true;
    (async () => {
      try {
        while (pendingSnapshot && isHost()) {
          const recipients = pendingSnapshot;
          pendingSnapshot = null;
          await sendSnapshot(recipients);
        }
      } catch (error) {
        log('World snapshot failed: ' + error.message);
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
      if (snapshot.world) callbacks.onWorld?.(snapshot.world);
      if (snapshot.ropes) callbacks.onRopes?.(snapshot.ropes);
      if (Array.isArray(snapshot.world?.props)) {
        callbacks.onOperation?.({ type: 'props', items: snapshot.world.props, by: snapshot.world.by });
      }
      log('World synchronized from the room host.');
    } catch (error) {
      log('World snapshot could not be decoded: ' + error.message);
    }
  }

  function handleOperation(senderNumber, operation) {
    if (!operation || typeof operation.type !== 'string') return;
    const masterNumber = room()?.masterClientNumber;
    if (isHost() && senderNumber !== masterNumber) {
      if (!approved(senderNumber)) return;
      const decoded = unpackOperation(operation);
      if (!decoded) return;
      callbacks.onOperation?.(decoded);
      const recipients = targets(senderNumber);
      if (recipients.length) send(EVENTS.OP, operation, { reliable: true, channel: 0, targetPlayers: recipients });
      return;
    }
    if (senderNumber === masterNumber) {
      const decoded = unpackOperation(operation);
      if (decoded) callbacks.onOperation?.(decoded);
    }
  }

  function setupEvents() {
    client.onEvent(EVENTS.OP, ({ senderNumber, data }) => handleOperation(senderNumber, data));
    client.onEvent(EVENTS.SNAPSHOT, ({ senderNumber, data }) => receiveSnapshot(senderNumber, data));
    client.onEvent(EVENTS.ROPES, ({ senderNumber, data }) => {
      if (senderNumber === room()?.masterClientNumber && Array.isArray(data?.ropes)) callbacks.onRopes?.(data);
    });
    client.onEvent(EVENTS.PROPS, ({ senderNumber, data }) => {
      if (senderNumber === room()?.masterClientNumber && Array.isArray(data?.items)) {
        callbacks.onOperation?.({ type: 'props', items: data.items, by: data.by });
      }
    });
    client.onEvent(EVENTS.JOIN_REQUEST, ({ senderNumber, data }) => {
      if (!isHost() || !data || senderNumber === localNumber()) return;
      const key = String(senderNumber);
      pendingRequests.set(key, { senderNumber, createdAt: Date.now() });
      callbacks.onJoinRequest?.({
        key, room: roomName, uid: data.clientId || key,
        name: String(data.name || 'Guest').slice(0, 20), playerNumber: senderNumber
      });
    });
    client.onEvent(EVENTS.JOIN_REPLY, async ({ data }) => {
      if (!pendingApproval || typeof data?.approved !== 'boolean') return;
      const pending = pendingApproval;
      pendingApproval = null;
      clearTimeout(pending.timer);
      if (data.approved) {
        setLocalIdentity(pending.identity, true);
        send(EVENTS.SYNC_REQUEST, { clientId: playerId }, { reliable: true, receivers: 'masterClient' });
        pending.resolve(true);
      } else {
        await leaveRoom();
        pending.resolve(false);
      }
    });
    client.onEvent(EVENTS.SYNC_REQUEST, ({ senderNumber }) => {
      if (isHost() && approved(senderNumber)) queueSnapshot([senderNumber]);
    });

    client.on('playerJoined', () => roster());
    client.on('playerLeft', ({ playerNumber }) => {
      approvedPlayers.delete(playerNumber);
      pendingRequests.delete(String(playerNumber));
      roster();
    });
    client.on('playerPropertiesChanged', () => roster());
    client.on('masterClientChanged', () => {
      const active = room();
      if (!active) return;
      approvedPlayers.clear();
      for (const player of active.players) {
        if (player.isMasterClient || player.customProperties?.approved) approvedPlayers.add(player.number);
      }
      roster();
      if (active.isMasterClient) {
        log('Photon elected this player as the new room host.');
        queueSnapshot(targets());
      } else {
        send(EVENTS.SYNC_REQUEST, { clientId: playerId }, { reliable: true, receivers: 'masterClient' });
      }
    });
    client.on('roomListUpdated', () => publishLobbyList());
    client.on('disconnected', ({ cause }) => {
      report('', 'DISCONNECTED');
      log('Photon disconnected' + (cause ? ': ' + cause : '') + '.');
    });
    client.on('error', error => log('Photon error: ' + (error?.message || error?.code || 'Unknown error')));
    client.on('warning', warning => log('Photon warning: ' + warning.message));
  }

  function publishLobbyList() {
    const lobbies = (client?.cachedRoomList || [])
      .filter(entry => entry.customProperties?.game === 'pixelphyx')
      .slice(0, 20)
      .map(entry => ({
        room: entry.name,
        players: entry.playerCount,
        hostName: entry.customProperties?.hostName || 'Unknown',
        transport: 'photon'
      }));
    callbacks.onLobbyList?.(lobbies);
  }

  async function connect() {
    if (client?.isConnected) return playerId;
    report('connecting', 'CONNECTING TO PHOTON');
    client = await createRealtimeClient({ appId: APP_ID, appVersion: APP_VERSION, protocol: 'wss' });
    playerId = crypto.randomUUID();
    setupEvents();
    try {
      await client.connect();
      report('online', 'PHOTON ONLINE');
      log('Connected to Photon Cloud.');
      return playerId;
    } catch (error) {
      client.dispose();
      client = null;
      report('', 'CONNECTION FAILED');
      throw error;
    }
  }

  async function createLobby(identity = {}) {
    if (!client?.isConnected) await connect();
    if (room()) throw new Error('Leave your current server before creating another.');
    const code = 'PX-' + crypto.randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase();
    const safeName = String(identity.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest';
    const created = await client.createRoom(code, {
      maxPlayers: 20, isVisible: true, isOpen: true, emptyRoomTtlMs: 0,
      customProperties: { game: 'pixelphyx', hostName: safeName, protocol: 1 },
      lobbyProperties: ['game', 'hostName']
    });
    roomName = created.name;
    approvedPlayers.clear();
    setLocalIdentity(identity, true);
    report('online', 'ROOM HOST');
    log('Created Photon server ' + roomName + '.');
    const world = callbacks.getWorld?.();
    if (world) publishWorld(world, true);
    const ropes = callbacks.getRopes?.();
    if (ropes) publishRopes(ropes.ropes || []);
    const props = callbacks.getProps?.();
    if (props) publishProps(props);
    return roomName;
  }

  async function joinRoom(code, identity = {}, isApproved = false) {
    if (!client?.isConnected) await connect();
    const nextRoom = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
    if (!nextRoom) throw new Error('Enter a server code.');
    if (room()?.name === nextRoom) {
      if (isApproved && !approved(localNumber())) setLocalIdentity(identity, true);
      return;
    }
    if (room()) await leaveRoom();
    const joined = await client.joinRoom(nextRoom);
    roomName = joined.name;
    approvedPlayers.clear();
    setLocalIdentity(identity, isApproved);
    if (isApproved) send(EVENTS.SYNC_REQUEST, { clientId: playerId }, { reliable: true, receivers: 'masterClient' });
    report('online', 'JOINED ROOM');
    log('Joined Photon server ' + roomName + (isApproved ? '.' : ' — waiting for host approval.'));
  }

  async function requestJoin(code, identity = {}) {
    await joinRoom(code, identity, false);
    if (!room()) throw new Error('Could not enter the server request channel.');
    if (pendingApproval) throw new Error('A join request is already pending.');
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(async () => {
        if (!pendingApproval) return;
        pendingApproval = null;
        await leaveRoom();
        reject(new Error('The host did not respond to the join request.'));
      }, 60000);
      pendingApproval = { resolve, reject, timer, identity };
      const sent = send(EVENTS.JOIN_REQUEST, {
        clientId: playerId,
        name: String(identity.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest'
      }, { reliable: true, receivers: 'masterClient' });
      if (!sent) {
        clearTimeout(timer);
        pendingApproval = null;
        leaveRoom();
        reject(new Error('Could not send the join request to the host.'));
      }
    });
  }

  async function respondToJoinRequest(key, isApproved) {
    if (!isHost()) throw new Error('Only the room host can approve join requests.');
    const request = pendingRequests.get(String(key));
    if (!request) throw new Error('That join request is no longer active.');
    pendingRequests.delete(String(key));
    if (isApproved) approvedPlayers.add(request.senderNumber);
    send(EVENTS.JOIN_REPLY, { approved: !!isApproved }, {
      reliable: true, targetPlayers: [request.senderNumber]
    });
    roster();
    log((isApproved ? 'Approved' : 'Declined') + ' player #' + request.senderNumber + '.');
  }

  function watchLobbies(callback) {
    callbacks.onLobbyList = callback;
    if (room()) {
      publishLobbyList();
      log('Live server browsing pauses while you are inside a room. Leave the server to refresh the lobby.');
    } else if (client && !client.isInLobby) {
      client.joinLobby().then(publishLobbyList).catch(error => log('Could not join Photon lobby: ' + error.message));
    }
    roomListOff?.();
    roomListOff = client?.on('roomListUpdated', publishLobbyList) || null;
    publishLobbyList();
    return () => {
      roomListOff?.();
      roomListOff = null;
      callbacks.onLobbyList = null;
    };
  }

  async function leaveRoom() {
    if (pendingApproval) {
      clearTimeout(pendingApproval.timer);
      pendingApproval = null;
    }
    if (room()) await client.leaveRoom();
    roomName = '';
    approvedPlayers.clear();
    pendingRequests.clear();
    roster();
    if (client?.isConnected && !client.isInLobby) {
      try { await client.joinLobby(); } catch (error) { log('Lobby reconnect failed: ' + error.message); }
    }
    report('online', 'PHOTON ONLINE');
    log('Left the Photon server.');
  }

  function publishOperation(operation) {
    if (!room() || !operation) return;
    const payload = packOperation({ ...operation, by: playerId, createdAt: Date.now() });
    if (isHost()) {
      const recipients = targets();
      if (recipients.length) send(EVENTS.OP, payload, { reliable: true, channel: 0, targetPlayers: recipients });
    } else {
      send(EVENTS.OP, payload, { reliable: true, channel: 0, receivers: 'masterClient' });
    }
  }

  function publishWorld(world) {
    if (!isHost() || !world) return;
    callbacks.getWorld = () => world;
    queueSnapshot(targets());
  }

  function publishRopes(ropes) {
    if (!isHost() || !Array.isArray(ropes)) return;
    const now = performance.now();
    if (now - lastRopesAt < 90) return;
    lastRopesAt = now;
    const recipients = targets();
    if (recipients.length) send(EVENTS.ROPES, { by: playerId, updatedAt: Date.now(), ropes },
      { reliable: false, channel: 2, targetPlayers: recipients });
  }

  function publishProps(items) {
    if (!isHost() || !Array.isArray(items)) return;
    const signature = JSON.stringify(items);
    if (signature === lastPropsSignature) return;
    lastPropsSignature = signature;
    const recipients = targets();
    if (recipients.length) send(EVENTS.PROPS, { by: playerId, updatedAt: Date.now(), items },
      { reliable: true, channel: 3, targetPlayers: recipients });
  }

  function getUsageStatus() {
    return Promise.resolve({
      daily: { percent: 0, limitBytes: 0, estimatedBytes: 0, blocked: false },
      monthly: { percent: 0, limitBytes: 0, estimatedBytes: 0, blocked: false },
      blocked: false, limit: 90, source: 'Photon Cloud'
    });
  }

  function updateIdentity(name, color) {
    if (room()) setLocalIdentity({ name, color }, approved(localNumber()));
  }

  function publishLeafblower() {}
  function updateCursor() {}

  return {
    connect, createLobby, joinRoom, requestJoin, respondToJoinRequest, watchLobbies,
    leaveRoom, getUsageStatus, publishOperation, publishWorld, publishRopes,
    publishProps, publishLeafblower, updateCursor, updateIdentity,
    get lanMode() { return false; },
    get joined() { return !!room(); },
    get isHost() { return isHost(); },
    get playerId() { return playerId; },
    get room() { return roomName; }
  };
}
