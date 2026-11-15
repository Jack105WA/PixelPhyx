import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import {
  getDatabase, ref, onValue, set, onDisconnect, serverTimestamp,
  push, onChildAdded, runTransaction, update, remove, get, query, limitToLast
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';

export function createMultiplayer(callbacks = {}) {
  let app = null, db = null, auth = null, room = '';
  let playerId = 'guest-' + Math.random().toString(36).slice(2, 9);
  let joined = false, hostId = null, presenceRef = null;
  let stopOperations = null, stopWorld = null, stopPlayers = null, stopCursors = null, stopHost = null;
  let cursorRef = null, lobbySlot = null, stopJoinRequests = null;
  let lastWorldWrite = 0, worldWriteInFlight = false, pendingWorld = null;

  const report = (state, label) => callbacks.onStatus?.(state, label);
  const log = message => callbacks.onLog?.(message);
  function stopListeners() {
    stopOperations?.(); stopOperations = null;
    stopWorld?.(); stopWorld = null;
    stopPlayers?.(); stopPlayers = null;
    stopHost?.(); stopHost = null;
    stopCursors?.(); stopCursors = null;
    stopJoinRequests?.(); stopJoinRequests = null;
  }

  function syncJoinRequestListener() {
    const shouldListen = joined && !!room && hostId === playerId;
    if (!shouldListen) {
      stopJoinRequests?.();
      stopJoinRequests = null;
      return;
    }
    if (stopJoinRequests) return;
    const requestPath = 'rooms/' + room + '/joinRequests';
    stopJoinRequests = onChildAdded(ref(db, requestPath), snapshot => {
      const request = snapshot.val();
      if (request?.status === 'pending') {
        callbacks.onJoinRequest?.({
          key: snapshot.key,
          room,
          uid: request.uid || '',
          name: request.name || 'Guest'
        });
      }
    }, error => log('Join request listener failed: ' + error.message));
  }

  async function connect(config) {
    report('connecting', 'CONNECTING');
    try {
      if (!app) {
        app = initializeApp(config);
        db = getDatabase(app);
        auth = getAuth(app);
      }
      if (!auth.currentUser) await signInAnonymously(auth);
      playerId = auth.currentUser.uid;
      report('online', 'FIREBASE ONLINE');
      log('Signed in anonymously. Firebase multiplayer is ready.');
      return playerId;
    } catch (error) {
      report('', 'CONNECTION FAILED');
      throw error;
    }
  }

  async function joinRoom(code, identity = {}, approved = false, isHost = false) {
    if (!db || !auth?.currentUser) throw new Error('Firebase authentication is not ready');
    const nextRoom = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
    if (!nextRoom) throw new Error('Enter a room code');
    if (!approved && !isHost) throw new Error('This lobby requires host approval. Request to join from the lobby gallery.');
    if (joined && room === nextRoom) return;

    stopListeners();
    joined = false;
    if (presenceRef) await remove(presenceRef).catch(() => {});
    if (cursorRef) await remove(cursorRef).catch(() => {});
    room = nextRoom;
    hostId = null;
    report('connecting', 'JOINING ROOM');

    const roomPath = 'rooms/' + room;
    const hostRef = ref(db, roomPath + '/host');
    // Keep every client synchronized with the authoritative host value. Presence
    // changes can trigger election asynchronously, so do not rely only on the
    // local result of the transaction to update each client's host state.
    stopHost = onValue(hostRef, snapshot => {
      hostId = snapshot.val() || null;
      syncJoinRequestListener();
    }, error => log('Host sync error: ' + error.message));
    presenceRef = ref(db, roomPath + '/players/' + playerId);
    cursorRef = ref(db, roomPath + '/cursors/' + playerId);

    try {
      const hostResult = await runTransaction(hostRef, current => current || playerId);
      hostId = hostResult.snapshot.val() || playerId;

      await onDisconnect(presenceRef).remove();
      await onDisconnect(cursorRef).remove();
      await set(presenceRef, {
        name: String(identity.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest',
        color: /^#[0-9a-f]{6}$/i.test(identity.color || '') ? identity.color : '#65d6ad',
        joinedAt: serverTimestamp()
      });

      stopWorld = onValue(ref(db, roomPath + '/world'), snapshot => {
        const world = snapshot.val();
        if (world) callbacks.onWorld?.(world);
      }, error => log('World sync error: ' + error.message));

      const operationsRef = ref(db, roomPath + '/operations');
      // Read only a bounded tail. Old operation history must never be downloaded in full.
      const operationQuery = query(operationsRef, limitToLast(100));
      const existingOperations = await get(operationQuery);
      const existingKeys = new Set(Object.keys(existingOperations.val() || {}));
      stopOperations = onChildAdded(operationQuery, snapshot => {
        if (existingKeys.has(snapshot.key)) {
          if (hostId === playerId) remove(snapshot.ref).catch(error => log('Operation cleanup failed: ' + error.message));
          return;
        }
        const operation = snapshot.val();
        if (operation && operation.by !== playerId) callbacks.onOperation?.(operation);
        // Only the host removes processed operations. This keeps the shared queue tiny
        // while preserving the add event for every connected client.
        if (hostId === playerId) remove(snapshot.ref).catch(error => log('Operation cleanup failed: ' + error.message));
      }, error => log('Edit sync error: ' + error.message));

      stopCursors = onValue(ref(db, roomPath + '/cursors'), snapshot => {
        callbacks.onCursors?.(snapshot.val() || {});
      }, error => log('Cursor sync error: ' + error.message));

      stopPlayers = onValue(ref(db, roomPath + '/players'), async snapshot => {
        const people = snapshot.val() || {};
        callbacks.onPlayers?.(people);
        update(ref(db, 'lobbyDirectory/' + room), { players: Object.keys(people).length }).catch(() => {});
        const ids = Object.keys(people).sort();
        if (hostId && people[hostId]) {
          syncJoinRequestListener();
          return;
        }
        const nextHost = ids[0] || null;
        try {
          const result = await runTransaction(hostRef, current => {
            // Keep the current host only while that player is still present.
            // Otherwise, all clients converge on the same deterministic candidate.
            if (current && people[current]) return current;
            return nextHost;
          });
          hostId = result.snapshot.val() || null;
          syncJoinRequestListener();
          if (hostId) {
            const electedPlayer = people[hostId];
            const directoryRef = ref(db, 'lobbyDirectory/' + room);
            update(directoryRef, {
              hostId,
              ...(electedPlayer?.name ? { hostName: electedPlayer.name } : {})
            }).catch(() => {});
            get(directoryRef).then(directory => {
              const slot = directory.val()?.slot;
              if (slot) update(ref(db, 'lobbySlots/' + slot), {
                hostId,
                ...(electedPlayer?.name ? { hostName: electedPlayer.name } : {})
              }).catch(() => {});
            }).catch(() => {});
          }
        } catch (error) {
          log('Host election failed: ' + error.message);
        }
      }, error => log('Presence sync error: ' + error.message));

      const confirmedHost = await get(hostRef);
      hostId = confirmedHost.val() || playerId;
      joined = true;
      syncJoinRequestListener();
      report('online', 'ROOM ONLINE');
      log('Connected to room ' + room + (hostId === playerId ? ' as host' : ''));
    } catch (error) {
      joined = false;
      report('', 'ROOM ERROR');
      throw error;
    }
  }


  async function createLobby(identity = {}) {
    if (!db || !auth?.currentUser) throw new Error('Firebase authentication is not ready');
    const safeName = String(identity.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest';
    let reserved = null;
    for (let i = 1; i <= 20; i++) {
      const slot = 'slot-' + String(i).padStart(2, '0');
      const slotRef = ref(db, 'lobbySlots/' + slot);
      const code = 'PX-' + Math.random().toString(36).slice(2, 7).toUpperCase();
      const result = await runTransaction(slotRef, current => current == null ? {
        room: code, hostId: playerId, hostName: safeName, reservedAt: Date.now()
      } : current);
      if (result.committed && result.snapshot.val()?.hostId === playerId && result.snapshot.val()?.room === code) {
        reserved = { slot, code };
        break;
      }
    }
    if (!reserved) throw new Error('All 20 lobby slots are full. Try joining an existing lobby.');
    try {
      await joinRoom(reserved.code, identity, true, true);
      lobbySlot = reserved.slot;
      await set(ref(db, 'lobbyDirectory/' + reserved.code), {
        room: reserved.code, slot: reserved.slot, hostId: playerId, hostName: safeName,
        players: 1, createdAt: serverTimestamp()
      });
      return reserved.code;
    } catch (error) {
      await remove(ref(db, 'lobbySlots/' + reserved.slot)).catch(() => {});
      await remove(ref(db, 'rooms/' + reserved.code)).catch(() => {});
      throw error;
    }
  }

  function watchLobbies(callback) {
    if (!db) throw new Error('Firebase is not connected');
    return onValue(ref(db, 'lobbyDirectory'), async snapshot => {
      const entries = Object.values(snapshot.val() || {});
      const active = [];
      for (const lobby of entries) {
        const playersSnap = await get(ref(db, 'rooms/' + lobby.room + '/players'));
        const count = Object.keys(playersSnap.val() || {}).length;
        if (!count) {
          await remove(ref(db, 'lobbyDirectory/' + lobby.room)).catch(() => {});
          if (lobby.slot) await remove(ref(db, 'lobbySlots/' + lobby.slot)).catch(() => {});
          await remove(ref(db, 'rooms/' + lobby.room)).catch(() => {});
        } else {
          if (count !== lobby.players) update(ref(db, 'lobbyDirectory/' + lobby.room), { players: count }).catch(() => {});
          active.push({ ...lobby, players: count });
        }
      }
      callback(active.sort((a, b) => String(a.room).localeCompare(String(b.room))));
    }, error => log('Lobby gallery error: ' + error.message));
  }

  async function requestJoin(code, identity = {}) {
    if (!db || !auth?.currentUser) throw new Error('Firebase authentication is not ready');
    const safeCode = String(code || '').trim().toUpperCase();
    const lobbySnap = await get(ref(db, 'lobbyDirectory/' + safeCode));
    if (!lobbySnap.exists()) throw new Error('That lobby is no longer available');
    const requestRef = push(ref(db, 'rooms/' + safeCode + '/joinRequests'));
    await set(requestRef, {
      uid: playerId, name: String(identity.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest',
      status: 'pending', createdAt: serverTimestamp()
    });
    return await new Promise((resolve, reject) => {
      const stop = onValue(requestRef, snapshot => {
        const status = snapshot.val()?.status;
        if (status === 'approved') { stop(); resolve(true); }
        else if (status === 'denied') { stop(); resolve(false); }
        else if (!snapshot.exists()) { stop(); reject(new Error('Join request was removed')); }
      }, error => { stop(); reject(error); });
    });
  }

  async function respondToJoinRequest(key, approved) {
    if (!db || !joined || hostId !== playerId || !room) throw new Error('Only the host can approve join requests');
    await update(ref(db, 'rooms/' + room + '/joinRequests/' + key), {
      status: approved ? 'approved' : 'denied', handledAt: serverTimestamp()
    });
  }

  function publishOperation(operation) {
    if (!db || !joined || !room) return;
    push(ref(db, 'rooms/' + room + '/operations'), {
      ...operation, by: playerId, createdAt: serverTimestamp()
    }).catch(error => log('Edit sync failed: ' + error.message));
  }

  function updateIdentity(name, color) {
    if (!db || !joined || !presenceRef) return;
    const safeName = String(name || 'Lab guest').trim().slice(0, 20) || 'Lab guest';
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#65d6ad';
    update(presenceRef, { name: safeName, color: safeColor }).catch(error => log('Profile update failed: ' + error.message));
  }

  function publishWorld(world) {
    if (!db || !joined || !room || hostId !== playerId) return;
    const now = Date.now();
    if (now - lastWorldWrite < 1000 / 60) return;
    lastWorldWrite = now;
    pendingWorld = world;
    if (worldWriteInFlight) return;

    worldWriteInFlight = true;
    (async () => {
      try {
        while (pendingWorld && joined && room && hostId === playerId) {
          const latest = pendingWorld;
          pendingWorld = null;
          await set(ref(db, 'rooms/' + room + '/world'), {
            ...latest, by: playerId, updatedAt: serverTimestamp()
          });
        }
      } catch (error) {
        log('World sync failed: ' + error.message);
      } finally {
        worldWriteInFlight = false;
      }
    })();
  }

  function updateCursor(point, color, name) {
    if (!db || !joined || !room) return;
    update(ref(db, 'rooms/' + room + '/cursors/' + playerId), {
      x: point.x, y: point.y, color, name, updatedAt: Date.now()
    }).catch(() => {});
  }

  return {
    connect, joinRoom, createLobby, watchLobbies, requestJoin, respondToJoinRequest, publishOperation, publishWorld, updateCursor, updateIdentity,
    get joined() { return joined; },
    get isHost() { return joined && hostId === playerId; },
    get playerId() { return playerId; },
    get room() { return room; }
  };
}
