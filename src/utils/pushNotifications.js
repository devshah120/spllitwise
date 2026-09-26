const { admin, isFirebaseReady } = require('../config/firebase');

// Every push in this app targets a per-user FCM topic, `user_<id>`, that the
// client subscribes itself to right after login (see the Flutter app's
// NotificationService) — the same pattern already proven out for the
// DM Bhatt Classes app's per-student topics. This means the server never
// has to store, refresh or clean up device tokens: it just sends to the
// topic and FCM fan-out handles however many devices that user is signed
// in on.
//
// FCM requires every `data` value to be a string, so payload values are
// stringified here rather than at every call site.
function stringifyData(data) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
}

// Sends one push to one user's topic. Never throws — a missing Firebase
// config or a delivery failure is logged and swallowed, the same way a
// failed notification email never blocks the request that triggered it
// (see notifySafely in notifications.js, which every call site here is
// wrapped in).
async function sendPushToUser(userId, { title, body, data } = {}) {
  if (!isFirebaseReady()) return;
  if (!userId || !title || !body) return;

  const message = {
    notification: { title, body },
    topic: `user_${userId}`,
    android: {
      notification: {
        sound: 'default',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        channelId: 'expense_updates_channel',
      },
    },
    apns: {
      payload: {
        aps: { sound: 'default' },
      },
    },
    data: stringifyData(data),
  };

  try {
    await admin.messaging().send(message);
  } catch (err) {
    console.error(`[push] Failed to notify user ${userId}:`, err.message);
  }
}

// Sends the same push to several users. Each send is independent — one
// user's failure (e.g. no one has ever opened the app, so the topic has no
// subscribers yet — FCM still accepts this silently) never affects another.
async function sendPushToUsers(userIds, payload) {
  await Promise.all((userIds || []).map((id) => sendPushToUser(id, payload)));
}

module.exports = { sendPushToUser, sendPushToUsers };
