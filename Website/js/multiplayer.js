import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import {
  getDatabase, ref, onValue as firebaseOnValue, set as firebaseSet, onDisconnect, serverTimestamp,
  push, onChildAdded as firebaseOnChildAdded, runTransaction, update as firebaseUpdate, remove, get as firebaseGet, query, limitToLast
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

// Approximate Realtime Database traffic from JSON payload sizes. Firebase's
// dashboard remains the source of truth; this is a client-side safety estimate.
let usageEstimateBytes = 0;
let usageEstimateUid = '';
let usageEstimateMonth = '';
let usageReportTimer = null;
const usageStoragePrefix = 'pixelphyx-usage-estimate-v1-';
const usageMonthlyLimitBytes = 10_000_000_000;

function currentUsageMonth() {
  return new Date().toISOString().slice(0, 7);
}
function payloadBytes(value) {
  try { return new TextEncoder().encode(JSON.stringify(value ?? null)).length; }
  catch { return 0; }
}
function saveUsageEstimate() {
  if (!usageEstimateUid || !usageEstimateMonth) return;
  try {
    localStorage.setItem(usageStoragePrefix + usageEstimateUid + '-' + usageEstimateMonth, String(usageEstimateBytes));
  } catch {}
}
function recordUsage(value) {
  usageEstimateBytes += payloadBytes(value);
  saveUsageEstimate();
}
async function get(...args) {
  const snapshot = await firebaseGet(...args);
  recordUsage(snapshot.val());
  return snapshot;
}
function onValue(queryRef, callback, ...args) {
  return firebaseOnValue(queryRef, snapshot => {
    recordUsage(snapshot.val());
    callback(snapshot);
  }, ...args);
}
function onChildAdded(queryRef, callback, ...args) {
  return firebaseOnChildAdded(queryRef, snapshot => {
    recordUsage(snapshot.val());
    callback(snapshot);
  }, ...args);
}
async function set(reference, value) {
  recordUsage(value);
  return firebaseSet(reference, value);
}
async function update(reference, value) {
  recordUsage(value);
  return firebaseUpdate(reference, value);
}
async function reportUsageEstimate(db, auth) {
  if (!db || !auth?.currentUser || !usageEstimateUid) return;
  const report = {
    month: usageEstimateMonth,
    estimatedBytes: Math.ceil(usageEstimateBytes * 1.5),
    updatedAt: Date.now()
  };
  try {
    await firebaseSet(ref(db, 'usageReports/' + usageEstimateUid), report);
  } catch (error) {
    console.warn('Could not publish bandwidth estimate:', error);
  }
}

export function createMultiplayer(callbacks = {}) {
  let app = null, db = null, auth = null, room = '';
  let playerId = 'guest-' + secureRandomString(16);
  let joined = false, hostId = null, presenceRef = null;
  let stopOperations = null, stopWorld = null, stopRopes = null, stopPlayers = null, stopCursors = null, stopLeafblowers = null, stopHost = null;
  let cursorRef = null, lobbySlot = null, stopJoinRequests = null;
  let lastWorldWrite = 0, worldWriteInFlight = false, pendingWorld = null, lastWorldRevision = 0, lastWorldSignature = null;
  let lastRopeWrite = 0, ropeWriteInFlight = false, pendingRopes = null, lastRopeSignature = null;
  let lastCursorWriteAt = 0, lastCursorSignature = '', lastLeafblowerWriteAt = 0;
  let cachedUsageStatus = null, cachedUsageAt = 0;
  const USAGE_LIMIT_PERCENT = 90;

  async function getMonthlyUsageStatus(force = false) {
    if (!db || !auth?.currentUser) throw new Error('Firebase authentication is not ready');
    const now = Date.now();
    if (!force && cachedUsageStatus && now - cachedUsageAt < 30000) return cachedUsageStatus;
    const month = currentUsageMonth();
    if (usageEstimateUid !== auth.currentUser.uid || usageEstimateMonth !== month) {
      usageEstimateUid = auth.currentUser.uid;
      usageEstimateMonth = month;
      try {
        usageEstimateBytes = Math.max(0, Number(localStorage.getItem(usageStoragePrefix + usageEstimateUid + '-' + month)) || 0);
      } catch { usageEstimateBytes = 0; }
    }
    await reportUsageEstimate(db, auth);
    const snapshot = await get(ref(db, 'usageReports'));
    const reports = snapshot.val() || {};
    let totalBytes = 0;
    for (const item of Object.values(reports)) {
      if (item?.month === month && Number.isFinite(Number(item.estimatedBytes))) {
        totalBytes += Math.max(0, Number(item.estimatedBytes));
      }
    }
    const percent = Math.min(100, Math.max(0, totalBytes / usageMonthlyLimitBytes * 100));
    cachedUsageAt = now;
    cachedUsageStatus = {
      percent: Number(percent.toFixed(2)),
      limit: USAGE_LIMIT_PERCENT,
      blocked: percent >= USAGE_LIMIT_PERCENT,
      stale: false,
      estimatedBytes: Math.round(totalBytes),
      monthlyLimitBytes: usageMonthlyLimitBytes,
      updatedAt: new Date().toISOString(),
      source: 'Client-side traffic estimate'
    };
    return cachedUsageStatus;
  }

  async function assertMonthlyUsageAllowed() {
    const status = await getMonthlyUsageStatus();
    if (status.blocked) throw new Error('Online is disabled because the estimated monthly bandwidth usage reached the 90% safety limit.');
    return status;
  }

  const report = (state, label) => callbacks.onStatus?.(state, label);
  const log = message => callbacks.onLog?.(message);
  function stopListeners() {
    stopOperations?.(); stopOperations = null;
    stopWorld?.(); stopWorld = null;
    stopRopes?.(); stopRopes = null;
    stopPlayers?.(); stopPlayers = null;
    stopHost?.(); stopHost = null;
    stopCursors?.(); stopCursors = null;
    stopLeafblowers?.(); stopLeafblowers = null;
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
      usageEstimateUid = playerId;
      usageEstimateMonth = currentUsageMonth();
      try {
        usageEstimateBytes = Math.max(0, Number(localStorage.getItem(usageStoragePrefix + usageEstimateUid + '-' + usageEstimateMonth)) || 0);
      } catch { usageEstimateBytes = 0; }
      if (usageReportTimer) clearInterval(usageReportTimer);
      usageReportTimer = setInterval(() => { reportUsageEstimate(db, auth); }, 15 * 60 * 1000);
      report('online', 'FIREBASE ONLINE');
      log('Signed in anonymously. Firebase multiplayer is ready.');
      return playerId;
    } catch (error) {
      report('', 'CONNECTION FAILED');
      throw error;
    }
  }

  async function joinRoom(code, identity = {}, approved = false, isHost = false) {
    await assertMonthlyUsageAllowed();
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
    const leafblowerRef = ref(db, roomPath + '/leafblowers/' + playerId + '/leafblower');
    const worldStateRef = ref(db, roomPath + '/worldStates/' + playerId);
    lastWorldRevision = 0;
    lastWorldWrite = 0;
    lastWorldSignature = null;
    lastRopeWrite = 0;
    lastRopeSignature = null;
    lastCursorWriteAt = 0;
    lastCursorSignature = '';

    try {
      const hostResult = await runTransaction(hostRef, current => current || playerId);
      hostId = hostResult.snapshot.val() || playerId;

      await onDisconnect(presenceRef).remove();
      await onDisconnect(cursorRef).remove();
      await onDisconnect(worldStateRef).remove();
      await onDisconnect(leafblowerRef).remove();
      await set(presenceRef, {
        name: String(identity.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest',
        color: /^#[0-9a-f]{6}$/i.test(identity.color || '') ? identity.color : '#65d6ad',
        joinedAt: serverTimestamp()
      });

      stopWorld = onValue(ref(db, roomPath + '/worldStates'), snapshot => {
        // Only the elected host is allowed to drive the shared simulation.
        // Ignore stale checkpoints left by previous peers or older clients.
        const latest = snapshot.child(hostId || '__no_host__').val();
        if (!latest || latest.by !== hostId || !Number.isFinite(Number(latest.updatedAt))) return;
        const revision = Number(latest.updatedAt) || 0;
        if (revision <= lastWorldRevision) return;
        lastWorldRevision = revision;
        callbacks.onWorld?.(latest);
      }, error => log('World sync error: ' + error.message));

      stopRopes = onValue(ref(db, roomPath + '/ropeStates'), snapshot => {
        const state = snapshot.child(hostId || '__no_host__').val();
        if (!state || state.by !== hostId || !Array.isArray(state.ropes)) return;
        callbacks.onRopes?.(state);
      }, error => log('Rope sync error: ' + error.message));

      const operationsRef = ref(db, roomPath + '/operations');
      // Read only a bounded tail. Old operation history must never be downloaded in full.
      const operationQuery = query(operationsRef, limitToLast(25));
      const existingOperations = await get(operationQuery);
      const existingKeys = new Set(Object.keys(existingOperations.val() || {}));
      stopOperations = onChildAdded(operationQuery, snapshot => {
        if (existingKeys.has(snapshot.key)) {
          if (hostId === playerId) remove(snapshot.ref).catch(error => log('Operation cleanup failed: ' + error.message));
          return;
        }
        const operation = snapshot.val();
        if (operation && operation.by !== playerId) {
          if (operation.type === 'stroke' && typeof operation.pointsPacked === 'string') {
            try {
              const raw = atob(operation.pointsPacked);
              const points = [];
              for (let i = 0; i + 3 < raw.length; i += 4) {
                const x = raw.charCodeAt(i) | (raw.charCodeAt(i + 1) << 8);
                const y = raw.charCodeAt(i + 2) | (raw.charCodeAt(i + 3) << 8);
                points.push({ x: x / 4, y: y / 4 });
              }
              callbacks.onOperation?.({ ...operation, points });
            } catch (error) { log('Compressed edit could not be decoded: ' + error.message); }
          } else callbacks.onOperation?.(operation);
        }
        // Only the host removes processed operations. This keeps the shared queue tiny
        // while preserving the add event for every connected client.
        if (hostId === playerId) remove(snapshot.ref).catch(error => log('Operation cleanup failed: ' + error.message));
      }, error => log('Edit sync error: ' + error.message));

      // Cursor and continuous leafblower streams are intentionally not subscribed.
      // They create constant bandwidth use without changing the shared world state.

      stopPlayers = onValue(ref(db, roomPath + '/players'), async snapshot => {
        const people = snapshot.val() || {};
        callbacks.onPlayers?.(people);
        if (hostId === playerId) update(ref(db, 'lobbyDirectory/' + room), { players: Object.keys(people).length }).catch(() => {});
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
    await assertMonthlyUsageAllowed();
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
    // The directory already contains its player count. Avoid one extra read per
    // lobby every time the directory changes.
    return onValue(ref(db, 'lobbyDirectory'), snapshot => {
      const active = Object.values(snapshot.val() || {})
        .filter(lobby => lobby && typeof lobby.room === 'string')
        .slice(0, 20);
      callback(active.sort((a, b) => String(a.room).localeCompare(String(b.room))));
    }, error => log('Lobby gallery error: ' + error.message));
  }

  async function requestJoin(code, identity = {}) {
    await assertMonthlyUsageAllowed();
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
    const operationRoom = room;
    const send = () => {
      if (!db || !joined || room !== operationRoom) return;
      let payload = { ...operation, by: playerId, createdAt: serverTimestamp() };
      if (operation.type === 'stroke' && Array.isArray(operation.points)) {
        const bytes = new Uint8Array(operation.points.length * 4);
        for (let i = 0; i < operation.points.length; i++) {
          const x = Math.max(0, Math.min(65535, Math.round(operation.points[i].x * 4)));
          const y = Math.max(0, Math.min(65535, Math.round(operation.points[i].y * 4)));
          const offset = i * 4;
          bytes[offset] = x & 255; bytes[offset + 1] = x >>> 8;
          bytes[offset + 2] = y & 255; bytes[offset + 3] = y >>> 8;
        }
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
        delete payload.points;
        payload.pointsPacked = btoa(binary);
        payload.pointScale = 4;
      }
      push(ref(db, 'rooms/' + operationRoom + '/operations'), payload)
        .catch(error => log('Edit sync failed: ' + error.message));
    };

    // Send rope drag updates immediately. An artificial delay makes the
    // host simulate stale node positions and causes visible rope desync.
    send();
  }

  function publishLeafblower(state) {
    // Continuous forces are simulated locally; never stream their coordinates.
    return;
    if (!db || !joined || !room) return;
    const active = !!(state?.active && [state.x, state.y, state.dx, state.dy].every(Number.isFinite));
    const now = Date.now();
    if (active && now - lastLeafblowerWriteAt < 100) return;
    lastLeafblowerWriteAt = now;
    const payload = active
      ? { active: true, x: state.x, y: state.y, dx: state.dx, dy: state.dy, updatedAt: now }
      : { active: false, updatedAt: now };
    set(ref(db, 'rooms/' + room + '/leafblowers/' + playerId + '/leafblower'), payload)
      .catch(error => log('Leafblower sync failed: ' + error.message));
  }

  function updateIdentity(name, color) {
    if (!db || !joined || !presenceRef) return;
    const safeName = String(name || 'Lab guest').trim().slice(0, 20) || 'Lab guest';
    const safeColor = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#65d6ad';
    update(presenceRef, { name: safeName, color: safeColor }).catch(error => log('Profile update failed: ' + error.message));
  }

  function publishWorld(world) {
    if (!db || !joined || !room || hostId !== playerId || !world || typeof world.cells !== 'string') return;
    const now = Date.now();
    // Every peer predicts locally. A compact authoritative checkpoint is only
    // needed occasionally to correct drift, not ten full-world downloads/sec.
    if (now - lastWorldWrite < 30000) return;
    const signature = [world.canvasSize, world.width, world.height, world.gravity, world.ambient, world.cells].join('|');
    if (signature === lastWorldSignature) return;

    // Run-length encode the cell grid. Empty space and broad material regions
    // compress dramatically, keeping authoritative checkpoints inexpensive.
    const source = atob(world.cells);
    const encoded = new Uint8Array(source.length * 2);
    let encodedLength = 0;
    for (let i = 0; i < source.length;) {
      const material = source.charCodeAt(i);
      let count = 1;
      while (count < 255 && i + count < source.length && source.charCodeAt(i + count) === material) count++;
      encoded[encodedLength++] = count;
      encoded[encodedLength++] = material;
      i += count;
    }
    let cellData = world.cells;
    let rle = false;
    if (encodedLength < source.length) {
      let binary = '';
      for (let i = 0; i < encodedLength; i += 0x8000) {
        binary += String.fromCharCode(...encoded.subarray(i, Math.min(encodedLength, i + 0x8000)));
      }
      cellData = btoa(binary);
      rle = true;
    }
    const payload = {
      width: world.width,
      height: world.height,
      canvasSize: world.canvasSize,
      cells: cellData,
      packed: false,
      rle,
      gravity: world.gravity,
      ambient: world.ambient,
      by: playerId,
      updatedAt: now
    };
    lastWorldWrite = now;
    pendingWorld = { payload, signature };
    if (worldWriteInFlight) return;

    worldWriteInFlight = true;
    (async () => {
      try {
        while (pendingWorld && joined && room && hostId === playerId) {
          const latest = pendingWorld;
          pendingWorld = null;
          await set(ref(db, 'rooms/' + room + '/worldStates/' + playerId), latest.payload);
          lastWorldSignature = latest.signature;
        }
      } catch (error) {
        lastWorldWrite = 0;
        log('World sync failed: ' + error.message);
      } finally {
        worldWriteInFlight = false;
      }
    })();
  }

  function publishRopes(ropes) {
    if (!db || !joined || !room || hostId !== playerId) return;
    const signature = JSON.stringify(ropes);
    if (signature === lastRopeSignature) return;
    const now = Date.now();
    if (now - lastRopeWrite < 1000 / 10) return;
    lastRopeWrite = now;
    pendingRopes = { by: playerId, updatedAt: now, ropes };
    if (ropeWriteInFlight) return;
    ropeWriteInFlight = true;
    (async () => {
      try {
        while (pendingRopes && joined && room && hostId === playerId) {
          const latest = pendingRopes;
          pendingRopes = null;
          await set(ref(db, 'rooms/' + room + '/ropeStates/' + playerId), latest);
          lastRopeSignature = JSON.stringify(latest.ropes);
        }
      } catch (error) {
        log('Rope sync failed: ' + error.message);
      } finally {
        ropeWriteInFlight = false;
      }
    })();
  }

  function updateCursor(point, color, name) {
    // Cursor positions are local-only to keep idle and active traffic minimal.
    return;
    if (!db || !joined || !room || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const signature = [Math.round(point.x * 2), Math.round(point.y * 2), color, name].join('|');
    const now = Date.now();
    if (signature === lastCursorSignature || now - lastCursorWriteAt < 100) return;
    lastCursorSignature = signature;
    lastCursorWriteAt = now;
    update(ref(db, 'rooms/' + room + '/cursors/' + playerId), {
      x: point.x, y: point.y, color, name, updatedAt: now
    }).catch(() => {});
  }

  return {
    connect, joinRoom, createLobby, watchLobbies, requestJoin, getMonthlyUsageStatus, respondToJoinRequest, publishOperation, publishLeafblower, publishWorld, publishRopes, updateCursor, updateIdentity,
    get joined() { return joined; },
    get isHost() { return joined && hostId === playerId; },
    get playerId() { return playerId; },
    get room() { return room; }
  };
}
