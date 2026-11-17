import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
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

// Approximate Realtime Database traffic from JSON payload sizes.
// These are estimates, not Firebase's official billable usage metrics.
let usageEstimateBytes = 0;
let usageEstimateMonthlyBytes = 0;
let usageEstimateUid = '';
let usageEstimateDay = '';
let usageEstimateMonth = '';
let usageReportTimer = null;
const usageStoragePrefix = 'pixelphyx-usage-estimate-v1-';
const usageDailyLimitBytes = 360_000_000;
const usageMonthlyLimitBytes = 10_000_000_000;

function currentUsageDay() {
  return new Date().toISOString().slice(0, 10);
}
function currentUsageMonth() {
  return new Date().toISOString().slice(0, 7);
}
function payloadBytes(value) {
  try { return new TextEncoder().encode(JSON.stringify(value ?? null)).length; }
  catch { return 0; }
}
function saveUsageEstimate() {
  if (!usageEstimateUid) return;
  try {
    if (usageEstimateDay) localStorage.setItem(usageStoragePrefix + usageEstimateUid + '-day-' + usageEstimateDay, String(usageEstimateBytes));
    if (usageEstimateMonth) localStorage.setItem(usageStoragePrefix + usageEstimateUid + '-month-' + usageEstimateMonth, String(usageEstimateMonthlyBytes));
  } catch {}
}
function recordUsage(value) {
  const bytes = payloadBytes(value);
  usageEstimateBytes += bytes;
  usageEstimateMonthlyBytes += bytes;
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
    day: usageEstimateDay,
    month: usageEstimateMonth,
    estimatedDailyBytes: Math.ceil(usageEstimateBytes * 1.5),
    estimatedMonthlyBytes: Math.ceil(usageEstimateMonthlyBytes * 1.5),
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
  let stopOperations = null, stopWorld = null, stopRopes = null, stopProps = null, stopPlayers = null, stopCursors = null, stopLeafblowers = null, stopHost = null;
  let cursorRef = null, lobbySlot = null, stopJoinRequests = null;
  let lastWorldWrite = 0, worldWriteInFlight = false, pendingWorld = null, lastWorldRevision = 0, lastWorldSignature = null;
  let lastRopeWrite = 0, ropeWriteInFlight = false, pendingRopes = null, lastRopeSignature = null;
  let lastPropsSignature = null;
  let lastCursorWriteAt = 0, lastCursorSignature = '', lastLeafblowerWriteAt = 0;
  let cachedUsageStatus = null, cachedUsageAt = 0;
  const USAGE_LIMIT_PERCENT = 90;
  let rtcMode = false;
  let rtcPeople = {};
  let rtcRoomPath = '';
  let rtcRoomListener = null;
  let rtcRoomPeers = new Map();
  let rtcPendingMessages = new Map();
  let lastLanWorld = null;
  let lastLanRopes = null;
  const rtcTransfers = new Map();

  async function getUsageStatus(force = false) {
    if (!db || !auth?.currentUser) throw new Error('Firebase authentication is not ready');
    const now = Date.now();
    if (!force && cachedUsageStatus && now - cachedUsageAt < 30000) return cachedUsageStatus;
    const day = currentUsageDay();
    const month = currentUsageMonth();
    if (usageEstimateUid !== auth.currentUser.uid) {
      usageEstimateUid = auth.currentUser.uid;
      usageEstimateDay = '';
      usageEstimateMonth = '';
    }
    if (usageEstimateDay !== day) {
      usageEstimateDay = day;
      try {
        usageEstimateBytes = Math.max(0, Number(localStorage.getItem(usageStoragePrefix + usageEstimateUid + '-day-' + day)) || 0);
      } catch { usageEstimateBytes = 0; }
    }
    if (usageEstimateMonth !== month) {
      usageEstimateMonth = month;
      try {
        usageEstimateMonthlyBytes = Math.max(0, Number(localStorage.getItem(usageStoragePrefix + usageEstimateUid + '-month-' + month)) || 0);
      } catch { usageEstimateMonthlyBytes = 0; }
    }
    await reportUsageEstimate(db, auth);
    // Read two compact aggregates instead of downloading every player's report.
    const [dailySnapshot, monthlySnapshot] = await Promise.all([
      get(ref(db, 'serviceStatus/bandwidth/daily/' + day)),
      get(ref(db, 'serviceStatus/bandwidth/monthly/' + month))
    ]);
    const dailyBytes = Math.max(0, Number(dailySnapshot.val()?.estimatedBytes) || 0);
    const monthlyBytes = Math.max(0, Number(monthlySnapshot.val()?.estimatedBytes) || 0);
    const dailyPercent = Math.min(100, Math.max(0, dailyBytes / usageDailyLimitBytes * 100));
    const monthlyPercent = Math.min(100, Math.max(0, monthlyBytes / usageMonthlyLimitBytes * 100));
    cachedUsageAt = now;
    cachedUsageStatus = {
      daily: {
        percent: Number(dailyPercent.toFixed(2)),
        limitBytes: usageDailyLimitBytes,
        estimatedBytes: Math.round(dailyBytes),
        blocked: dailyPercent >= USAGE_LIMIT_PERCENT
      },
      monthly: {
        percent: Number(monthlyPercent.toFixed(2)),
        limitBytes: usageMonthlyLimitBytes,
        estimatedBytes: Math.round(monthlyBytes),
        blocked: monthlyPercent >= USAGE_LIMIT_PERCENT
      },
      blocked: dailyPercent >= USAGE_LIMIT_PERCENT || monthlyPercent >= USAGE_LIMIT_PERCENT,
      limit: USAGE_LIMIT_PERCENT,
      updatedAt: new Date().toISOString(),
      source: 'Client-side traffic estimate'
    };
    return cachedUsageStatus;
  }

  async function assertUsageAllowed() {
    const status = await getUsageStatus();
    if (status.daily.blocked) throw new Error('Online is disabled because estimated daily bandwidth reached the 90% safety limit.');
    if (status.monthly.blocked) throw new Error('Online is disabled because estimated monthly bandwidth reached the 90% safety limit.');
    return status;
  }

  const report = (state, label) => callbacks.onStatus?.(state, label);
  const log = message => callbacks.onLog?.(message);
  function stopListeners() {
    stopOperations?.(); stopOperations = null;
    stopWorld?.(); stopWorld = null;
    stopRopes?.(); stopRopes = null;
    stopProps?.(); stopProps = null;
    stopPlayers?.(); stopPlayers = null;
    stopHost?.(); stopHost = null;
    stopCursors?.(); stopCursors = null;
    stopLeafblowers?.(); stopLeafblowers = null;
    stopJoinRequests?.(); stopJoinRequests = null;
    stopRtcRoom();
  }

  function stopRtcRoom() {
    rtcRoomListener?.(); rtcRoomListener = null;
    for (const peer of rtcRoomPeers.values()) {
      peer.stopSignal?.(); peer.stopCandidates?.();
      try { peer.channel?.close(); } catch {}
      try { peer.connection?.close(); } catch {}
    }
    rtcRoomPeers.clear();
    rtcPendingMessages.clear();
    rtcTransfers.clear();
    rtcRoomPath = '';
  }

  function rtcPairKey(remoteId) {
    return [playerId, remoteId].sort().join('--');
  }

  function rtcSendTo(remoteId, type, data) {
    const peer = rtcRoomPeers.get(remoteId);
    if (!peer || peer.channel?.readyState !== 'open' || (type === 'operation' && !peer.ready)) {
      const queue = peer ? peer.pendingMessages : (rtcPendingMessages.get(remoteId) || []);
      if (queue.length < 500) queue.push({ type, data });
      if (!peer) rtcPendingMessages.set(remoteId, queue);
      return false;
    }
    const body = JSON.stringify({ type, data });
    const chunkSize = 24000;
    if (body.length <= chunkSize) {
      try { peer.channel.send(body); return true; } catch { return false; }
    }
    const transfer = secureRandomString(12);
    const total = Math.ceil(body.length / chunkSize);
    for (let index = 0; index < total; index++) {
      try {
        peer.channel.send(JSON.stringify({
          type: '__chunk', transfer, index, total,
          part: body.slice(index * chunkSize, (index + 1) * chunkSize)
        }));
      } catch (error) { log('LAN transfer failed: ' + error.message); return false; }
    }
    return true;
  }

  function flushRtcMessages(remoteId, peer) {
    if (!peer?.ready || peer.channel?.readyState !== 'open') return;
    const pending = peer.pendingMessages.splice(0);
    for (const message of pending) rtcSendTo(remoteId, message.type, message.data);
  }

  function completeRtcHandshake(remoteId, peer) {
    if (hostId === playerId || peer.ready || !peer.gotWorld || !peer.gotRopes) return;
    peer.ready = true;
    flushRtcMessages(remoteId, peer);
    rtcSendTo(remoteId, 'ready', null);
  }

  function rtcBroadcast(type, data, exceptId = '') {
    for (const remoteId of rtcRoomPeers.keys()) {
      if (remoteId !== exceptId) rtcSendTo(remoteId, type, data);
    }
  }

  function decodeRtcOperation(operation) {
    if (operation?.type === 'stroke' && typeof operation.pointsPacked === 'string') {
      try {
        const raw = atob(operation.pointsPacked);
        const points = [];
        for (let i = 0; i + 3 < raw.length; i += 4) {
          const x = raw.charCodeAt(i) | (raw.charCodeAt(i + 1) << 8);
          const y = raw.charCodeAt(i + 2) | (raw.charCodeAt(i + 3) << 8);
          points.push({ x: x / 4, y: y / 4 });
        }
        return { ...operation, points };
      } catch (error) { log('Compressed LAN edit could not be decoded: ' + error.message); return null; }
    }
    return operation;
  }

  function handleRtcMessage(remoteId, raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message?.type === '__chunk') {
      if (!Number.isInteger(message.index) || !Number.isInteger(message.total) || message.total < 1 || message.total > 1000 || typeof message.part !== 'string') return;
      let transfer = rtcTransfers.get(message.transfer);
      if (!transfer) {
        if (rtcTransfers.size >= 10) rtcTransfers.delete(rtcTransfers.keys().next().value);
        transfer = { parts: new Array(message.total), received: 0 };
        rtcTransfers.set(message.transfer, transfer);
      }
      if (transfer.parts.length !== message.total || transfer.parts[message.index] !== undefined) return;
      transfer.parts[message.index] = message.part;
      transfer.received++;
      if (transfer.received === message.total) {
        rtcTransfers.delete(message.transfer);
        handleRtcMessage(remoteId, transfer.parts.join(''));
      }
      return;
    }
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'props' && hostId !== playerId) {
      if (message.data?.by === hostId && Array.isArray(message.data.items)) callbacks.onOperation?.({ type: 'props', items: message.data.items, by: hostId });
    } else if (message.type === 'ready' && hostId === playerId) {
      const peer = rtcRoomPeers.get(remoteId);
      if (peer) { peer.ready = true; flushRtcMessages(remoteId, peer); }
    } else if (message.type === 'operation') {
      const operation = decodeRtcOperation(message.data);
      if (!operation || operation.by === playerId) return;
      callbacks.onOperation?.(operation);
      if (hostId === playerId) rtcBroadcast('operation', operation, remoteId);
    } else if (message.type === 'world' && hostId !== playerId) {
      const peer = rtcRoomPeers.get(remoteId);
      if (message.data?.by === hostId) { const applied = callbacks.onWorld?.(message.data); if (peer && applied !== false) { peer.gotWorld = true; completeRtcHandshake(remoteId, peer); } }
    } else if (message.type === 'ropes' && hostId !== playerId) {
      const peer = rtcRoomPeers.get(remoteId);
      if (message.data?.by === hostId && Array.isArray(message.data.ropes)) { callbacks.onRopes?.(message.data); if (peer) { peer.gotRopes = true; completeRtcHandshake(remoteId, peer); } }
    }
  }

  function attachRtcChannel(remoteId, peer, channel) {
    peer.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      log('Direct LAN link established with ' + (rtcPeople[remoteId]?.name || 'a peer'));
      if (hostId === playerId) {
        const world = callbacks.getWorld?.() || lastLanWorld;
        const ropes = callbacks.getRopes?.() || lastLanRopes;
        if (world) {
          world.by = playerId;
          lastLanWorld = world;
          rtcSendTo(remoteId, 'world', world);
        }
        if (ropes) {
          ropes.by = playerId;
          lastLanRopes = ropes;
          rtcSendTo(remoteId, 'ropes', ropes);
        }
        const props = callbacks.getProps?.();
        if (Array.isArray(props)) rtcSendTo(remoteId, 'props', { by: playerId, items: props });
      } else {
        peer.pendingMessages = peer.pendingMessages.filter(message => message.type === 'operation');
      }
    };
    channel.onmessage = event => handleRtcMessage(remoteId, event.data);
    channel.onclose = () => log('Direct LAN link closed with ' + (rtcPeople[remoteId]?.name || 'a peer'));
    channel.onerror = () => log('Direct LAN link error with ' + (rtcPeople[remoteId]?.name || 'a peer'));
  }

  function startRtcPeer(remoteId) {
    if (!rtcMode || !joined || !remoteId || remoteId === playerId || rtcRoomPeers.has(remoteId) || !rtcRoomPath) return;
    const pairPath = rtcRoomPath + '/' + rtcPairKey(remoteId);
    const initiator = playerId.localeCompare(remoteId) < 0;
    const connection = new RTCPeerConnection({ iceServers: [] });
    const peer = { connection, channel: null, stopSignal: null, stopCandidates: null, pendingCandidates: [], remoteDescriptionSet: false, pendingMessages: rtcPendingMessages.get(remoteId) || [], ready: false, gotWorld: false, gotRopes: false };
    rtcPendingMessages.delete(remoteId);
    rtcRoomPeers.set(remoteId, peer);
    const ownCandidates = ref(db, pairPath + '/candidates/' + playerId);
    const remoteCandidates = ref(db, pairPath + '/candidates/' + remoteId);
    connection.onicecandidate = event => {
      if (event.candidate) {
        const candidate = event.candidate.toJSON();
        recordUsage(candidate);
        push(ownCandidates, candidate).catch(error => log('LAN signaling failed: ' + error.message));
      }
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        peer.stopSignal?.(); peer.stopCandidates?.();
        try { peer.channel?.close(); } catch {}
        try { connection.close(); } catch {}
        rtcRoomPeers.delete(remoteId);
        rtcPendingMessages.delete(remoteId);
        if (connection.connectionState === 'failed') {
          log('LAN connection failed. Check that both devices allow WebRTC/local network traffic.');
          setTimeout(() => {
            if (rtcMode && joined && rtcPeople[remoteId] && !rtcRoomPeers.has(remoteId)) startRtcPeer(remoteId);
          }, 2500);
        }
      }
    };
    if (initiator) attachRtcChannel(remoteId, peer, connection.createDataChannel('pixelphyx', { ordered: true }));
    else connection.ondatachannel = event => attachRtcChannel(remoteId, peer, event.channel);

    peer.stopCandidates = onChildAdded(remoteCandidates, snapshot => {
      const candidate = snapshot.val();
      if (!candidate) return;
      if (peer.remoteDescriptionSet) connection.addIceCandidate(candidate).catch(() => {});
      else peer.pendingCandidates.push(candidate);
    }, error => log('LAN candidate signaling failed: ' + error.message));

    let handlingSignal = false;
    peer.stopSignal = onValue(ref(db, pairPath), snapshot => {
      const signal = snapshot.val();
      if (!signal || handlingSignal) return;
      handlingSignal = true;
      (async () => {
        try {
          if (initiator && signal.answer && !connection.currentRemoteDescription) {
            await connection.setRemoteDescription(signal.answer);
            peer.remoteDescriptionSet = true;
            for (const candidate of peer.pendingCandidates.splice(0)) connection.addIceCandidate(candidate).catch(() => {});
          } else if (!initiator && signal.offer && !connection.currentRemoteDescription) {
            await connection.setRemoteDescription(signal.offer);
            peer.remoteDescriptionSet = true;
            for (const candidate of peer.pendingCandidates.splice(0)) connection.addIceCandidate(candidate).catch(() => {});
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await set(ref(db, pairPath + '/answer'), { type: answer.type, sdp: answer.sdp });
          }
        } catch (error) { log('LAN negotiation failed: ' + error.message); }
        finally { handlingSignal = false; }
      })();
    }, error => log('LAN signaling listener failed: ' + error.message));

    if (initiator) {
      (async () => {
        try {
          await set(ref(db, pairPath), null);
          await set(ownCandidates, null);
          const offer = await connection.createOffer();
          await connection.setLocalDescription(offer);
          await update(ref(db, pairPath), { offer: { type: offer.type, sdp: offer.sdp }, createdAt: Date.now() });
        } catch (error) { log('Could not start LAN connection: ' + error.message); }
      })();
    }
  }

  function reconcileRtcPeers(people = rtcPeople) {
    if (!rtcMode || !joined || !hostId) return;
    const wanted = hostId === playerId
      ? Object.keys(people).filter(id => id !== playerId)
      : (people[hostId] ? [hostId] : []);
    for (const id of wanted) startRtcPeer(id);
    for (const [id, peer] of rtcRoomPeers) {
      if (!wanted.includes(id)) {
        peer.stopSignal?.(); peer.stopCandidates?.();
        try { peer.channel?.close(); } catch {}
        try { peer.connection?.close(); } catch {}
        rtcRoomPeers.delete(id);
        rtcPendingMessages.delete(id);
      }
    }
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
      const sameProject = app &&
        app.options.apiKey === config.apiKey &&
        app.options.projectId === config.projectId &&
        app.options.databaseURL === config.databaseURL;
      if (app && !sameProject) {
        if (joined) throw new Error('Leave your current server before switching Firebase projects.');
        stopListeners();
        if (usageReportTimer) clearInterval(usageReportTimer);
        usageReportTimer = null;
        await deleteApp(app);
        app = null; db = null; auth = null;
        room = ''; hostId = null; presenceRef = null; lobbySlot = null;
        rtcMode = false; cachedUsageStatus = null; cachedUsageAt = 0;
      }
      if (!app) {
        app = initializeApp(config);
        db = getDatabase(app);
        auth = getAuth(app);
      }
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          if (error?.code === 'auth/configuration-not-found') {
            throw new Error('This Firebase project has not finished setting up Firebase Authentication. Open Firebase Console → Authentication → Get started, then enable the Anonymous sign-in provider. Confirm the web app API key and project ID belong to this same project.');
          }
          if (error?.code === 'auth/operation-not-allowed') {
            throw new Error('Anonymous sign-in is disabled for this Firebase project. Open Firebase Console → Authentication → Sign-in method and enable Anonymous.');
          }
          throw error;
        }
      }
      playerId = auth.currentUser.uid;
      usageEstimateUid = playerId;
      usageEstimateDay = currentUsageDay();
      usageEstimateMonth = currentUsageMonth();
      try {
        usageEstimateBytes = Math.max(0, Number(localStorage.getItem(usageStoragePrefix + usageEstimateUid + '-day-' + usageEstimateDay)) || 0);
        usageEstimateMonthlyBytes = Math.max(0, Number(localStorage.getItem(usageStoragePrefix + usageEstimateUid + '-month-' + usageEstimateMonth)) || 0);
      } catch { usageEstimateBytes = 0; usageEstimateMonthlyBytes = 0; }
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

  async function joinRoom(code, identity = {}, approved = false, isHost = false, options = {}) {
    await assertUsageAllowed();
    if (options.lan && typeof RTCPeerConnection === 'undefined') throw new Error('LAN Multiplayer requires a browser with WebRTC support.');
    if (!db || !auth?.currentUser) throw new Error('Firebase authentication is not ready');
    const nextRoom = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
    if (!nextRoom) throw new Error('Enter a room code');
    const cleanupSnapshot = await get(ref(db, 'rooms/' + nextRoom + '/cleanup'));
    if (cleanupSnapshot.exists()) throw new Error('That server is currently being cleaned up. Create or join another server.');
    const transportRef = ref(db, 'rooms/' + nextRoom + '/transport');
    if (isHost) await set(transportRef, options.lan ? 'webrtc' : 'firebase');
    const transportSnapshot = await get(transportRef);
    const useRtc = transportSnapshot.val() === 'webrtc';
    if (useRtc && typeof RTCPeerConnection === 'undefined') throw new Error('This server uses LAN Multiplayer, which requires browser WebRTC support.');
    if (!approved && !isHost) throw new Error('This lobby requires host approval. Request to join from the lobby gallery.');
    if (joined && room === nextRoom) return;

    stopListeners();
    joined = false;
    rtcMode = useRtc;
    if (rtcMode) log('LAN transport selected. Firebase is used only for lobby discovery and WebRTC signaling.');
    rtcPeople = {};
    lastLanWorld = null;
    lastLanRopes = null;
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
      if (rtcMode) reconcileRtcPeers(rtcPeople);
    }, error => log('Host sync error: ' + error.message));
    presenceRef = ref(db, roomPath + '/players/' + playerId);
    cursorRef = ref(db, roomPath + '/cursors/' + playerId);
    const leafblowerRef = ref(db, roomPath + '/leafblowers/' + playerId + '/leafblower');
    const worldStateRef = ref(db, roomPath + '/worldStates/' + playerId);
    const propStateRef = ref(db, roomPath + '/propStates/' + playerId);
    lastWorldRevision = 0;
    lastWorldWrite = 0;
    lastWorldSignature = null;
    lastRopeWrite = 0;
    lastRopeSignature = null;
    lastPropsSignature = null;
    lastCursorWriteAt = 0;
    lastCursorSignature = '';

    try {
      const hostResult = await runTransaction(hostRef, current => current || playerId);
      hostId = hostResult.snapshot.val() || playerId;

      const cleanupCheck = await get(ref(db, roomPath + '/cleanup'));
      if (cleanupCheck.exists()) throw new Error('That server is being deleted because it is empty. Please try again.');
      await onDisconnect(presenceRef).remove();
      await onDisconnect(cursorRef).remove();
      await onDisconnect(worldStateRef).remove();
      await onDisconnect(propStateRef).remove();
      await onDisconnect(leafblowerRef).remove();
      await set(presenceRef, {
        name: String(identity.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest',
        color: /^#[0-9a-f]{6}$/i.test(identity.color || '') ? identity.color : '#65d6ad',
        joinedAt: serverTimestamp()
      });

      if (!rtcMode) stopWorld = onValue(ref(db, roomPath + '/worldStates'), snapshot => {
        // Only the elected host is allowed to drive the shared simulation.
        // Ignore stale checkpoints left by previous peers or older clients.
        const latest = snapshot.child(hostId || '__no_host__').val();
        if (!latest || latest.by !== hostId || !Number.isFinite(Number(latest.updatedAt))) return;
        const revision = Number(latest.updatedAt) || 0;
        if (revision <= lastWorldRevision) return;
        lastWorldRevision = revision;
        callbacks.onWorld?.(latest);
      }, error => log('World sync error: ' + error.message));

      if (!rtcMode) stopRopes = onValue(ref(db, roomPath + '/ropeStates'), snapshot => {
        const state = snapshot.child(hostId || '__no_host__').val();
        if (!state || state.by !== hostId || !Array.isArray(state.ropes)) return;
        callbacks.onRopes?.(state);
      }, error => log('Rope sync error: ' + error.message));

      if (!rtcMode) stopProps = onValue(ref(db, roomPath + '/propStates'), snapshot => {
        const state = snapshot.child(hostId || '__no_host__').val();
        if (!state || state.by !== hostId || !Array.isArray(state.items)) return;
        callbacks.onOperation?.({ type: 'props', items: state.items, by: hostId });
      }, error => log('Prop sync error: ' + error.message));

      if (!rtcMode) {
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
      }

      // Cursor and continuous leafblower streams are intentionally not subscribed.
      // They create constant bandwidth use without changing the shared world state.

      stopPlayers = onValue(ref(db, roomPath + '/players'), async snapshot => {
        const people = snapshot.val() || {};
        rtcPeople = people;
        callbacks.onPlayers?.(people);
        if (rtcMode) reconcileRtcPeers(people);
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
          if (rtcMode) reconcileRtcPeers(people);
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
      if (rtcMode) {
        rtcRoomPath = roomPath + '/rtc';
        reconcileRtcPeers(rtcPeople);
      }
      // Seed every room immediately so late joiners never start from an empty world.
      if (hostId === playerId) {
        const initialWorld = callbacks.getWorld?.();
        if (initialWorld) publishWorld(initialWorld, true);
        const initialRopes = callbacks.getRopes?.();
        if (Array.isArray(initialRopes?.ropes)) publishRopes(initialRopes.ropes);
        const initialProps = callbacks.getProps?.();
        if (Array.isArray(initialProps)) publishProps(initialProps);
      }
      report('online', rtcMode ? 'LAN P2P' : 'ROOM ONLINE');
      log('Connected to room ' + room + (hostId === playerId ? ' as host' : ''));
    } catch (error) {
      joined = false;
      stopRtcRoom();
      report('', 'ROOM ERROR');
      throw error;
    }
  }


  async function createLobby(identity = {}, options = {}) {
    await assertUsageAllowed();
    if (!db || !auth?.currentUser) throw new Error('Firebase authentication is not ready');
    const safeName = String(identity.name || 'Lab guest').trim().slice(0, 20) || 'Lab guest';
    // LAN rooms are registered for cleanup but remain hidden from the public
    // gallery and never reserve one of the 20 standard lobby slots.
    if (options.lan) {
      if (typeof RTCPeerConnection === 'undefined') throw new Error('LAN Multiplayer requires WebRTC support.');
      const code = 'LAN-' + secureRandomString(8).toUpperCase();
      await joinRoom(code, identity, true, true, options);
      await set(ref(db, 'lobbyDirectory/' + code), {
        room: code, hostId: playerId, hostName: safeName,
        players: 1, transport: 'webrtc', createdAt: Date.now()
      });
      return code;
    }

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
      await joinRoom(reserved.code, identity, true, true, options);
      lobbySlot = reserved.slot;
      await set(ref(db, 'lobbyDirectory/' + reserved.code), {
        room: reserved.code, slot: reserved.slot, hostId: playerId, hostName: safeName,
        players: 1, transport: options.lan ? 'webrtc' : 'firebase', createdAt: serverTimestamp()
      });
      return reserved.code;
    } catch (error) {
      await remove(ref(db, 'lobbySlots/' + reserved.slot)).catch(() => {});
      await remove(ref(db, 'rooms/' + reserved.code)).catch(() => {});
      throw error;
    }
  }

  let cleanupInProgress = false;
  async function cleanupEmptyLobbies(directoryData) {
    if (!db || !auth?.currentUser || cleanupInProgress || !directoryData) return;
    cleanupInProgress = true;
    try {
      // Reuse the Online tab's existing directory snapshot. Do not download
      // the whole lobby directory again during each periodic cleanup scan.
      const entries = Object.values(directoryData)
        .filter(entry => entry && typeof entry.room === 'string')
        .slice(0, 100);

      for (const entry of entries) {
      const roomId = entry.room;
      if (!/^(PX-|LAN-)[A-Z0-9-]{4,22}$/.test(roomId)) continue;
      const roomRef = ref(db, 'rooms/' + roomId);
      const playersRef = ref(db, 'rooms/' + roomId + '/players');
      const cleanupRef = ref(db, 'rooms/' + roomId + '/cleanup');

      try {
        const firstCheck = await get(playersRef);
        if (firstCheck.exists() && Object.keys(firstCheck.val() || {}).length) continue;

        // Mark the room as closing so new joiners cannot race the deletion.
        const cleanupToken = playerId + '-' + Date.now() + '-' + secureRandomString(6);
        await set(cleanupRef, cleanupToken);
        await new Promise(resolve => setTimeout(resolve, 3000));

        const [playersCheck, tokenCheck] = await Promise.all([
          get(playersRef),
          get(cleanupRef)
        ]);
        if (tokenCheck.val() !== cleanupToken) continue;
        if (playersCheck.exists() && Object.keys(playersCheck.val() || {}).length) {
          await remove(cleanupRef).catch(() => {});
          continue;
        }

        // Only this online-tab cleanup path removes room data. A join attempt
        // sees the cleanup marker and is rejected before writing presence.
        await remove(roomRef);
        await remove(ref(db, 'lobbyDirectory/' + roomId)).catch(() => {});

        if (!roomId.startsWith('LAN-')) {
          const slotsSnapshot = await get(ref(db, 'lobbySlots'));
          const slots = slotsSnapshot.val() || {};
          const matching = Object.entries(slots).filter(([, value]) => value?.room === roomId);
          await Promise.all(matching.map(([slot]) =>
            remove(ref(db, 'lobbySlots/' + slot)).catch(() => {})
          ));
        }
        log('Removed empty server ' + roomId);
      } catch (error) {
        log('Could not clean empty server ' + roomId + ': ' + error.message);
      }
      }
    } finally {
      cleanupInProgress = false;
    }
  }

  function watchLobbies(callback) {
    if (!db) throw new Error('Firebase is not connected');
    let cleanupChecked = false;
    // Run one cleanup pass from the initial directory snapshot only.
    // Later directory updates refresh the gallery but never start another scan.
    const stopDirectory = onValue(ref(db, 'lobbyDirectory'), snapshot => {
      const directoryData = snapshot.val() || {};
      if (!cleanupChecked) {
        cleanupChecked = true;
        cleanupEmptyLobbies(directoryData);
      }
      const active = Object.values(directoryData)
        .filter(lobby => lobby && typeof lobby.room === 'string' && lobby.transport !== 'webrtc')
        .slice(0, 20);
      callback(active.sort((a, b) => String(a.room).localeCompare(String(b.room))));
    }, error => log('Lobby gallery error: ' + error.message));
    return stopDirectory;
  }

  async function requestJoin(code, identity = {}) {
    await assertUsageAllowed();
    if (!db || !auth?.currentUser) throw new Error('Firebase authentication is not ready');
    const safeCode = String(code || '').trim().toUpperCase();
    const lobbySnap = await get(ref(db, 'lobbyDirectory/' + safeCode));
    const roomTransport = lobbySnap.exists()
      ? lobbySnap.val()?.transport
      : (await get(ref(db, 'rooms/' + safeCode + '/transport'))).val();
    if (!lobbySnap.exists() && roomTransport !== 'webrtc') throw new Error('That lobby is no longer available');
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
      let payload = { ...operation, by: playerId, createdAt: rtcMode ? Date.now() : serverTimestamp() };
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
      if (rtcMode) {
        if (hostId === playerId) rtcBroadcast('operation', payload);
        else rtcSendTo(hostId, 'operation', payload);
      } else {
        push(ref(db, 'rooms/' + operationRoom + '/operations'), payload)
          .catch(error => log('Edit sync failed: ' + error.message));
      }
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

  function publishWorld(world, force = false) {
    if (!db || !joined || !room || hostId !== playerId || !world || typeof world.cells !== 'string') return;
    const now = Date.now();
    // Full snapshots are recovery checkpoints, not per-frame traffic.
    if (!force && now - lastWorldWrite < 5000) return;
    const signature = [world.canvasSize, world.width, world.height, world.gravity, world.ambient, world.cells].join('|');
    if (!force && signature === lastWorldSignature && !rtcMode) return;

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
      moves: Array.isArray(world.moves) ? world.moves : [],
      airborne: Array.isArray(world.airborne) ? world.airborne : [],
      materialState: world.materialState || null,
      gravity: world.gravity,
      ambient: world.ambient,
      by: playerId,
      updatedAt: now
    };
    lastWorldWrite = now;
    if (rtcMode) {
      lastLanWorld = payload;
      lastWorldSignature = signature;
      rtcBroadcast('world', payload);
      return;
    }
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

  function publishProps(items) {
    if (!db || !joined || !room || hostId !== playerId || !Array.isArray(items)) return;
    const signature = JSON.stringify(items);
    if (signature === lastPropsSignature) return;
    lastPropsSignature = signature;
    const payload = { by: playerId, updatedAt: Date.now(), items };
    if (rtcMode) {
      rtcBroadcast('props', payload);
      return;
    }
    set(ref(db, 'rooms/' + room + '/propStates/' + playerId), payload)
      .catch(error => log('Prop sync failed: ' + error.message));
  }

  function publishRopes(ropes) {
    if (!db || !joined || !room || hostId !== playerId) return;
    const signature = JSON.stringify(ropes);
    if (signature === lastRopeSignature) return;
    const now = Date.now();
    if (now - lastRopeWrite < 1000 / 10) return;
    lastRopeWrite = now;
    pendingRopes = { by: playerId, updatedAt: now, ropes };
    if (rtcMode) {
      lastLanRopes = pendingRopes;
      lastRopeSignature = signature;
      rtcBroadcast('ropes', pendingRopes);
      return;
    }
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
    connect, joinRoom, createLobby, watchLobbies, requestJoin, getUsageStatus, respondToJoinRequest, publishOperation, publishLeafblower, publishWorld, publishRopes, publishProps, updateCursor, updateIdentity,
    get lanMode() { return rtcMode; },
    get joined() { return joined; },
    get isHost() { return joined && hostId === playerId; },
    get playerId() { return playerId; },
    get room() { return room; }
  };
}
