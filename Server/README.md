# PixelPhyx Multiplayer Server

The server serves the PixelPhyx game page and starts one invisible headless Chrome simulation for each lobby. The hidden simulation becomes the authoritative room host; normal players connect as clients.

## Start
Keep the `Website` folder beside `Server` (the repository layout already does this), then run `Start Server.bat`.

Requirements: Node.js 20+ and Google Chrome or Chromium installed on the server PC. For a non-standard Chrome location, set `PIXELPHYX_CHROME_PATH` to its executable.

Open `http://localhost:3000/` to play. The WebSocket endpoint is `/pixelphyx`. Creating a lobby starts a separate headless Chrome process with an isolated profile and an authenticated simulation session.

## Remote players
Players open the server's public IP/hostname on port 3000, then select Online. Forward TCP port 3000 to the hosting PC and allow Node.js through Windows Firewall. HTTPS deployments require a TLS reverse proxy and WSS.

## Configuration
Edit `config.yml`: `server.bind`, `server.port`, `server.max_players`, `server.lobby_count`; and `network.snapshot_interval_ms`, `network.rope_update_interval_ms`, `network.cursor_updates`, `network.cursor_update_interval_ms`, `network.snapshot_chunk_bytes`, `network.max_snapshot_bytes`, `network.max_payload_bytes`, `network.max_buffered_bytes`.

The site is served from the sibling `Website` folder. Room state is held in memory and is not saved to disk.
