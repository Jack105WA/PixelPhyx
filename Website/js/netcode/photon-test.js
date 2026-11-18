import { createRealtimeClient, isRealtimeError } from 'https://esm.sh/@photonengine/realtime-core@6.0.2';

const APP_ID = 'a974c6dd-9d62-4359-bd08-90650e551d09';
const APP_VERSION = 'pixelphyx-photon-test-1';
const TEST_EVENT = 42;

const ui = {
  status: document.querySelector('#status'),
  statusText: document.querySelector('#statusText'),
  log: document.querySelector('#log'),
  roomCode: document.querySelector('#roomCode'),
  roomLabel: document.querySelector('#roomLabel'),
  players: document.querySelector('#players'),
  connect: document.querySelector('#connect'),
  disconnect: document.querySelector('#disconnect'),
  create: document.querySelector('#create'),
  join: document.querySelector('#join'),
  send: document.querySelector('#send')
};

let client = null;
let busy = false;

function log(message) {
  const stamp = new Date().toLocaleTimeString();
  ui.log.textContent += '\n[' + stamp + '] ' + message;
  ui.log.scrollTop = ui.log.scrollHeight;
}

function setStatus(state, message) {
  ui.status.className = 'status ' + state;
  ui.statusText.textContent = message;
}

function updateControls() {
  const connected = !!client?.isConnected;
  const inRoom = !!client?.room;
  ui.connect.disabled = busy || connected;
  ui.disconnect.disabled = busy || !client;
  ui.create.disabled = busy || !connected || inRoom;
  ui.join.disabled = busy || !connected || inRoom;
  ui.send.disabled = busy || !inRoom;
  ui.players.textContent = (client?.room?.playerCount || 0) + ' players';
  ui.roomLabel.textContent = client?.room
    ? 'ROOM · ' + client.room.name
    : 'No room joined';
}

async function connect() {
  if (client || busy) return;
  busy = true;
  updateControls();
  setStatus('', 'Connecting…');
  log('Loading Photon Realtime Core…');

  try {
    client = await createRealtimeClient({
      appId: APP_ID,
      appVersion: APP_VERSION,
      protocol: 'wss'
    });

    client.onEvent(TEST_EVENT, ({ senderNumber, data }) => {
      log('Event received from player #' + senderNumber + ': ' + JSON.stringify(data));
    });
    client.on('playerJoined', ({ player }) => {
      log('Player joined: #' + player.number + ' ' + (player.name || 'Guest'));
      updateControls();
    });
    client.on('playerLeft', ({ playerNumber }) => {
      log('Player left: #' + playerNumber);
      updateControls();
    });
    client.on('masterClientChanged', ({ newMasterNumber }) => {
      log('Master client is now player #' + newMasterNumber);
    });
    client.on('roomLeft', () => {
      log('Room left.');
      updateControls();
    });

    await client.connect();
    setStatus('online', 'Connected to Photon Cloud');
    log('Connected to Photon Cloud.');
  } catch (error) {
    setStatus('error', 'Connection failed');
    log((isRealtimeError(error) ? error.code + ': ' : '') + error.message);
    if (client) {
      client.dispose();
      client = null;
    }
  } finally {
    busy = false;
    updateControls();
  }
}

async function enterRoom(mode) {
  if (!client?.isConnected || busy || client.room) return;
  let code = ui.roomCode.value.trim().toUpperCase();
  if (!code && mode === 'create') {
    code = 'PX-' + crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    ui.roomCode.value = code;
  }
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    log('Room code must be 3–32 characters using letters, numbers, hyphens or underscores.');
    return;
  }

  busy = true;
  updateControls();
  try {
    const room = mode === 'create'
      ? await client.createRoom(code, { maxPlayers: 16, isVisible: false })
      : await client.joinRoom(code);
    ui.roomCode.value = room.name;
    setStatus('online', 'Connected · In room');
    log((mode === 'create' ? 'Created' : 'Joined') + ' room ' + room.name + '.');
  } catch (error) {
    log('Room ' + mode + ' failed: ' + (isRealtimeError(error) ? error.code + ': ' : '') + error.message);
  } finally {
    busy = false;
    updateControls();
  }
}

async function disconnect() {
  if (!client || busy) return;
  busy = true;
  updateControls();
  try {
    if (client.room) await client.leaveRoom();
    await client.disconnect();
    log('Disconnected from Photon.');
  } catch (error) {
    log('Disconnect warning: ' + error.message);
  } finally {
    client.dispose();
    client = null;
    busy = false;
    setStatus('', 'Disconnected');
    updateControls();
  }
}

ui.connect.addEventListener('click', connect);
ui.disconnect.addEventListener('click', disconnect);
ui.create.addEventListener('click', () => enterRoom('create'));
ui.join.addEventListener('click', () => enterRoom('join'));
ui.send.addEventListener('click', () => {
  if (!client?.room) return;
  const payload = { type: 'pixelphyx-test', sentAt: Date.now(), message: 'Photon event delivered' };
  client.sendEvent(TEST_EVENT, payload);
  log('Sent test event to other players.');
});

window.addEventListener('pagehide', () => {
  if (client) client.dispose();
});

updateControls();
