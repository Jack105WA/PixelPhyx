const cacheVersion = new URL(import.meta.url).searchParams.get('v') || 'dev';
const [{ createServerSync }, { createServerRooms }] = await Promise.all([
  import('./ws-sync.js?v=' + encodeURIComponent(cacheVersion)),
  import('./ws-rooms.js?v=' + encodeURIComponent(cacheVersion))
]);

function serverAddress() {
  const saved = localStorage.getItem('pixelphyx-server-address') || '';
  if (saved) return saved.replace(/\/$/, '') + '/pixelphyx';
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return scheme + '//' + location.hostname + ':3000/pixelphyx';
}
function revive(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(revive);
  if (value.bytes && typeof value.bytes === 'object' && !ArrayBuffer.isView(value.bytes)) {
    const keys = Object.keys(value.bytes);
    if (keys.length && keys.every((key, i) => String(i) === key)) value.bytes = Uint8Array.from(keys.map(key => value.bytes[key]));
  }
  for (const key of Object.keys(value)) value[key] = revive(value[key]);
  return value;
}
function createClient() {
  const listeners = new Map(), eventListeners = new Map(), waiters = [];
  let socket = null, connectPromise = null;
  const client = {
    isConnected: false, isInLobby: false, room: null, localPlayer: null, cachedRoomList: [],
    on(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
      return () => listeners.get(name)?.delete(callback);
    },
    emit(name, data = {}) { for (const fn of listeners.get(name) || []) { try { fn(data); } catch (error) { console.error(error); } } },
    onEvent(code, callback) {
      if (!eventListeners.has(code)) eventListeners.set(code, new Set());
      eventListeners.get(code).add(callback);
      return () => eventListeners.get(code)?.delete(callback);
    },
    emitEvent(message) {
      const data = revive(message.data);
      for (const fn of eventListeners.get(Number(message.code)) || []) fn({ senderNumber: message.senderNumber, data });
    },
    send(type, data = {}) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify({ type, ...data }));
      return true;
    },
    resolveWait(type, value) {
      const index = waiters.findIndex(item => item.type === type);
      if (index >= 0) { const item = waiters.splice(index, 1)[0]; clearTimeout(item.timer); item.resolve(value); }
    },
    waitFor(type, action) {
      return new Promise((resolve, reject) => {
        const item = { type, resolve, reject, timer: setTimeout(() => {
          const i = waiters.indexOf(item); if (i >= 0) waiters.splice(i, 1);
          reject(new Error('Server did not respond in time.'));
        }, 10000) };
        waiters.push(item);
        if (!action()) { clearTimeout(item.timer); waiters.splice(waiters.indexOf(item), 1); reject(new Error('Not connected to the local server.')); }
      });
    },
    async connect() {
      if (client.isConnected) return client.localPlayer?.customProperties?.clientId || '';
      if (connectPromise) return connectPromise;
      connectPromise = new Promise((resolve, reject) => {
        let settled = false;
        const saved = localStorage.getItem('pixelphyx-server-address') || '';
        const url = saved ? saved.replace(/\/$/, '') + '/pixelphyx' :
          (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/pixelphyx';
        try { socket = new WebSocket(url); } catch (error) { reject(error); return; }
        const timeout = setTimeout(() => { if (!settled) { settled = true; socket.close(); reject(new Error('Connection timed out. Check the server address and port.')); } }, 10000);
        socket.addEventListener('open', () => { client.isConnected = true; });
        socket.addEventListener('message', event => {
          let message; try { message = JSON.parse(event.data); } catch { return; }
          if (message.type === 'welcome') {
            client.serverInfo = message;
            client.localPlayer = { number: 0, name: 'Lab guest', customProperties: { clientId: message.id, color: '#65d6ad' } };
            if (!settled) { settled = true; clearTimeout(timeout); resolve(message.id); }
            client.send('identity', { name: 'Lab guest', color: '#65d6ad' }); client.send('list'); return;
          }
          if (message.type === 'error') { client.emit('error', new Error(message.message)); return; }
          if (message.type === 'lobbies') {
            client.cachedRoomList = (message.lobbies || []).map(item => ({
              name: String(item.room || ''),
              playerCount: Number(item.players) || 0,
              maxPlayers: Number(item.maxPlayers) || 0,
              hostName: item.hostName || 'Unknown',
              customProperties: { game: 'pixelphyx', hostName: item.hostName || 'Unknown' }
            })).filter(item => item.name);
            client.emit('roomListUpdated');
          } else if (message.type === 'room-joined') {
            const players = (message.players || []).map(p => ({ number: p.number, name: p.name, isMasterClient: !!p.isHost,
              customProperties: { clientId: p.clientId, name: p.name, color: p.color, approved: p.approved } }));
            const host = players.find(p => p.isMasterClient);
            client.isInLobby = false;
            client.room = { name: message.room, isMasterClient: !!message.isHost, isRoomOwner: !!message.isRoomOwner, masterClientNumber: host?.number || message.number,
              players, getPlayer(number) { return this.players.find(p => p.number === number) || null; } };
            client.localPlayer = client.room.getPlayer(message.number);
            client.emit('playerJoined'); client.resolveWait('room-joined', message); return;
          } else if (message.type === 'room-left') {
            client.room = null; client.isInLobby = false; client.emit('roomLeft'); client.resolveWait('room-left', message); return;
          } else if (message.type === 'roster') {
            if (client.room) {
              client.room.players = Object.entries(message.players || {}).map(([id, p]) => ({ number: p.serverNumber, name: p.name, isMasterClient: !!p.isHost,
                customProperties: { clientId: id, name: p.name, color: p.color, approved: p.approved } }));
              const previousHost = client.room.masterClientNumber;
              client.room.masterClientNumber = client.room.players.find(p => p.isMasterClient)?.number || client.room.masterClientNumber;
              client.localPlayer = client.room.getPlayer(client.localPlayer?.number) || client.localPlayer;
              client.room.isMasterClient = !!client.localPlayer?.isMasterClient;
              client.emit('playerPropertiesChanged');
              if (previousHost !== client.room.masterClientNumber) client.emit('masterClientChanged');
            }
          } else if (message.type === 'player-joined') client.emit('playerJoined', message);
          else if (message.type === 'player-left') client.emit('playerLeft', { playerNumber: message.playerNumber });
          else if (message.type === 'approval-owner-changed') {
            if (client.room) client.room.isRoomOwner = client.localPlayer?.customProperties.clientId === message.approvalHostId;
          } else if (message.type === 'host-changed') {
            if (client.room) {
              const old = client.room.masterClientNumber;
              client.room.masterClientNumber = client.room.players.find(p => p.customProperties.clientId === message.hostId)?.number || old;
              client.room.isMasterClient = client.localPlayer?.customProperties.clientId === message.hostId;
              client.emit('masterClientChanged');
            }
          } else if (message.type === 'join-request') client.emitEvent({ code: 5, senderNumber: message.senderNumber, data: message.data });
          else if (message.type === 'join-reply') client.emitEvent({ code: 6, senderNumber: 0, data: { approved: message.approved } });
          else if (message.type === 'event') client.emitEvent(message);
          else if (message.type === 'server-shutdown') client.emit('disconnected', { cause: 'disconnectByServer' });
        });
        socket.addEventListener('close', () => {
          const wasConnected = client.isConnected; client.isConnected = false; client.room = null;
          if (wasConnected) client.emit('disconnected', { cause: 'disconnectByServer' });
          if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('Could not connect to ' + url)); }
        });
        socket.addEventListener('error', () => { if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('Could not connect. Check the server address, firewall, and port forwarding.')); } });
      }).finally(() => { connectPromise = null; });
      return connectPromise;
    },
    async disconnect() { if (socket) socket.close(); client.isConnected = false; client.room = null; },
    dispose() { if (socket) socket.close(); socket = null; client.isConnected = false; client.room = null; },
    async reconnect() { client.dispose(); await client.connect(); },
    async joinLobby() {
      if (client.room) return;
      client.isInLobby = true;
      client.send('list');
    },
    setPlayerProperties(properties) {
      if (client.localPlayer) Object.assign(client.localPlayer.customProperties, properties);
      client.send('identity', { name: properties.name, color: properties.color }); client.emit('playerPropertiesChanged');
    },
    sendEvent(code, data, options = {}) { return client.send('event', { code, data, reliable: options.reliable, receivers: options.receivers, targetPlayers: options.targetPlayers }); },
    async connectSimulation(roomName, token) {
      const result = await client.waitFor('room-joined', () => client.send('simulation-join', { room: roomName, token }));
      return result.room;
    },
    async createRoom() {
      const result = await client.waitFor('room-joined', () => client.send('create-room', { name: client.localPlayer?.name || 'Lab guest', color: client.localPlayer?.customProperties?.color || '#65d6ad' }));
      return { name: result.room };
    },
    async joinRoom(name) {
      await client.waitFor('room-joined', () => client.send('join-room', { room: name, name: client.localPlayer?.name || 'Lab guest', color: client.localPlayer?.customProperties?.color || '#65d6ad' }));
      return { name };
    },
    async leaveRoom() { await client.waitFor('room-left', () => client.send('leave-room')); },
    approve(playerNumber, approved) { return client.send('approve', { playerNumber, approved }); }
  };
  return client;
}

export function createMultiplayer(callbacks = {}) {
  const state = {
    client: null, playerId: '', roomName: '', callbacks, approvedPlayers: new Set(),
    report: (status, label) => callbacks.onStatus?.(status, label),
    log: message => callbacks.onLog?.(message)
  };
  state.isHost = () => !!state.client?.room?.isMasterClient;
  state.isRoomOwner = () => !!state.client?.room?.isRoomOwner;
  state.isApproved = number => number === state.client?.localPlayer?.number || state.approvedPlayers.has(number) || !!state.client?.room?.getPlayer(number)?.customProperties?.approved;
  state.targets = except => (state.client?.room?.players || []).filter(p => p.number !== state.client.localPlayer.number && p.number !== except && state.isApproved(p.number)).map(p => p.number);
  state.roster = () => {
    const people = {};
    for (const player of state.client?.room?.players || []) {
      const properties = player.customProperties || {}, id = properties.clientId || 'local-' + player.number;
      people[id] = { name: properties.name || player.name || 'Guest', color: properties.color || '#65d6ad', serverNumber: player.number, isHost: !!player.isMasterClient, approved: state.isApproved(player.number) };
    }
    callbacks.onPlayers?.(people);
  };
  state.setLocalIdentity = (identity, isApproved) => {
    state.client.setPlayerProperties({ clientId: state.playerId, name: String(identity?.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest',
      color: /^#[0-9a-f]{6}$/i.test(identity?.color || '') ? identity.color : '#65d6ad', approved: !!isApproved });
    if (isApproved) state.approvedPlayers.add(state.client.localPlayer.number); else state.approvedPlayers.delete(state.client.localPlayer.number);
    state.roster();
  };
  const sync = createServerSync(state), rooms = createServerRooms(state, sync);
  let connecting = null, recovery = null;
  async function connect() {
    if (state.client?.isConnected) return state.playerId;
    if (connecting) return connecting;
    connecting = (async () => {
      if (state.client) state.client.dispose();
      state.report('connecting', 'CONNECTING TO LOCAL SERVER');
      state.client = createClient();
      try { state.playerId = await state.client.connect(); }
      catch (error) { state.client.dispose(); state.client = null; state.report('', 'CONNECTION FAILED'); throw error; }
      sync.setup(); rooms.setup();
      state.client.on('error', error => state.log('Server error: ' + (error?.message || 'Unknown error')));
      state.client.on('roomLeft', () => { state.roomName = ''; state.approvedPlayers.clear(); state.roster(); });
      state.client.on('disconnected', () => { if (!recovery) { recovery = Promise.resolve().finally(() => { recovery = null; }); state.report('', 'SERVER DISCONNECTED'); state.log('The local server connection was lost. Reconnect from the server menu.'); } });
      state.report('online', 'LOCAL SERVER ONLINE'); state.log('Connected to PixelPhyx local server.');
      return state.playerId;
    })();
    try { return await connecting; } finally { connecting = null; }
  }
  async function disconnect() {
    try { if (state.client?.isConnected) await state.client.disconnect(); }
    finally { sync.dispose(); state.client?.dispose(); state.client = null; state.roomName = ''; state.approvedPlayers.clear(); state.report('', 'DISCONNECTED'); }
  }
  return {
    connect, connectSimulation: (roomName, token) => state.client.connectSimulation(roomName, token),
    createLobby: rooms.createLobby, joinRoom: rooms.joinRoom, requestJoin: rooms.requestJoin,
    respondToJoinRequest: rooms.respondToJoinRequest,
    watchLobbies: rooms.watchLobbies, leaveRoom: rooms.leaveRoom, disconnect,
    publishOperation: sync.publishOperation, publishStroke: sync.publishStroke, publishWorld: sync.publishWorld, publishRopes: sync.publishRopes,
    publishLeafblower: () => {}, updateCursor: (position, color, name) => sync.publishCursor(position, color, name),
    updateIdentity: (name, color) => { if (state.client?.room) state.setLocalIdentity({ name, color }, state.isApproved(state.client.localPlayer.number)); },
    get joined() { return !!state.client?.room; }, get isHost() { return state.isHost(); },
    get playerId() { return state.playerId; }, get room() { return state.roomName; },
    get networkSettings() {
      const network = state.client?.serverInfo?.network || {};
      return {
        snapshotIntervalMs: Math.max(750, Number(network.snapshotIntervalMs) || 1000),
        ropeUpdateIntervalMs: Math.max(20, Number(network.ropeUpdateIntervalMs) || 50),
        cursorUpdates: network.cursorUpdates !== false,
        cursorUpdateIntervalMs: Math.max(20, Number(network.cursorUpdateIntervalMs) || 40),
        predictionEnabled: network.predictionEnabled === true
      };
    }
  };
}
