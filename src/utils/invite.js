// Builds the shareable artefacts for a group invite: the deep link the app
// handles, an https fallback for phones without the app, and the QR payload.
//
// APP_SCHEME / INVITE_BASE_URL come from the environment so the same code works
// in development and production.
// Must stay unique to this app — the generic "splitwise" is claimed by the
// Splitwise app, which then swallows our invite links.
const APP_SCHEME = process.env.APP_SCHEME || 'paisasplit';
const INVITE_BASE_URL =
  process.env.INVITE_BASE_URL || 'https://splitwise.app/join';
// Android package id, used to build the `intent:` URI on the landing page.
// Chrome refuses plain custom-scheme links, but honours an intent: URI that
// names the target package.
const ANDROID_PACKAGE =
  process.env.ANDROID_PACKAGE || 'com.bondbyte.paisasplit';

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

module.exports = { buildInvite, APP_SCHEME, INVITE_BASE_URL, ANDROID_PACKAGE };
