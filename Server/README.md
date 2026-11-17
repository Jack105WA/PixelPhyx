# Custom Firebase Server Setup

Pixel Phyx multiplayer can use your own Firebase project instead of the default Pixel Phyx database. This guide covers creating the Firebase backend and connecting the game to it.

## 1. Create a Firebase project

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select **Add project** and create a project.
3. You can disable Google Analytics; Pixel Phyx does not need it for multiplayer.
4. In **Project settings → General**, register a **Web app**. Give it any name.
5. Keep the Firebase project open. You will need its web app configuration in step 5.

## 2. Create the Realtime Database

1. In the Firebase Console, open **Build → Realtime Database**.
2. Select **Create Database**.
3. Choose a database location and finish creating it.
4. Open the **Rules** tab.
5. Replace the rules with the contents of [database.rules.json](./database.rules.json) from this folder, then click **Publish**.

The rules allow signed-in players to read and update multiplayer rooms and lobby listings. Each player's usage report is restricted to that player's authenticated UID. The `serviceStatus` path is read-only for clients.

**Important:** These rules are designed for the current Pixel Phyx multiplayer implementation. Do not replace them with public read/write rules such as `.read: true` and `.write: true`.

## 3. Enable Anonymous Authentication

Pixel Phyx signs players in anonymously. No account registration is needed.

1. In Firebase Console, open **Build → Authentication**.
2. Select **Get started** if this is your first time.
3. Open **Sign-in method**.
4. Enable **Anonymous** and save.

If this provider is not enabled, Pixel Phyx may show `auth/configuration-not-found` or `auth/operation-not-allowed` when loading online lobbies.

## 4. Check your Realtime Database rules

Make sure the rules from `Server/database.rules.json` were published to the **same Firebase project** whose configuration you will use. Authentication and Realtime Database must belong to that same project.

You do not need Firebase Storage for multiplayer. You also do not need to deploy Cloud Functions to connect a custom database.

## 5. Copy your Firebase web app configuration

1. Open **Project settings → General**.
2. Find **Your apps** and select the web app you registered.
3. Under **SDK setup and configuration**, choose **Config**.
4. Copy the complete JavaScript configuration block. It looks like this:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

Use the exact values Firebase gives you. Your `databaseURL` may use a different regional hostname; do not guess or construct it yourself. Do not paste a service account key or private Admin SDK credentials.

## 6. Connect Pixel Phyx

1. Open Pixel Phyx and go to **Online**.
2. Enable the **Custom Firebase server** option.
3. Paste the complete `const firebaseConfig = { ... };` block into the configuration field.
4. Open or refresh the lobby list. Pixel Phyx will connect to that Firebase project.

To return to the default Pixel Phyx server, turn off the custom server option. If you are already inside a multiplayer room, leave it before switching projects.

## Troubleshooting

| Error | What to check |
| --- | --- |
| `auth/configuration-not-found` | Open Authentication in the correct project, select **Get started**, and enable Anonymous sign-in. |
| `auth/operation-not-allowed` | Enable the **Anonymous** provider under Authentication → Sign-in method. |
| `Permission denied` | Publish `Server/database.rules.json` to the same project used by the pasted config. |
| Database connection or URL error | Copy the exact `databaseURL` from Realtime Database; ensure the database has been created. |
| Wrong project or old lobby list | Verify every config value came from the same Firebase project, then reload Pixel Phyx. |

## Notes

- Each Firebase project has its own separate rooms and lobby directory. Players must use the same project configuration to see and join each other's lobbies.
- Firebase usage, quotas, and billing are controlled by Google and are separate from the default Pixel Phyx server.
- Never publish Firebase service account credentials. The web app config is intended for client-side use; database access is controlled by Authentication and Realtime Database Security Rules.
- Custom Firebase hosting is not included. This only changes the multiplayer backend used by Pixel Phyx.
