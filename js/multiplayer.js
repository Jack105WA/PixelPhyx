import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import {
  getDatabase, ref, onValue, set, onDisconnect, serverTimestamp,
  push, onChildAdded, runTransaction, update, remove, get
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';

export function createMultiplayer(callbacks = {}) {
  let app = null, db = null, auth = null, room = '';
  let playerId = 'guest-' + Math.random().toString(36).slice(2, 9);
  let joined = false, hostId = null, presenceRef = null;
  let stopOperations = null, stopWorld = null, stopPlayers = null;
  let lastWorldWrite = 0;

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

  async function joinRoom(code) {
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
        name: 'Lab guest',
        color: ['#65d6ad','#ff9b71','#78a9ff','#d6a0ff','#ffd166','#ff719a','#70d6c8'][Math.floor(Math.random() * 7)],
        joinedAt: serverTimestamp()
      });
      await onDisconnect(presenceRef).remove();

      stopWorld = onValue(ref(db, roomPath + '/world'), snapshot => {
        const world = snapshot.val();
        if (world) callbacks.onWorld?.(world);
      }, error => log('World sync error: ' + error.message));

      const operationsRef = ref(db, roomPath + '/operations');
      // Snapshot existing keys before subscribing. This avoids comparing Firebase server
      // timestamps with a potentially inaccurate device clock, while ignoring old history.
      const existingOperations = await get(operationsRef);
      const existingKeys = new Set(Object.keys(existingOperations.val() || {}));
      stopOperations = onChildAdded(operationsRef, snapshot => {
        if (existingKeys.has(snapshot.key)) return;
        const operation = snapshot.val();
        if (!operation || operation.by === playerId) return;
        callbacks.onOperation?.(operation);
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

  function publishWorld(world) {
    if (!db || !joined || !room || hostId !== playerId) return;
    const now = Date.now();
    if (now - lastWorldWrite < 100) return;
    lastWorldWrite = now;
    set(ref(db, 'rooms/' + room + '/world'), {
      ...world, by: playerId, updatedAt: serverTimestamp()
    }).catch(error => log('World sync failed: ' + error.message));
  }

  function updateCursor(point, color, name) {
    if (!db || !joined || !room) return;
    update(ref(db, 'rooms/' + room + '/players/' + playerId + '/cursor'), {
      x: point.x, y: point.y, color, name, updatedAt: Date.now()
    }).catch(() => {});
  }

  return {
    connect, joinRoom, publishOperation, publishWorld, updateCursor,
    get joined() { return joined; },
    get isHost() { return joined && hostId === playerId; },
    get playerId() { return playerId; },
    get room() { return room; }
  };
}
