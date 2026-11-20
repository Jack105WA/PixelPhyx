const cacheVersion = new URL(import.meta.url).searchParams.get('v') || 'dev';
const { EVENTS } = await import('./ws-sync.js?v=' + encodeURIComponent(cacheVersion));

export function createServerRooms(state, sync) {
  let pendingApproval = null, roomListOff = null, lobbyRefreshTimer = null;
  const pendingRequests = new Map();
  const client = () => state.client;
  const room = () => client()?.room || null;

  function publishLobbyList() {
    const lobbies = (client()?.cachedRoomList || [])
      .slice(0, 20)
      .map(entry => ({
        room: entry.name,
        players: Number(entry.playerCount) || 0,
        maxPlayers: Number(entry.maxPlayers) || 0,
        hostName: entry.customProperties?.hostName || entry.hostName || 'Unknown',
        transport: 'local server'
      }))
      .filter(entry => typeof entry.room === 'string' && entry.room.length > 0);
    state.callbacks.onLobbyList?.(lobbies);
  }

  function setup() {
    client().onEvent(EVENTS.JOIN_REQUEST, ({ senderNumber, data }) => {
      if (!state.isRoomOwner() || !data || senderNumber === client().localPlayer.number) return;
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

    client().on('error', error => {
      if (!pendingApproval) return;
      const pending = pendingApproval;
      pendingApproval = null;
      clearTimeout(pending.timer);
      pending.reject(error instanceof Error ? error : new Error(String(error || 'Join request failed.')));
      if (room()) leaveRoom().catch(() => {});
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
        state.log('Local server elected this player as the new room host.');
        sync.queueSnapshot(state.targets());
      } else {
        sync.requestSnapshot();
      }
    });
    client().on('roomListUpdated', publishLobbyList);
  }

  async function createLobby(identity = {}) {
    if (!client()?.isConnected) throw new Error('Connect to the local server before creating a server.');
    if (room()) throw new Error('Leave your current server before creating another.');
    const code = 'PX-' + crypto.randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase();
    const safeName = String(identity.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest';
    const created = await client().createRoom(code, {
      maxPlayers: 8, isVisible: true, isOpen: true, playerTtlMs: 30000, emptyRoomTtlMs: 60000,
      customProperties: { game: 'pixelphyx', hostName: safeName, protocol: 1 },
      lobbyProperties: ['game', 'hostName']
    });
    state.roomName = created.name;
    state.approvedPlayers.clear();
    state.setLocalIdentity(identity, true);
    state.report('online', 'ROOM HOST');
    state.log('Created local server ' + state.roomName + '.');
    const world = state.callbacks.getWorld?.();
    if (world) sync.publishWorld(world);
    const ropes = state.callbacks.getRopes?.();
    if (ropes) sync.publishRopes(ropes.ropes || []);
    return state.roomName;
  }

  async function joinRoom(code, identity = {}, isApproved = false) {
    if (!client()?.isConnected) throw new Error('Connect to the local server before joining a server.');
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
    state.log('Joined local server ' + state.roomName +
      (isApproved ? '.' : ' — waiting for host approval.'));
  }

  async function requestJoin(code, identity = {}) {
    const requestedRoom = String(code || '').trim().toUpperCase();
    if (room()?.name === requestedRoom && state.isApproved(client().localPlayer.number)) return true;
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
      const sent = client().send('request-join-approval');
      if (!sent) {
        clearTimeout(timer);
        pendingApproval = null;
        leaveRoom();
        reject(new Error('Could not send the join request to the host.'));
      }
    });
  }

  async function respondToJoinRequest(key, isApproved) {
    if (!state.isRoomOwner()) throw new Error('Only the room owner can approve join requests.');
    const request = pendingRequests.get(String(key));
    if (!request) throw new Error('That join request is no longer active.');
    pendingRequests.delete(String(key));
    if (isApproved) state.approvedPlayers.add(request.senderNumber);
    const sent = client().send('approve-join-request', {
      playerNumber: request.senderNumber, approved: !!isApproved
    });
    if (!sent) {
      if (isApproved) state.approvedPlayers.delete(request.senderNumber);
      pendingRequests.set(String(key), request);
      throw new Error('Local server could not deliver the approval response.');
    }
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
        .catch(error => state.log('Could not join local server lobby: ' + error.message));
    }
    if (!room() && client()?.isConnected) client().send('list');
    if (lobbyRefreshTimer) clearInterval(lobbyRefreshTimer);
    lobbyRefreshTimer = setInterval(() => {
      if (client()?.isConnected && !room()) client().send('list');
    }, 2000);
    roomListOff?.();
    roomListOff = client()?.on('roomListUpdated', publishLobbyList) || null;
    publishLobbyList();
    return () => {
      roomListOff?.();
      roomListOff = null;
      if (lobbyRefreshTimer) clearInterval(lobbyRefreshTimer);
      lobbyRefreshTimer = null;
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
    state.report('online', 'LOCAL SERVER ONLINE');
    state.log('Left the local server.');
  }

  return { setup, createLobby, joinRoom, requestJoin, respondToJoinRequest, watchLobbies, leaveRoom };
}
