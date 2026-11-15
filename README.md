# PixelPhyx

PixelPhyx is an online pixel-art physics and chemistry sandbox. Build worlds with falling particles, liquids, gases, reactions, explosions, and ropes with live Verlet-physics simulation. Invite friends to the same Firebase Realtime Database room and experiment together.

## Repository layout

- `Website/` contains the complete live website published by GitHub Pages.
  - `Website/index.html` is the website entry point.
  - `Website/js/` contains the browser-side game, physics, multiplayer, and Firebase configuration modules.
  - `Website/offline.html` is the generated single-file offline edition.
- `.github/workflows/` contains GitHub Actions automation.
- `Server/functions/` contains the Firebase Cloud Function for empty-room cleanup.
- `Server/firebase.json`, `Server/.firebaserc`, and `Server/database.rules.json` configure Firebase.
- `build-offline.mjs` builds the offline edition from the website source.

## Play online

After GitHub Pages finishes deploying, open:

**https://jack105wa.github.io/PixelPhyx/**

## OFFLINE

https://github.com/Jack105WA/PixelPhyx/blob/main/Website/offline.html

The site is published from the contents of `Website/` at the Pages site root, so public URLs do not include `/Website/`. The game also runs locally from a web server. Firebase's browser SDK is loaded from Google's CDN, so an internet connection is required for online play.

## Firebase multiplayer setup

You need a Firebase project. The free Spark plan is enough to get started; keep an eye on Firebase usage and quotas.

### 1. Create a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/).
2. Select **Add project** and finish the setup.
3. Open the project overview and click the **Web app** icon (`</>`) to register a web app. Give it a name such as `PixelPhyx`. You do not need Firebase Hosting.

### 2. Create Realtime Database

1. In the Firebase console, open **Build → Realtime Database**.
2. Click **Create Database** and choose a region.
3. Start in locked mode. After it is created, open the **Data** tab and copy the database URL. It looks like `https://YOUR-PROJECT-default-rtdb.firebaseio.com` (some regions use a different hostname).

### 3. Enable anonymous sign-in

1. Open **Build → Authentication → Get started**.
2. Open **Sign-in method**.
3. Select **Anonymous**, enable it, and save.

PixelPhyx uses Firebase Anonymous Authentication. Players are signed in with a temporary Firebase user before they can access a room. No email or password is required.

### 4. Publish the database rules

In Realtime Database → **Rules**, replace the rules with the contents of [database.rules.json](Server/database.rules.json), then click **Publish**:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rooms": {
      "$room": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

These starter rules require Firebase Authentication, but any anonymously authenticated visitor can still read and write any room if they know its code. Room codes are not passwords. This is suitable for a small public experiment, not private or abuse-resistant production hosting. Add stricter membership, validation, rate limits, and a trusted backend before using it for sensitive data.

### 5. Firebase is preconfigured in PixelPhyx

PixelPhyx is already configured to use the `pixelphyx-backend` Firebase project and its Realtime Database. The game connects automatically when it loads; no config needs to be pasted by players. The **Connect** button retries the connection if needed.

Firebase web API keys are client identifiers, not server secrets; database security comes from Authentication and Realtime Database rules.

### 6. Deploy automatic empty-room cleanup

PixelPhyx includes a Firebase Realtime Database function that removes a room's saved world and edit history after its final player disconnects. This runs on the server, so cleanup still happens when every browser window is closed.

Deploy it once from the repository root (the Firebase configuration is in `Server/`):

```bash
npm install -g firebase-tools
firebase login
firebase --config Server/firebase.json --project pixelphyx-backend deploy --only functions
```

The function uses the `pixelphyx-backend` project configured in `Server/.firebaserc`. Firebase requires the project to use the Blaze (pay-as-you-go) plan to deploy Cloud Functions; the function itself is small and only runs when a player disconnects. Review Firebase pricing and usage limits before enabling billing.

### 7. Invite friends

1. Click **Multiplayer** or enter a room code in the Multiplayer panel.
2. Click **Join room**.
3. Send the exact same room code to your friends.
4. They open the deployed game and join that room. Firebase connects automatically.

Everyone in a room shares the same particle world and rope structures. Presence is removed automatically when a player's connection closes.

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
