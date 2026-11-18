# PixelPhyx Multiplayer Server

The server downloads the current game website from the `local-server` branch into `Server/Website` on first startup and refreshes it when the website changes. It serves that local copy and starts one invisible headless Chrome simulation for each lobby. The hidden simulation is the authoritative room host.

## Start

Run `Start Server.bat`. An internet connection is needed the first time so the server can download the website files. The download is cached locally; unchanged files are not downloaded again.

Requirements: Node.js 20+, Google Chrome or Chromium, and Rust with `wasm-pack` available on PATH if the repository does not contain the compiled WASM files. The first setup builds the WASM engine with:

```sh
wasm-pack build Website/wasm --target web --release --out-dir ../pkg
```

If Chrome is installed in a non-standard location, set `PIXELPHYX_CHROME_PATH` to its executable.

Open `http://localhost:3000/` to play. The WebSocket endpoint is `/pixelphyx`. Creating a lobby starts a separate headless Chrome process with an isolated profile and an authenticated simulation session.

## Remote players

Players open the server's public IP/hostname on port 3000, then select Online. Forward TCP port 3000 to the hosting PC and allow Node.js through Windows Firewall. HTTPS deployments require a TLS reverse proxy and WSS.

## Configuration

Edit `config.yml`: `server.bind`, `server.port`, `server.max_players`, `server.lobby_count`; and `network.snapshot_interval_ms`, `network.rope_update_interval_ms`, `network.cursor_updates`, `network.cursor_update_interval_ms`, `network.snapshot_chunk_bytes`, `network.max_snapshot_bytes`, `network.max_payload_bytes`, `network.max_buffered_bytes`.

Downloaded website files are stored in `Server/Website`. Room state is held in memory and is not saved to disk.
