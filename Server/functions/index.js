// Aggregate cumulative per-player estimates into compact date-keyed totals.
async function addBandwidthDelta(period, key, delta) {
  if (!key || !Number.isFinite(delta) || delta === 0) return;
  const valueRef = database.ref(`serviceStatus/bandwidth/${period}/${key}/estimatedBytes`);
  await valueRef.transaction((current) => Math.max(0, (Number(current) || 0) + delta));
}

exports.aggregateBandwidthReport = onValueWritten(
  {
    ref: "/usageReports/{uid}",
    instance: "pixelphyx-backendv2-default-rtdb",
    region: "us-central1"
  },
  async (event) => {
    const incoming = event.data.after.val();
    if (!incoming || !incoming.day || !incoming.month) return;

    const contributionRef = database.ref(`bandwidthContributions/${event.params.uid}`);
    let previous = null;
    let accepted = false;
    const result = await contributionRef.transaction((current) => {
      if (current && Number(current.updatedAt) >= Number(incoming.updatedAt)) return;
      previous = current || null;
      accepted = true;
      return incoming;
    });
    if (!result.committed || !accepted) return;

    const oldDaily = Number(previous?.estimatedDailyBytes) || 0;
    const oldMonthly = Number(previous?.estimatedMonthlyBytes) || 0;
    const newDaily = Number(incoming.estimatedDailyBytes) || 0;
    const newMonthly = Number(incoming.estimatedMonthlyBytes) || 0;

    if (previous?.day && previous.day !== incoming.day) {
      await addBandwidthDelta("daily", previous.day, -oldDaily);
      await addBandwidthDelta("daily", incoming.day, newDaily);
    } else {
      await addBandwidthDelta("daily", incoming.day, newDaily - oldDaily);
    }
    if (previous?.month && previous.month !== incoming.month) {
      await addBandwidthDelta("monthly", previous.month, -oldMonthly);
      await addBandwidthDelta("monthly", incoming.month, newMonthly);
    } else {
      await addBandwidthDelta("monthly", incoming.month, newMonthly - oldMonthly);
    }
  }
);

const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");

const DATABASE_URL = "https://pixelphyx-backendv2-default-rtdb.firebaseio.com";
const CLEANUP_GRACE_MS = 3000;

const app = initializeApp({ databaseURL: DATABASE_URL });
const database = getDatabase(app);

exports.clearEmptyRoom = onValueWritten(
  {
    ref: "/rooms/{roomId}/players",
    instance: "pixelphyx-backendv2-default-rtdb",
    region: "us-central1"
  },
  async (event) => {
    const { roomId } = event.params;
    const playersAfterWrite = event.data.after.val();

    // This parent-level trigger runs for both child deletion and whole-list deletion.
    if (playersAfterWrite && Object.keys(playersAfterWrite).length > 0) return;

    await new Promise((resolve) => setTimeout(resolve, CLEANUP_GRACE_MS));

    // Recheck atomically so a player who rejoins during the grace period is safe.
    const roomRef = database.ref(`rooms/${roomId}`);
    const result = await roomRef.transaction((room) => {
      if (!room) return;
      if (room.players && Object.keys(room.players).length > 0) return;
      return null;
    });

    if (!result.committed) {
      logger.info("Kept room because it became active or was already removed", { roomId });
      return;
    }

    // Remove the gallery entry only if it still points to this room.
    await database.ref(`lobbyDirectory/${roomId}`).transaction((current) => {
      if (!current || current.room !== roomId) return;
      return null;
    });

    // Search the small, fixed 20-slot reservation list. This also cleans up
    // reservations when a lobby directory entry was missing or stale.
    const slotsSnapshot = await database.ref("lobbySlots").get();
    const slots = slotsSnapshot.val() || {};
    const matchingSlots = Object.entries(slots)
      .filter(([, value]) => value?.room === roomId)
      .map(([slot]) => slot);

    await Promise.all(matchingSlots.map((slot) =>
      database.ref(`lobbySlots/${slot}`).transaction((current) => {
        if (!current || current.room !== roomId) return;
        return null;
      })
    ));

    logger.info("Removed empty room, gallery entry, and slot reservations", {
      roomId,
      removedSlots: matchingSlots
    });
  }
);
