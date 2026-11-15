# PixelPhyx

PixelPhyx is an online pixel-art physics and chemistry sandbox. Build worlds with falling particles, liquids, gases, reactions, explosions, and ropes with live Verlet-physics simulation. Invite friends to the same Firebase Realtime Database room and experiment together.

## Play online

After GitHub Pages finishes deploying, open:

**https://jack105wa.github.io/PixelPhyx/**

The game also runs locally from a web server. Firebase's browser SDK is loaded from Google's CDN, so an internet connection is required for online play.

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

In Realtime Database → **Rules**, replace the rules with the contents of [database.rules.json](database.rules.json), then click **Publish**:

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

### 6. Invite friends

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
- **Simulation speed:** run multiple simulation steps per frame.
- **Ambient temperature:** set the world temperature from -100°C to 1200°C. Heat and cold affect water and ice.
- **Space:** pause or resume.
- **Right click:** erase.
- **Export PNG:** save an image of the current experiment.

## GitHub Pages deployment

The repository deploys from `main` using the workflow in `.github/workflows/pages.yml`. In GitHub, open **Settings → Pages** and make sure the source is **GitHub Actions**. The workflow publishes the repository root.
