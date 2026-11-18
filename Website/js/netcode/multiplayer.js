import { createRealtimeClient } from 'https://esm.sh/@photonengine/realtime-core@6.0.2';
const cacheVersion = new URL(import.meta.url).searchParams.get('v') || 'dev';
const [{ createPhotonSync }, { createPhotonRooms }] = await Promise.all([
  import('./photon-sync.js?v=' + encodeURIComponent(cacheVersion)),
  import('./photon-rooms.js?v=' + encodeURIComponent(cacheVersion))
]);

const APP_ID = 'a974c6dd-9d62-4359-bd08-90650e551d09';
const APP_VERSION = 'pixelphyx-1';

export function createMultiplayer(callbacks = {}) {
  const state = {
    client: null,
    playerId: '',
    roomName: '',
    callbacks,
    approvedPlayers: new Set(),
    report: (status, label) => callbacks.onStatus?.(status, label),
    log: message => callbacks.onLog?.(message)
  };

  state.isHost = () => !!state.client?.room?.isMasterClient;
  state.isApproved = number => number === state.client?.localPlayer?.number ||
    state.approvedPlayers.has(number) ||
    !!state.client?.room?.getPlayer(number)?.customProperties?.approved;
  state.targets = except => (state.client?.room?.players || [])
    .filter(player => player.number !== state.client.localPlayer.number &&
      player.number !== except && state.isApproved(player.number))
    .map(player => player.number);

  state.roster = () => {
    const people = {};
    for (const player of state.client?.room?.players || []) {
      const properties = player.customProperties || {};
      const id = properties.clientId || 'photon-' + player.number;
      people[id] = {
        name: properties.name || player.name || 'Guest',
        color: properties.color || '#65d6ad',
        photonNumber: player.number,
        isHost: !!player.isMasterClient,
        approved: state.isApproved(player.number)
      };
    }
    callbacks.onPlayers?.(people);
  };

  state.setLocalIdentity = (identity, isApproved) => {
    state.client.setPlayerProperties({
      clientId: state.playerId,
      name: String(identity?.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest',
      color: /^#[0-9a-f]{6}$/i.test(identity?.color || '') ? identity.color : '#65d6ad',
      approved: !!isApproved
    });
    if (isApproved) state.approvedPlayers.add(state.client.localPlayer.number);
    else state.approvedPlayers.delete(state.client.localPlayer.number);
    state.roster();
  };

  const sync = createPhotonSync(state);
  const rooms = createPhotonRooms(state, sync);
  let connecting = null, recovery = null;

  async function connect() {
    if (state.client?.isConnected) return state.playerId;
    if (recovery) {
      await recovery;
      if (state.client?.isConnected) return state.playerId;
    }
    if (connecting) return connecting;
    connecting = (async () => {
      if (state.client) {
        state.client.dispose();
        state.client = null;
      }
      state.report('connecting', 'CONNECTING TO PHOTON');
      state.client = await createRealtimeClient({
        appId: APP_ID, appVersion: APP_VERSION, protocol: 'wss'
      });
      state.playerId = crypto.randomUUID();
      try {
        await state.client.connect({ auth: { userId: state.playerId } });
      } catch (error) {
        state.client.dispose();
        state.client = null;
        state.report('', 'CONNECTION FAILED');
        throw error;
      }
      sync.setup();
      rooms.setup();
      state.client.on('error', error => {
        state.log('Photon error: ' + (error?.message || error?.code || 'Unknown error'));
      });
      state.client.on('warning', warning => state.log('Photon warning: ' + warning.message));
      state.client.on('roomLeft', () => {
        state.roomName = '';
        state.approvedPlayers.clear();
        state.roster();
      });
      state.client.on('disconnected', ({ cause }) => {
        if (cause === 'none' || recovery) return;
        recovery = recover(cause).finally(() => { recovery = null; });
      });
      state.report('online', 'PHOTON ONLINE');
      state.log('Connected to Photon Cloud.');
      return state.playerId;
    })();
    try {
      return await connecting;
    } finally {
      connecting = null;
    }
  }

  async function recover(cause) {
    state.report('', 'RECONNECTING');
    state.log('Photon connection lost: ' + cause + '.');
    if (!['timeoutDisconnect', 'exception', 'exceptionOnConnect', 'disconnectByServer'].includes(cause)) {
      state.log('This disconnect requires a manual reconnect.');
      return;
    }
    const lastRoom = state.roomName;
    try {
      await state.client.reconnect();
      state.report('online', 'PHOTON RECONNECTED');
      state.log('Photon session restored.');
      state.roster();
      if (state.client.room && !state.isHost()) sync.requestSnapshot();
      else if (state.isHost()) sync.queueSnapshot(state.targets());
    } catch (reconnectError) {
      state.log('Session resume failed: ' + reconnectError.message);
      try {
        await state.client.connect({ auth: { userId: state.playerId } });
        if (lastRoom) await state.client.joinRoom(lastRoom, { rejoin: true });
        state.report('online', 'PHOTON RECONNECTED');
        state.roster();
        if (state.client.room && !state.isHost()) sync.requestSnapshot();
      } catch (error) {
        state.report('', 'RECONNECT FAILED');
        state.log('Could not restore the server session: ' + error.message);
      }
    }
  }

  async function disconnect() {
    try {
      if (state.client?.isConnected) await state.client.disconnect();
    } finally {
      sync.dispose();
      state.client?.dispose();
      state.client = null;
      state.roomName = '';
      state.approvedPlayers.clear();
      state.report('', 'DISCONNECTED');
    }
  }

  return {
    connect,
    createLobby: rooms.createLobby,
    joinRoom: rooms.joinRoom,
    requestJoin: rooms.requestJoin,
    respondToJoinRequest: rooms.respondToJoinRequest,
    watchLobbies: rooms.watchLobbies,
    leaveRoom: rooms.leaveRoom,
    disconnect,
    publishOperation: sync.publishOperation,
    publishWorld: sync.publishWorld,
    publishRopes: sync.publishRopes,
    publishLeafblower: () => {},
    updateCursor: () => {},
    updateIdentity: (name, color) => {
      if (state.client?.room) state.setLocalIdentity({ name, color },
        state.isApproved(state.client.localPlayer.number));
    },
    get joined() { return !!state.client?.room; },
    get isHost() { return state.isHost(); },
    get playerId() { return state.playerId; },
    get room() { return state.roomName; }
  };
}
