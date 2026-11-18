'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const yaml = require('js-yaml');
const { downloadWebsite } = require('./download-website');

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

const WEBSITE_ROOT = path.join(ROOT, 'Website');
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const simulations = new Map();
const rooms = new Map();
const clients = new Map();
let nextPlayerNumber = 1;


function findBrowser() {
  const envPath = process.env.PIXELPHYX_BROWSER_PATH || process.env.PIXELPHYX_CHROME_PATH || process.env.CHROME_PATH;
  const candidates = [
    envPath && { executable: envPath, engine: process.env.PIXELPHYX_BROWSER_ENGINE || 'chromium', name: 'custom browser' },
    process.env.PROGRAMFILES && { executable: path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe'), engine:'chromium', name:'Google Chrome' },
    process.env['PROGRAMFILES(X86)'] && { executable: path.join(process.env['PROGRAMFILES(X86)'],'Google/Chrome/Application/chrome.exe'), engine:'chromium', name:'Google Chrome' },
    process.env.LOCALAPPDATA && { executable: path.join(process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe'), engine:'chromium', name:'Google Chrome' },
    process.env.PROGRAMFILES && { executable: path.join(process.env.PROGRAMFILES,'Microsoft/Edge/Application/msedge.exe'), engine:'chromium', name:'Microsoft Edge' },
    process.env['PROGRAMFILES(X86)'] && { executable: path.join(process.env['PROGRAMFILES(X86)'],'Microsoft/Edge/Application/msedge.exe'), engine:'chromium', name:'Microsoft Edge' },
    process.env.LOCALAPPDATA && { executable: path.join(process.env.LOCALAPPDATA,'Microsoft/Edge/Application/msedge.exe'), engine:'chromium', name:'Microsoft Edge' },
    process.env.PROGRAMFILES && { executable: path.join(process.env.PROGRAMFILES,'BraveSoftware/Brave-Browser/Application/brave.exe'), engine:'chromium', name:'Brave' },
    process.env.LOCALAPPDATA && { executable: path.join(process.env.LOCALAPPDATA,'BraveSoftware/Brave-Browser/Application/brave.exe'), engine:'chromium', name:'Brave' },
    process.env.LOCALAPPDATA && { executable: path.join(process.env.LOCALAPPDATA,'Vivaldi/Application/vivaldi.exe'), engine:'chromium', name:'Vivaldi' },
    process.env.PROGRAMFILES && { executable: path.join(process.env.PROGRAMFILES,'Vivaldi/Application/vivaldi.exe'), engine:'chromium', name:'Vivaldi' },
    { executable:'/usr/bin/google-chrome', engine:'chromium', name:'Google Chrome' },
    { executable:'/usr/bin/chromium', engine:'chromium', name:'Chromium' },
    { executable:'/usr/bin/chromium-browser', engine:'chromium', name:'Chromium' },
    { executable:'/usr/bin/microsoft-edge', engine:'chromium', name:'Microsoft Edge' },
    { executable:'/usr/bin/brave-browser', engine:'chromium', name:'Brave' },
    { executable:'/usr/bin/firefox', engine:'firefox', name:'Firefox' },
    { executable:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', engine:'chromium', name:'Google Chrome' },
    { executable:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', engine:'chromium', name:'Microsoft Edge' },
    { executable:'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', engine:'chromium', name:'Brave' },
    { executable:'/Applications/Firefox.app/Contents/MacOS/firefox', engine:'firefox', name:'Firefox' }
  ].filter(Boolean);
  const pathBrowsers = (process.env.PATH || '').split(path.delimiter).filter(Boolean).flatMap(directory =>
    ['chrome.exe','msedge.exe','brave.exe','vivaldi.exe','opera.exe','firefox.exe','google-chrome','chromium','chromium-browser','brave-browser','firefox'].map(file => {
      const lower = file.toLowerCase();
      const engine = lower.includes('firefox') ? 'firefox' : 'chromium';
      return { executable:path.join(directory,file), engine, name:lower.includes('edge') ? 'Microsoft Edge' : lower.includes('brave') ? 'Brave' : lower.includes('vivaldi') ? 'Vivaldi' : lower.includes('opera') ? 'Opera' : lower.includes('firefox') ? 'Firefox' : lower.includes('chromium') ? 'Chromium' : 'Chrome' };
    })
  );
  candidates.push(...pathBrowsers);
  return candidates.find(candidate => fs.existsSync(candidate.executable)) || null;
}
function closeSimulation(name) {
  const entry = simulations.get(name);
  if (!entry) return;
  simulations.delete(name);
  Promise.resolve(entry.context.close()).catch(() => {});
  try { fs.rmSync(entry.profile,{recursive:true,force:true}); } catch {}
}
async function launchSimulation(room) {
  const detected = findBrowser();
  if (!detected) throw new Error('No supported browser was found. Install Chrome, Edge, Brave, Vivaldi, Chromium, or Firefox. Set PIXELPHYX_BROWSER_PATH to your browser executable if it is installed elsewhere.');
  const { chromium, firefox } = require('playwright-core');
  const browserType = detected.engine === 'firefox' ? firefox : chromium;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'pixelphyx-sim-'));
  let context;
  try {
    context = await browserType.launchPersistentContext(profile, {
      headless: true,
      executablePath: detected.executable,
      viewport: { width: 1280, height: 720 },
      args: detected.engine === 'chromium'
        ? ['--disable-background-networking','--disable-default-apps','--disable-extensions','--no-first-run','--no-default-browser-check']
        : []
    });
    const entry = { context, profile, browser: detected.name };
    simulations.set(room.name, entry);
    context.on('close', () => {
      if (simulations.get(room.name) === entry) {
        simulations.delete(room.name);
        const active = rooms.get(room.name);
        if (active) {
          for (const p of active.players.values()) {
            const peer = clients.get(p.id);
            if (peer) { peer.room = null; peer.approved = false; send(peer.socket,'room-left',{reason:'The server simulation stopped.'}); }
          }
          rooms.delete(room.name);
          broadcastLobbies();
        }
      }
      try { fs.rmSync(profile,{recursive:true,force:true}); } catch {}
    });
    const page = context.pages()[0] || await context.newPage();
    const targetUrl = 'http://127.0.0.1:' + settings.port + '/?pixelphyx-sim=' + encodeURIComponent(room.simulationToken) + '&room=' + encodeURIComponent(room.name);
    await page.goto(targetUrl, { waitUntil:'domcontentloaded', timeout:30000 });
    for (let i=0; i<60; i++) {
      if (room.simulationClientId) return;
      if (rooms.get(room.name) !== room) throw new Error('Lobby closed before its simulation connected.');
      if (context.pages().length === 0) throw new Error(detected.name + ' closed the simulation page.');
      await new Promise(resolve => setTimeout(resolve,500));
    }
    throw new Error('The hidden game page did not connect within 30 seconds. Check the game WASM files and server logs.');
  } catch (error) {
    if (context) await context.close().catch(() => {});
    simulations.delete(room.name);
    try { fs.rmSync(profile,{recursive:true,force:true}); } catch {}
    throw new Error(detected.name + ' headless startup failed: ' + error.message);
  }
}
function serveGame(res,pathname){
  let relative;try{relative=decodeURIComponent(pathname==='/'?'/index.html':pathname).replace(/^\/+/, '');}catch{res.writeHead(400);return res.end('Bad request');}
  const file=path.resolve(WEBSITE_ROOT,relative);
  if(file!==WEBSITE_ROOT&&!file.startsWith(WEBSITE_ROOT+path.sep)){res.writeHead(403);return res.end('Forbidden');}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});return res.end('Not found');}
    res.writeHead(200,{'content-type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','cache-control':path.extname(file)==='.html'?'no-store':'public, max-age=300'});fs.createReadStream(file).pipe(res);});
}

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
    .map(room => ({ room: room.name, players: [...room.players.values()].filter(p => !p.isSimulation).length, maxPlayers: room.maxPlayers, hostName: room.hostName, transport: 'local' }));
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
  if (!client.isSimulation && [...room.players.values()].every(player => player.isSimulation)) {
    const simulationPlayer = [...room.players.values()].find(player => player.isSimulation);
    const simulationClient = simulationPlayer ? clients.get(simulationPlayer.id) : null;
    if (simulationClient) { simulationClient.room = null; simulationClient.socket.close(); }
    closeSimulation(room.name);
    rooms.delete(room.name);
    broadcastLobbies();
    return;
  }
  if (client.isSimulation) { closeSimulation(room.name); for (const p of room.players.values()) { const peer=clients.get(p.id); if(peer){peer.room=null;peer.approved=false;send(peer.socket,'room-left',{reason:'The server simulation stopped.'});} } rooms.delete(room.name); broadcastLobbies(); return; }
  if (room.players.size === 0) { rooms.delete(room.name); closeSimulation(room.name); }
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
function sendStrokeEvent(room, sender, event) {
  if (!sender.approved && sender.id !== room.hostId) return;
  const stroke = event.data;
  if (!stroke || stroke.type !== 'stroke' ||
      typeof stroke.pointsPacked !== 'string' ||
      stroke.pointsPacked.length > 65536 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(stroke.pointsPacked) ||
      stroke.pointScale !== 4 ||
      !Number.isInteger(stroke.material) || stroke.material < 0 || stroke.material > 17 ||
      !Number.isFinite(stroke.brush) || stroke.brush < 1 || stroke.brush > 22 ||
      !['draw', 'line', 'bomb', 'heat', 'cool', 'erase'].includes(stroke.tool)) return;

  const targets = Array.isArray(event.targetPlayers)
    ? new Set(event.targetPlayers.map(Number))
    : null;
  const receiver = event.receivers || 'all';
  for (const player of room.players.values()) {
    if (player.id === sender.id) continue;
    if (targets && !targets.has(player.number)) continue;
    if (receiver === 'masterClient' && player.id !== room.hostId) continue;
    if (receiver !== 'masterClient' && receiver !== 'others' && receiver !== 'all' && !targets) continue;
    if (player.id !== room.hostId && !player.approved) continue;
    send(player.socket, 'event', {
      senderNumber: sender.number,
      code: 8,
      data: stroke,
      reliable: true
    });
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
      const created = { name, hostId: client.id, hostName: player.name, maxPlayers: settings.maxPlayers, players: new Map([[client.id, player]]), simulationToken: crypto.randomBytes(32).toString('hex') };
      rooms.set(name, created); client.room = name; client.number = player.number;
      send(client.socket, 'room-joined', { room: name, isHost: true, number: player.number, players: roomRoster(created) });
      broadcastLobbies();
      launchSimulation(created).catch(error => {
        console.error('Could not start simulation for ' + name + ':', error.message);
        send(client.socket, 'error', { message: 'Could not start the headless simulation: ' + error.message });
        const active = rooms.get(name);
        if (active) {
          for (const p of active.players.values()) {
            const peer = clients.get(p.id);
            if (peer) { peer.room = null; peer.approved = false; send(peer.socket, 'room-left', { reason: 'Simulation startup failed.' }); }
          }
          rooms.delete(name);
          broadcastLobbies();
        }
      });
      break;
    }
    case 'simulation-join': {
      const target=rooms.get(String(message.room||'').toUpperCase());
      if(!target||typeof message.token!=='string'||message.token.length!==64||message.token!==target.simulationToken)throw new Error('Simulation authentication failed.');
      if(client.room)throw new Error('Simulation is already assigned to a room.');
      const player={id:client.id,number:nextPlayerNumber++,socket:client.socket,name:'Server Simulation',color:'#8b9cff',approved:true,isSimulation:true};
      client.room=target.name;client.number=player.number;client.approved=true;client.isSimulation=true;target.players.set(client.id,player);target.hostId=client.id;target.simulationClientId=client.id;
      send(client.socket,'room-joined',{room:target.name,isHost:true,number:player.number,players:roomRoster(target)});
      for(const p of target.players.values())if(p.id!==client.id)send(p.socket,'host-changed',{hostId:client.id});
      sendRoster(target);broadcastLobbies();break;
    }
    case 'join-room': {
      if (room) throw new Error('Leave your current server before joining another.');
      const target = rooms.get(String(message.room || '').toUpperCase());
      if (!target) throw new Error('Server not found. Check the server code and address.');
      if ([...target.players.values()].filter(p=>!p.isSimulation).length >= target.maxPlayers) throw new Error('This server is full.');
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
      if (Number(message.code) === 8) {
        sendStrokeEvent(room, client, message);
        return;
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
  if (fs.existsSync(path.join(WEBSITE_ROOT, 'index.html'))) return serveGame(res, pathname);
  res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('PixelPhyx game files are not installed. Restart the server with internet access to download them.');
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
downloadWebsite(WEBSITE_ROOT).then(() => server.listen(settings.port, settings.host, () => {
  console.log('');
  console.log('  PixelPhyx Server');
  console.log('  ----------------');
  console.log('  Bind:       ' + settings.host);
  console.log('  Port:       ' + settings.port);
  const addresses = Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address);
  console.log('  Game:       http://localhost:' + settings.port + '/');
  console.log('  Game:       http://localhost:' + settings.port + '/');
  console.log('  WebSocket:  ws://localhost:' + settings.port + '/pixelphyx');
  for (const address of addresses) console.log('  LAN URL:    ws://' + address + ':' + settings.port + '/pixelphyx');
  console.log('  Max players per lobby: ' + settings.maxPlayers);
  console.log('  Lobby limit: ' + settings.lobbyCount);
  console.log('');
  console.log('  Forward TCP port ' + settings.port + ' on your router for internet access.');
  console.log('  Keep this window open while hosting.');
})).catch(error => {
  console.error('Could not prepare PixelPhyx website files:', error.message);
  process.exitCode = 1;
});
function shutdown() {
  clearInterval(heartbeat);
  for (const room of rooms.values()) closeSimulation(room.name);
  for (const client of clients.values()) { send(client.socket, 'server-shutdown'); client.socket.close(); }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
