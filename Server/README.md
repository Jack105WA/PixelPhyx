# PixelPhyx Multiplayer Server

The server downloads the current game website from the main branch (Website/) into Server/Website on first startup and refreshes it when the website changes. It serves that local copy and starts one isolated headless browser session for each lobby. The hidden simulation is the authoritative room host.

## Start

Run Start Server.bat. The launcher asks how to configure Windows Firewall before starting:
- **Tailscale only** allows TCP connections from Tailscale's 100.64.0.0/10 address range. This is the recommended option for private Tailscale hosting.
- **All networks** allows TCP connections from any remote address. Use this only if you intend to expose the server beyond your tailnet.
- **Skip** leaves Windows Firewall unchanged.

Windows displays a User Account Control prompt when administrator permission is needed to create the firewall rule. The rule is reused on later launches. An internet connection is needed the first time so the server can download the website files and install Node dependencies. Website downloads are cached; unchanged files are not downloaded again.

Requirements: Node.js 20+ and an installed supported browser. The browser WASM engine is precompiled by GitHub Actions on main and downloaded with the website. This PC does not need Rust, Cargo, wasm-pack, a C/C++ compiler, or a local build toolchain. The server's npm packages are installed automatically by the launcher.

If your browser is installed somewhere non-standard, set PIXELPHYX_BROWSER_PATH to its executable path. For an unusual browser build, set PIXELPHYX_BROWSER_ENGINE=chromium or firefox as well. The old PIXELPHYX_CHROME_PATH and CHROME_PATH variables remain supported.

Open http://localhost:3000/ to play. The WebSocket endpoint is /pixelphyx. Creating a lobby starts a separate headless browser profile and an authenticated simulation session.

## Missing server files

The launcher repairs missing server files from GitHub before running Node. It always changes into its own folder and runs server.js using its absolute path, so starting the batch file from Downloads, Explorer, or another working directory does not change which server file is loaded.

## Remote players

For Tailscale, players connect to the host's Tailscale IP address on the configured TCP port (default 3000). Both players must be signed into the same tailnet, and the tailnet's access-control policy must permit the connection. The Tailscale-only firewall option restricts inbound connections to Tailscale's address range.

For public internet access, choose All networks, then forward TCP port 3000 to the hosting PC on your router. HTTPS deployments require a TLS reverse proxy and WSS.

## Configuration

Edit config.yml: server.bind, server.port, server.max_players, server.lobby_count; and network.snapshot_interval_ms, network.rope_update_interval_ms, network.cursor_updates, network.cursor_update_interval_ms, network.snapshot_chunk_bytes, network.max_snapshot_bytes, network.max_payload_bytes, network.max_buffered_bytes.

Downloaded website files are stored in Server/Website. Room state is held in memory and is not saved to disk.
