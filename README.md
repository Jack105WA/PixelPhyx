# PixelPhyx

PixelPhyx is an online pixel-art physics and chemistry sandbox. Build worlds with falling particles, liquids, gases, reactions, explosions, and ropes with live Verlet-physics simulation. Invite friends to the same multiplayer room and experiment together.

## Play online

After GitHub Pages finishes deploying, open:

**https://jack105wa.github.io/PixelPhyx/**

## OFFLINE

https://github.com/Jack105WA/PixelPhyx/blob/main/Website/offline.html

The site is published from the contents of `Website/` at the Pages site root, so public URLs do not include `/Website/`. The game also runs locally from a web server. Firebase's browser SDK is loaded from Google's CDN, so an internet connection is required for online play.

## Multiplayer

1. Click **Multiplayer** or enter a room code in the Multiplayer panel.
2. Click **Join room**.
3. Send the exact same room code to your friends.
4. They open the deployed game and join that room. The game connects automatically.

Everyone in a room shares the same particle world and rope structures. Player presence is removed automatically when a connection closes.

## Controls

- **Draw:** place the selected material.
- **Line:** drag to draw a straight material line.
- **Rope:** click and drag from one anchor point to another. The rope sags and reacts to gravity using a Verlet constraint solver.
- **Erase:** remove particles.
- **Box:** place a block of the selected material.
- **Blast:** place TNT; ignite it with fire to detonate.
- **Heat / Cool:** place fire or ice.
- **Brush size:** use the slider or mouse wheel.
- **Gravity:** adjust gravity strength, including zero gravity.
- **Simulation speed:** change the simulation rate multiplier. Physics uses a fixed 60-step-per-second clock independent of display frame rate.
- **Ambient temperature:** set the world temperature from -100°C to 1200°C. Heat and cold affect water and ice.
- **Space:** pause or resume.
- **Right click:** erase.
- **Export PNG:** save an image of the current experiment.

## GitHub Pages deployment

The repository deploys from `main` using the workflow in `.github/workflows/pages.yml`. In GitHub, open **Settings → Pages** and make sure the source is **GitHub Actions**. The workflow rebuilds the standalone offline edition and publishes only the contents of `Website/` as the site root. Repository files and Firebase administration files remain outside the deployed website.

## Repository layout

- `Website/` contains the complete live website published by GitHub Pages.
  - `Website/index.html` is the website entry point.
  - `Website/js/` contains the browser-side game, physics, multiplayer, and Firebase configuration modules.
  - `Website/offline.html` is the generated single-file offline edition.
- `.github/workflows/` contains GitHub Actions automation.
- `Server/functions/` contains the Firebase Cloud Function for empty-room cleanup.
- `Server/firebase.json`, `Server/.firebaserc`, and `Server/database.rules.json` are Firebase project files.
- `build-offline.mjs` builds the offline edition from the website source.
