// Builds the shareable artefacts for a group invite: the deep link the app
// handles, an https fallback for phones without the app, and the QR payload.
//
// APP_SCHEME / INVITE_BASE_URL come from the environment so the same code works
// in development and production.
const APP_SCHEME = process.env.APP_SCHEME || 'splitwise';
const INVITE_BASE_URL =
  process.env.INVITE_BASE_URL || 'https://splitwise.app/join';

function buildInvite(group) {
  if (!group.inviteCode) return null;

  const code = group.inviteCode;
  return {
    code,
    // Opens the app straight onto the join screen.
    deepLink: `${APP_SCHEME}://join/${code}`,
    // Web fallback — the landing page can redirect into the app or the store.
    link: `${INVITE_BASE_URL}/${code}`,
    // What the QR image should encode. Scanning it in any camera app opens the
    // https link; scanning it in ours short-circuits to the deep link.
    qrPayload: `${INVITE_BASE_URL}/${code}`,
    enabled: group.inviteEnabled,
    expiresAt: group.inviteExpiresAt,
    active:
      typeof group.isInviteActive === 'function' ? group.isInviteActive() : null,
  };
}

module.exports = { buildInvite, APP_SCHEME, INVITE_BASE_URL };
