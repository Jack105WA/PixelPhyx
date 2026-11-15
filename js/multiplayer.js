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
  let stopOperations = null, stopWorld = null, stopPlayers = null;
  let lastWorldWrite = 0, worldWriteInFlight = false, pendingWorld = null;

  const report = (state, label) => callbacks.onStatus?.(state, label);
  const log = message => callbacks.onLog?.(message);
  function stopListeners() {
    stopOperations?.(); stopOperations = null;
    stopWorld?.(); stopWorld = null;
    stopPlayers?.(); stopPlayers = null;
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

  async function joinRoom(code, identity = {}) {
    if (!db || !auth?.currentUser) throw new Error('Firebase authentication is not ready');
    const nextRoom = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
    if (!nextRoom) throw new Error('Enter a room code');
    if (joined && room === nextRoom) return;

    stopListeners();
    joined = false;
    if (presenceRef) await remove(presenceRef).catch(() => {});
    room = nextRoom;
    hostId = null;
    report('connecting', 'JOINING ROOM');

    const roomPath = 'rooms/' + room;
    const hostRef = ref(db, roomPath + '/host');
    presenceRef = ref(db, roomPath + '/players/' + playerId);

    try {
      const hostResult = await runTransaction(hostRef, current => current || playerId);
      hostId = hostResult.snapshot.val() || playerId;

      await set(presenceRef, {
        name: String(identity.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest',
        color: /^#[0-9a-f]{6}$/i.test(identity.color || '') ? identity.color : '#65d6ad',
        joinedAt: serverTimestamp()
      });
      await onDisconnect(presenceRef).remove();

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

      stopPlayers = onValue(ref(db, roomPath + '/players'), async snapshot => {
        const people = snapshot.val() || {};
        callbacks.onPlayers?.(people);
        const ids = Object.keys(people).sort();
        if (hostId && people[hostId]) return;
        const nextHost = ids[0] || null;
        try {
          const result = await runTransaction(hostRef, current => current && people[current] ? current : nextHost);
          hostId = result.snapshot.val();
        } catch (error) {
          log('Host election failed: ' + error.message);
        }
      }, error => log('Presence sync error: ' + error.message));

      const confirmedHost = await get(hostRef);
      hostId = confirmedHost.val() || playerId;
      joined = true;
      report('online', 'ROOM ONLINE');
      log('Connected to room ' + room + (hostId === playerId ? ' as host' : ''));
    } catch (error) {
      joined = false;
      report('', 'ROOM ERROR');
      throw error;
    }
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
    update(ref(db, 'rooms/' + room + '/players/' + playerId + '/cursor'), {
      x: point.x, y: point.y, color, name, updatedAt: Date.now()
    }).catch(() => {});
  }

  return {
    connect, joinRoom, publishOperation, publishWorld, updateCursor, updateIdentity,
    get joined() { return joined; },
    get isHost() { return joined && hostId === playerId; },
    get playerId() { return playerId; },
    get room() { return room; }
  };
}
