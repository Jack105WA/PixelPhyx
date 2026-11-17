# PixelPhyx

PixelPhyx is a browser-based pixel physics and chemistry sandbox. Build worlds with falling particles, liquids, gases, reactions, explosions, ropes, and rigid-body props.

## Play

Production: https://jack105wa.github.io/PixelPhyx/

Photon test preview: https://jack105wa.github.io/PixelPhyx/photon-test/

The Photon preview is isolated from production and uses Photon Realtime for multiplayer.

## Photon multiplayer

- Photon Realtime Core 6 handles browser connections, room discovery, room membership, and reliable gameplay events.
- The room's Photon master client is the physics authority. Other clients render interpolated world snapshots instead of simulating a separate copy of the particle world.
- Drawing, erasing, material placement, ropes, props, settings, pause/resume, and single-step requests are relayed through the room host.
- Room hosts approve join requests. Photon automatically transfers master-client ownership if the host leaves.
- World snapshots are compressed and chunked. Ropes use small, frequent state updates; prop state is sent only when it changes.
- The browser SDK uses secure WebSockets and Photon Cloud relay. It does not provide direct LAN peer-to-peer transport.

The App ID in the browser code is a public Photon application identifier, not a secret. Photon usage, CCU limits, and billing are controlled in the [Photon Dashboard](https://dashboard.photonengine.com/).

## Controls

- **Draw:** place the selected material.
- **Rope:** drag to create a rope; right-click to delete.
- **Grab:** drag rope points or props.
- **Props:** spawn cars, buckets, balls, crates, and barrels.
- **Brush size:** use the slider or mouse wheel.
- **Gravity:** adjust gravity strength.
- **Simulation speed:** change the local simulation rate multiplier.
- **Ambient temperature:** set the world temperature.
- **Space:** pause or resume the shared simulation.
- **Step:** advance one simulation step while paused (host-authoritative).
- **Right click:** erase.
- **Export PNG:** save an image of the current experiment.

## Offline edition

The standalone offline edition is generated from the source in Website/ by Offline/build-offline.mjs.

## GitHub Pages deployment

The workflow in .github/workflows/pages.yml publishes:
- main as the production site root.
- server-migrate under /server-migrate/.
- photon-test under /photon-test/.

The Photon branch is syntax-checked before deployment. GitHub Pages must use **GitHub Actions** as its source in repository Settings → Pages.

## Repository layout

- Website/ contains the browser game and published site.
- Website/js/main.js contains the existing sandbox and rendering integration.
- Website/js/multiplayer.js connects the UI to Photon.
- Website/js/photon-sync.js handles gameplay events and authoritative snapshots.
- Website/js/photon-rooms.js handles Photon rooms, lobbies, and join approvals.
- Website/js/photon-codec.js compresses and chunks world snapshots.
- Server/ contains the retired Firebase backend files retained for reference; the Photon branch does not load them.
- .github/workflows/ contains deployment automation.
