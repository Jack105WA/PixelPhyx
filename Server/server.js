'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const WebSocket = require('ws');
const yaml = require('js-yaml');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config.yml');
const config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8')) || {};
const settings = {
  host: String(config.server?.bind || '0.0.0.0'),
  port: Math.max(1, Math.min(65535, Number(config.server?.port) || 3000)),
  maxPlayers: Math.max(1, Math.min(64, Number(config.server?.max_players) || 16)),
  lobbyCount: Math.max(1, Math.min(100, Number(config.server?.lobby_count) || 20)),
  name: String(config.server?.name || 'PixelPhyx Server').slice(0, 48),
  publicAddress: String(config.server?.public_address || '').trim(),
  heartbeatMs: Math.max(5000, Number(config.network?.heartbeat_ms) || 15000),
  snapshotIntervalMs: Math.max(100, Math.min(5000, Number(config.network?.snapshot_interval_ms) || 400)),
  ropeUpdateIntervalMs: Math.max(20, Math.min(1000, Number(config.network?.rope_update_interval_ms) || 50)),
  cursorUpdates: config.network?.cursor_updates !== false,
  cursorUpdateIntervalMs: Math.max(20, Math.min(500, Number(config.network?.cursor_update_interval_ms) || 40)),
  predictionEnabled: config.network?.prediction_enabled === true,
  snapshotChunkBytes: Math.max(4096, Math.min(64 * 1024, Number(config.network?.snapshot_chunk_bytes) || 24 * 1024)),
  maxSnapshotBytes: Math.max(1024 * 1024, Math.min(32 * 1024 * 1024, Number(config.network?.max_snapshot_bytes) || 8 * 1024 * 1024)),
  maxPayloadBytes: Math.max(65536, Math.min(32 * 1024 * 1024, Number(config.network?.max_payload_bytes) || 8 * 1024 * 1024)),
  maxBufferedBytes: Math.max(65536, Math.min(64 * 1024 * 1024, Number(config.network?.max_buffered_bytes) || 16 * 1024 * 1024))
};

const rooms = new Map();
const clients = new Map();
let nextPlayerNumber = 1;

function send(socket, type, data = {}) {
  if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > settings.maxBufferedBytes) return false;
  socket.send(JSON.stringify({ type, ...data }));
  return true;
}
function safeName(value) {
  return String(value || 'Lab guest').trim().slice(0, 20) || 'Lab guest';
}
function lobbyList() {
  return [...rooms.values()].filter(room => room.players.size > 0).slice(0, settings.lobbyCount)
    .map(room => ({ room: room.name, players: room.players.size, maxPlayers: room.maxPlayers, hostName: room.hostName, transport: 'local' }));
}
function broadcastLobbies() {
  const lobbies = lobbyList();
  for (const client of clients.values()) send(client.socket, 'lobbies', { lobbies });
}
function roomRoster(room) {
  return [...room.players.values()].map(player => ({
    number: player.number, name: player.name, color: player.color,
    clientId: player.id, approved: player.approved, isHost: player.id === room.hostId
  }));
}
function sendRoster(room) {
  const players = {};
  for (const p of room.players.values()) players[p.id] = {
    name: p.name, color: p.color, serverNumber: p.number,
    isHost: p.id === room.hostId, approved: p.approved
  };
  for (const p of room.players.values()) send(p.socket, 'roster', { players });
}
function removeFromRoom(client) {
  if (!client.room) return;
  const room = rooms.get(client.room);
  if (!room) { client.room = null; return; }
  room.players.delete(client.id);
  client.room = null;
  if (room.players.size === 0) rooms.delete(room.name);
  else {
    if (room.hostId === client.id) {
      const next = room.players.values().next().value;
      room.hostId = next.id;
      next.approved = true;
      const promoted = clients.get(next.id); if (promoted) promoted.approved = true;
      for (const p of room.players.values()) send(p.socket, 'host-changed', { hostId: room.hostId });
    }
    for (const p of room.players.values()) send(p.socket, 'player-left', { playerNumber: client.number });
    sendRoster(room);
  }
  broadcastLobbies();
}
function sendEvent(room, sender, event) {
  const targets = Array.isArray(event.targetPlayers) ? new Set(event.targetPlayers.map(Number)) : null;
  const receiver = event.receivers || 'all';
  for (const player of room.players.values()) {
    if (player.id === sender.id) continue;
    if (targets && !targets.has(player.number)) continue;
    if (receiver === 'masterClient' && player.id !== room.hostId) continue;
    if (receiver === 'others' || receiver === 'all' || receiver === 'masterClient' || targets) {
      send(player.socket, 'event', {
        senderNumber: sender.number, code: Number(event.code),
        data: event.data, reliable: event.reliable !== false
      });
    }
  }
}
function handle(client, message) {
  const room = client.room ? rooms.get(client.room) : null;
  switch (message.type) {
    case 'identity':
      client.name = safeName(message.name);
      client.color = /^#[0-9a-f]{6}$/i.test(message.color || '') ? message.color : '#65d6ad';
      if (room) { const p = room.players.get(client.id); if (p) Object.assign(p, { name: client.name, color: client.color }); sendRoster(room); }
      break;
    case 'create-room': {
      if (room) throw new Error('Leave your current server before creating another.');
      if (rooms.size >= settings.lobbyCount) throw new Error('This server has reached its lobby limit.');
      const name = 'PX-' + crypto.randomBytes(4).toString('hex').slice(0, 7).toUpperCase();
      const player = { id: client.id, number: nextPlayerNumber++, socket: client.socket, name: safeName(message.name), color: message.color || '#65d6ad', approved: true };
      client.approved = true;
      const created = { name, hostId: client.id, hostName: player.name, maxPlayers: settings.maxPlayers, players: new Map([[client.id, player]]) };
      rooms.set(name, created); client.room = name; client.number = player.number;
      send(client.socket, 'room-joined', { room: name, isHost: true, number: player.number, players: roomRoster(created) });
      broadcastLobbies(); break;
    }
    case 'join-room': {
      if (room) throw new Error('Leave your current server before joining another.');
      const target = rooms.get(String(message.room || '').toUpperCase());
      if (!target) throw new Error('Server not found. Check the server code and address.');
      if (target.players.size >= target.maxPlayers) throw new Error('This server is full.');
      if (target.players.has(client.id)) throw new Error('You are already in this server.');
      const player = { id: client.id, number: nextPlayerNumber++, socket: client.socket, name: safeName(message.name), color: message.color || '#65d6ad', approved: false };
      client.approved = false;
      target.players.set(client.id, player); client.room = target.name; client.number = player.number;
      send(client.socket, 'room-joined', { room: target.name, isHost: false, number: player.number, players: roomRoster(target) });
      for (const p of target.players.values()) if (p.id !== client.id) send(p.socket, 'player-joined', { player: { number: player.number, name: player.name, color: player.color, clientId: player.id, approved: false } });
      sendRoster(target); broadcastLobbies(); break;
    }
    case 'leave-room': removeFromRoom(client); send(client.socket, 'room-left'); break;
    case 'approve': {
      if (!room || room.hostId !== client.id) throw new Error('Only the server host can approve players.');
      const target = [...room.players.values()].find(p => p.number === Number(message.playerNumber));
      if (!target || target.id === client.id) throw new Error('That join request is no longer active.');
      target.approved = !!message.approved;
      const targetClient = clients.get(target.id); if (targetClient) targetClient.approved = target.approved;
      send(target.socket, 'join-reply', { approved: target.approved });
      if (!target.approved) { const targetClient = clients.get(target.id); if (targetClient) removeFromRoom(targetClient); }
      sendRoster(room); break;
    }
    case 'join-request': {
      if (!room) throw new Error('Join a server before requesting approval.');
      const host = room.players.get(room.hostId);
      if (!host) throw new Error('The server host is unavailable.');
      send(host.socket, 'join-request', { senderNumber: client.number, data: { clientId: client.id, name: client.name } });
      break;
    }
    case 'event':
      if (!room) return;
      if (Number(message.code) === 4) {
        if (!settings.cursorUpdates || !client.approved) return;
        const cursor = message.data || {};
        if (cursor.active === false) {
          sendEvent(room, client, { code: 4, data: { active: false }, reliable: false });
          return;
        }
        if (!Number.isFinite(cursor.x) || !Number.isFinite(cursor.y) ||
            cursor.x < 0 || cursor.y < 0 || cursor.x > 100000 || cursor.y > 100000) return;
        sendEvent(room, client, {
          code: 4,
          data: {
            x: cursor.x, y: cursor.y,
            color: /^#[0-9a-f]{6}$/i.test(cursor.color || '') ? cursor.color : '#65d6ad',
            name: safeName(cursor.name),
            active: true
          },
          reliable: false
        });
        return;
      }
      if (Number(message.code) === 6 && client.id === room.hostId) {
        const targetNumber = Array.isArray(message.targetPlayers) ? Number(message.targetPlayers[0]) : 0;
        const target = [...room.players.values()].find(player => player.number === targetNumber);
        if (!target || target.id === client.id) return;
        target.approved = !!message.data?.approved;
        const targetClient = clients.get(target.id);
        if (targetClient) targetClient.approved = target.approved;
        send(target.socket, 'join-reply', { approved: target.approved });
        if (!target.approved && targetClient) removeFromRoom(targetClient);
        else sendRoster(room);
        break;
      }
      if (!client.approved && client.id !== room.hostId) {
        if (Number(message.code) !== 5) return;
      }
      sendEvent(room, client, message);
      break;
    case 'sync-request':
      if (!room) return;
      const host = room.players.get(room.hostId);
      if (host && host.id !== client.id) send(host.socket, 'event', { senderNumber: client.number, code: 7, data: { clientId: client.id }, reliable: true });
      break;
    case 'ping': send(client.socket, 'pong'); break;
    case 'list': send(client.socket, 'lobbies', { lobbies: lobbyList() }); break;
    default: throw new Error('Unknown server message.');
  }
}
const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  if (pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ name: settings.name, status: 'online', rooms: rooms.size, players: clients.size }));
  }
  if (pathname === '/server-info') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ name: settings.name, port: settings.port, maxPlayers: settings.maxPlayers, lobbyCount: settings.lobbyCount, publicAddress: settings.publicAddress }));
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end('PixelPhyx multiplayer server is running. Connect your game client using WebSocket path /pixelphyx.');
});
const wss = new WebSocket.Server({ server, path: '/pixelphyx', maxPayload: settings.maxPayloadBytes });
wss.on('connection', socket => {
  const client = { id: crypto.randomUUID(), socket, name: 'Lab guest', color: '#65d6ad', room: null, number: 0, approved: false };
  clients.set(client.id, client);
  socket.on('message', raw => {
    try { handle(client, JSON.parse(raw.toString())); }
    catch (error) { send(socket, 'error', { message: error.message || 'Server error.' }); }
  });
  socket.on('close', () => { removeFromRoom(client); clients.delete(client.id); });
  socket.on('error', () => {});
  send(socket, 'welcome', {
    id: client.id, server: settings.name, maxPlayers: settings.maxPlayers, lobbyCount: settings.lobbyCount,
    network: {
      snapshotIntervalMs: settings.snapshotIntervalMs,
      ropeUpdateIntervalMs: settings.ropeUpdateIntervalMs,
      cursorUpdates: settings.cursorUpdates,
      cursorUpdateIntervalMs: settings.cursorUpdateIntervalMs,
      predictionEnabled: settings.predictionEnabled,
      snapshotChunkBytes: settings.snapshotChunkBytes,
      maxSnapshotBytes: settings.maxSnapshotBytes
    }
  });
  send(socket, 'lobbies', { lobbies: lobbyList() });
});
const heartbeat = setInterval(() => {
  for (const client of clients.values()) {
    if (client.socket.readyState === WebSocket.OPEN) send(client.socket, 'ping');
  }
}, settings.heartbeatMs);
wss.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error('');
    console.error('  ERROR: Port ' + settings.port + ' is already in use.');
    console.error('  Another server or application is already listening on this port.');
    console.error('  If PixelPhyx is already running, use that existing server window.');
    console.error('  Otherwise, find the process with:');
    console.error('    netstat -ano | findstr :' + settings.port);
    console.error('  Then stop the matching process in Task Manager, or change');
    console.error('  server.port in config.yml and update your port forwarding/client address.');
    console.error('');
    clearInterval(heartbeat);
    process.exitCode = 1;
    return;
  }
  console.error('WebSocket server error:', error.message || error);
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error('');
    console.error('  ERROR: Port ' + settings.port + ' is already in use.');
    console.error('  Another server or application is already listening on this port.');
    console.error('  If PixelPhyx is already running, use that existing server window.');
    console.error('  Otherwise, run: netstat -ano | findstr :' + settings.port);
    console.error('  Stop the process using that port, or change server.port in config.yml');
    console.error('  and update your router port forwarding and game server address.');
    console.error('');
    clearInterval(heartbeat);
    process.exitCode = 1;
    return;
  }
  console.error('HTTP server error:', error.message || error);
  clearInterval(heartbeat);
  process.exitCode = 1;
});
server.listen(settings.port, settings.host, () => {
  console.log('');
  console.log('  PixelPhyx Server');
  console.log('  ----------------');
  console.log('  Bind:       ' + settings.host);
  console.log('  Port:       ' + settings.port);
  const addresses = Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address);
  console.log('  WebSocket:  ws://localhost:' + settings.port + '/pixelphyx');
  for (const address of addresses) console.log('  LAN URL:    ws://' + address + ':' + settings.port + '/pixelphyx');
  console.log('  Max players per lobby: ' + settings.maxPlayers);
  console.log('  Lobby limit: ' + settings.lobbyCount);
  console.log('');
  console.log('  Forward TCP port ' + settings.port + ' on your router for internet access.');
  console.log('  Keep this window open while hosting.');
});
function shutdown() {
  clearInterval(heartbeat);
  for (const client of clients.values()) { send(client.socket, 'server-shutdown'); client.socket.close(); }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
