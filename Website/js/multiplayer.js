import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import {
  getDatabase, ref, onValue, set, onDisconnect, serverTimestamp,
  push, onChildAdded, runTransaction, update, remove, get
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';

  // Generate unpredictable identifiers with the Web Crypto API.
  // Secure randomness is required; never use a predictable fallback.
  function secureRandomString(length, alphabet = '0123456789abcdefghijklmnopqrstuvwxyz') {
    if (!globalThis.crypto?.getRandomValues) {
      throw new Error('Secure random generation is unavailable in this browser');
    }
    const limit = Math.floor(256 / alphabet.length) * alphabet.length;
    let result = '';
    while (result.length < length) {
      const bytes = new Uint8Array(Math.max(16, (length - result.length) * 2));
      globalThis.crypto.getRandomValues(bytes);
      for (const byte of bytes) {
        if (byte < limit) result += alphabet[byte % alphabet.length];
        if (result.length === length) break;
      }
    }
    return result;
  }

export function createMultiplayer(callbacks = {}) {
  let app = null, db = null, auth = null, room = '';
  let playerId = 'guest-' + secureRandomString(16);
  let joined = false, hostId = null, presenceRef = null;
  let stopOperations = null, stopWorld = null, stopPlayers = null, stopCursors = null, stopHost = null, stopSnapshots = null;
  let cursorRef = null, lobbySlot = null, stopJoinRequests = null;
  let operationPublishQueue = Promise.resolve();

  const report = (state, label) => callbacks.onStatus?.(state, label);
  const log = message => callbacks.onLog?.(message);
  function stopListeners() {
    stopSnapshots?.(); stopSnapshots = null;
    stopOperations?._clearGapTimer?.();
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

      const operationsRef = ref(db, roomPath + '/operations');
      const sequenceRef = ref(db, roomPath + '/operationSequence');
      // Every edit receives a transactionally allocated sequence. Firebase push IDs
      // depend on client clocks and cannot establish a reliable shared edit order.
      const sequenceSnapshot = await get(sequenceRef);
      let nextSequence = (Number(sequenceSnapshot.val()) || 0) + 1;
      const pendingOperations = new Map();
      let gapTimer = null;
      const applyQueuedOperations = () => {
        while (pendingOperations.has(nextSequence)) {
          const operation = pendingOperations.get(nextSequence);
          pendingOperations.delete(nextSequence++);
          if (operation && operation.by !== playerId) {
            try { callbacks.onOperation?.(operation); }
            catch (error) { log('Could not apply multiplayer edit: ' + error.message); }
          }
        }
        if (pendingOperations.size && !gapTimer) {
          gapTimer = setTimeout(() => {
            gapTimer = null;
            const available = [...pendingOperations.keys()].sort((a, b) => a - b);
            if (available.length && available[0] > nextSequence) {
              log('A missing edit sequence was skipped; requesting a fresh world checkpoint.');
              nextSequence = available[0];
              callbacks.onResyncNeeded?.();
              applyQueuedOperations();
            }
          }, 1500);
        } else if (!pendingOperations.size && gapTimer) {
          clearTimeout(gapTimer);
          gapTimer = null;
        }
      };
      stopOperations = onChildAdded(operationsRef, snapshot => {
        const operation = snapshot.val();
        const sequence = Number(operation?.sequence);
        if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence < nextSequence) return;
        pendingOperations.set(sequence, operation);
        applyQueuedOperations();
      }, error => log('Edit sync error: ' + error.message));
      stopOperations._clearGapTimer = () => { if (gapTimer) clearTimeout(gapTimer); };

      const snapshotRef = ref(db, roomPath + '/snapshots/' + playerId);
      await onDisconnect(snapshotRef).remove();
      stopSnapshots = onValue(ref(db, roomPath + '/snapshots'), snapshot => {
        callbacks.onWorldSnapshots?.(snapshot.val() || {});
      }, error => log('World snapshot sync error: ' + error.message));

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
      const code = 'PX-' + secureRandomString(7).toUpperCase();
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
    const targetRoom = room;
    operationPublishQueue = operationPublishQueue.then(async () => {
      if (!db || !joined || room !== targetRoom) return;
      const sequenceRef = ref(db, 'rooms/' + targetRoom + '/operationSequence');
      const result = await runTransaction(sequenceRef, current =>
        (Number.isSafeInteger(current) && current >= 0 ? current : 0) + 1
      );
      if (!result.committed) throw new Error('Could not reserve an edit sequence');
      const sequence = result.snapshot.val();
      const key = String(sequence).padStart(12, '0');
      await set(ref(db, 'rooms/' + targetRoom + '/operations/' + key), {
        ...operation, sequence, by: playerId, createdAt: serverTimestamp()
      });
    }).catch(error => log('Edit sync failed: ' + error.message));
  }

  function publishWorldSnapshot(world) {
    if (!db || !joined || !room || !world) return;
    set(ref(db, 'rooms/' + room + '/snapshots/' + playerId), {
      ...world, by: playerId, updatedAt: serverTimestamp()
    }).catch(error => log('World snapshot publish failed: ' + error.message));
  }

  function updateIdentity(name, color) {
    if (!db || !joined || !presenceRef) return;
    const safeName = String(name || 'Lab guest').trim().slice(0, 20) || 'Lab guest';
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#65d6ad';
    update(presenceRef, { name: safeName, color: safeColor }).catch(error => log('Profile update failed: ' + error.message));
  }



  function updateCursor(point, color, name) {
    if (!db || !joined || !room) return;
    update(ref(db, 'rooms/' + room + '/cursors/' + playerId), {
      x: point.x, y: point.y, color, name, updatedAt: Date.now()
    }).catch(() => {});
  }

  return {
    connect, joinRoom, createLobby, watchLobbies, requestJoin, respondToJoinRequest, publishOperation, publishWorldSnapshot, updateCursor, updateIdentity,
    get joined() { return joined; },
    get isHost() { return joined && hostId === playerId; },
    get playerId() { return playerId; },
    get room() { return room; }
  };
}
