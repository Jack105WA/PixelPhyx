import { EVENTS } from './photon-sync.js';

export function createPhotonRooms(state, sync) {
  let pendingApproval = null, roomListOff = null;
  const pendingRequests = new Map();
  const client = () => state.client;
  const room = () => client()?.room || null;

  function publishLobbyList() {
    const lobbies = (client()?.cachedRoomList || [])
      .filter(entry => entry.customProperties?.game === 'pixelphyx')
      .slice(0, 20)
      .map(entry => ({
        room: entry.name,
        players: entry.playerCount,
        hostName: entry.customProperties?.hostName || 'Unknown',
        transport: 'photon'
      }));
    state.callbacks.onLobbyList?.(lobbies);
  }

  function setup() {
    client().onEvent(EVENTS.JOIN_REQUEST, ({ senderNumber, data }) => {
      if (!state.isHost() || !data || senderNumber === client().localPlayer.number) return;
      pendingRequests.set(String(senderNumber), { senderNumber, createdAt: Date.now() });
      state.callbacks.onJoinRequest?.({
        key: String(senderNumber), room: state.roomName,
        uid: data.clientId || String(senderNumber),
        name: String(data.name || 'Guest').slice(0, 20),
        playerNumber: senderNumber
      });
    });

    client().onEvent(EVENTS.JOIN_REPLY, async ({ data }) => {
      if (!pendingApproval || typeof data?.approved !== 'boolean') return;
      const pending = pendingApproval;
      pendingApproval = null;
      clearTimeout(pending.timer);
      if (data.approved) {
        state.setLocalIdentity(pending.identity, true);
        sync.requestSnapshot();
        pending.resolve(true);
      } else {
        await leaveRoom();
        pending.resolve(false);
      }
    });

    client().onEvent(EVENTS.SYNC_REQUEST, ({ senderNumber }) => {
      if (state.isHost() && state.isApproved(senderNumber)) sync.queueSnapshot([senderNumber]);
    });

    client().on('playerJoined', () => state.roster());
    client().on('playerLeft', ({ playerNumber }) => {
      state.approvedPlayers.delete(playerNumber);
      pendingRequests.delete(String(playerNumber));
      state.roster();
    });
    client().on('playerPropertiesChanged', () => state.roster());
    client().on('masterClientChanged', () => {
      const active = room();
      if (!active) return;
      state.approvedPlayers.clear();
      for (const player of active.players) {
        if (player.isMasterClient || player.customProperties?.approved) {
          state.approvedPlayers.add(player.number);
        }
      }
      state.roster();
      if (active.isMasterClient) {
        state.log('Photon elected this player as the new room host.');
        sync.queueSnapshot(state.targets());
      } else {
        sync.requestSnapshot();
      }
    });
    client().on('roomListUpdated', publishLobbyList);
  }

  async function createLobby(identity = {}) {
    if (!client()?.isConnected) throw new Error('Connect to Photon before creating a server.');
    if (room()) throw new Error('Leave your current server before creating another.');
    const code = 'PX-' + crypto.randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase();
    const safeName = String(identity.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest';
    const created = await client().createRoom(code, {
      maxPlayers: 20, isVisible: true, isOpen: true, playerTtlMs: 30000, emptyRoomTtlMs: 60000,
      customProperties: { game: 'pixelphyx', hostName: safeName, protocol: 1 },
      lobbyProperties: ['game', 'hostName']
    });
    state.roomName = created.name;
    state.approvedPlayers.clear();
    state.setLocalIdentity(identity, true);
    state.report('online', 'ROOM HOST');
    state.log('Created Photon server ' + state.roomName + '.');
    const world = state.callbacks.getWorld?.();
    if (world) sync.publishWorld(world);
    const ropes = state.callbacks.getRopes?.();
    if (ropes) sync.publishRopes(ropes.ropes || []);
    const props = state.callbacks.getProps?.();
    if (props) sync.publishProps(props);
    return state.roomName;
  }

  async function joinRoom(code, identity = {}, isApproved = false) {
    if (!client()?.isConnected) throw new Error('Connect to Photon before joining a server.');
    const nextRoom = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
    if (!nextRoom) throw new Error('Enter a server code.');
    if (room()?.name === nextRoom) {
      if (isApproved && !state.isApproved(client().localPlayer.number)) {
        state.setLocalIdentity(identity, true);
      }
      return;
    }
    if (room()) await leaveRoom();
    const joined = await client().joinRoom(nextRoom);
    state.roomName = joined.name;
    state.approvedPlayers.clear();
    state.setLocalIdentity(identity, isApproved);
    if (isApproved) sync.requestSnapshot();
    state.report('online', 'JOINED ROOM');
    state.log('Joined Photon server ' + state.roomName +
      (isApproved ? '.' : ' — waiting for host approval.'));
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
      const sent = client().sendEvent(EVENTS.JOIN_REQUEST, {
        clientId: state.playerId,
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
    if (!state.isHost()) throw new Error('Only the room host can approve join requests.');
    const request = pendingRequests.get(String(key));
    if (!request) throw new Error('That join request is no longer active.');
    pendingRequests.delete(String(key));
    if (isApproved) state.approvedPlayers.add(request.senderNumber);
    client().sendEvent(EVENTS.JOIN_REPLY, { approved: !!isApproved }, {
      reliable: true, targetPlayers: [request.senderNumber]
    });
    state.roster();
    state.log((isApproved ? 'Approved' : 'Declined') + ' player #' + request.senderNumber + '.');
  }

  function watchLobbies(callback) {
    state.callbacks.onLobbyList = callback;
    if (room()) {
      publishLobbyList();
      state.log('Live server browsing pauses while you are inside a room. Leave the server to refresh the lobby.');
    } else if (client() && !client().isInLobby) {
      client().joinLobby().then(publishLobbyList)
        .catch(error => state.log('Could not join Photon lobby: ' + error.message));
    }
    roomListOff?.();
    roomListOff = client()?.on('roomListUpdated', publishLobbyList) || null;
    publishLobbyList();
    return () => {
      roomListOff?.();
      roomListOff = null;
      state.callbacks.onLobbyList = null;
    };
  }

  async function leaveRoom() {
    if (pendingApproval) {
      const pending = pendingApproval;
      pendingApproval = null;
      clearTimeout(pending.timer);
      pending.reject(new Error('You left the server before approval completed.'));
    }
    if (room()) await client().leaveRoom();
    state.roomName = '';
    state.approvedPlayers.clear();
    pendingRequests.clear();
    state.roster();
    if (client()?.isConnected && !client().isInLobby) {
      try { await client().joinLobby(); }
      catch (error) { state.log('Lobby reconnect failed: ' + error.message); }
    }
    state.report('online', 'PHOTON ONLINE');
    state.log('Left the Photon server.');
  }

  return { setup, createLobby, joinRoom, requestJoin, respondToJoinRequest, watchLobbies, leaveRoom };
}
