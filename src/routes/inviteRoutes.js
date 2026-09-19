const express = require('express');
const Group = require('../models/Group');
const asyncHandler = require('../utils/asyncHandler');
const { APP_SCHEME, ANDROID_PACKAGE } = require('../utils/invite');

const router = express.Router();

// Escapes text before it goes into HTML, since group names are user-supplied.
const escapeHtml = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const TYPE_EMOJI = {
  family: '👨‍👩‍👧',
  friends: '🧑‍🤝‍🧑',
  couple: '💞',
  trip: '✈️',
  office: '💼',
  other: '📁',
};

const page = ({ title, body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; padding: 24px; background: #0f172a; color: #fff;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .card {
    background: #1e293b; border-radius: 20px; padding: 32px 28px;
    width: 100%; max-width: 380px; text-align: center;
  }
  .badge {
    width: 72px; height: 72px; margin: 0 auto 18px; border-radius: 20px;
    background: #334155; display: flex; align-items: center;
    justify-content: center; font-size: 34px; overflow: hidden;
  }
  .badge img { width: 100%; height: 100%; object-fit: cover; }
  h1 { margin: 0 0 6px; font-size: 22px; }
  .type {
    display: inline-block; margin-bottom: 14px; padding: 4px 12px;
    border-radius: 20px; background: rgba(13,148,136,.18); color: #14b8a6;
    font-size: 12px; font-weight: 600;
  }
  p { margin: 0 0 10px; color: #94a3b8; font-size: 14px; }
  .code {
    margin: 20px 0; padding: 12px; border-radius: 12px; background: #0f172a;
    border: 1px solid #334155; font-size: 24px; font-weight: 700;
    letter-spacing: 6px; color: #14b8a6; font-family: ui-monospace, monospace;
  }
  a.btn {
    display: block; margin-top: 18px; padding: 14px; border-radius: 12px;
    background: #0d9488; color: #fff; text-decoration: none; font-weight: 700;
  }
  .muted { margin-top: 16px; font-size: 12px; color: #64748b; }
  .error .badge { background: rgba(244,63,94,.15); }
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`;

// GET /join/:code — the landing page an invite link or scanned QR opens.
//
// On a phone with the app installed the deep link takes over; otherwise this
// shows the group and the code to type in by hand.
router.get('/:code', asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  const group = await Group.findOne({ inviteCode: code });

  if (!group || !group.isInviteActive()) {
    return res.status(group ? 410 : 404).send(
      page({
        title: 'Invite unavailable',
        body: `
          <div class="error">
            <div class="badge">🔗</div>
            <h1>Invite unavailable</h1>
            <p>${
              group
                ? 'This invite has expired or joining has been turned off.'
                : 'We could not find a group for that code.'
            }</p>
            <p class="muted">Ask whoever invited you for a fresh link.</p>
          </div>`,
      })
    );
  }

  const emoji = TYPE_EMOJI[group.type] || TYPE_EMOJI.other;
  const photo = group.photoUrl
    ? `<img src="${escapeHtml(group.photoUrl)}" alt="">`
    : emoji;
  const memberCount = group.members.length;

  res.send(
    page({
      title: `Join ${group.name}`,
      body: `
        <div class="badge">${photo}</div>
        <h1>${escapeHtml(group.name)}</h1>
        <div class="type">${escapeHtml(group.type)}</div>
        ${group.description ? `<p>${escapeHtml(group.description)}</p>` : ''}
        <p>${memberCount} ${memberCount === 1 ? 'member' : 'members'}</p>
        <div class="code">${escapeHtml(group.inviteCode)}</div>
        <a class="btn" id="open-app"
           href="${APP_SCHEME}://join/${escapeHtml(group.inviteCode)}">
          Open in the app
        </a>
        <p class="muted" id="hint">
          Don't have the app open? Enter the code above on the Join screen.
        </p>
        <script>
        (function () {
          var code = ${JSON.stringify(group.inviteCode)};
          var scheme = ${JSON.stringify(APP_SCHEME)};
          var pkg = ${JSON.stringify(ANDROID_PACKAGE)};
          var btn = document.getElementById('open-app');

          // Chrome on Android silently drops links to an unregistered custom
          // scheme, so the button there has to be an intent: URI naming the
          // package. Everywhere else the plain scheme works and is left alone.
          if (/Android/i.test(navigator.userAgent)) {
            btn.href =
              'intent://join/' + encodeURIComponent(code) +
              '#Intent;scheme=' + scheme +
              ';package=' + pkg +
              ';S.browser_fallback_url=' +
              encodeURIComponent(location.href) + ';end';
          }

          // If the app took over, the page gets hidden. If it is still visible
          // a moment later the app is not installed, so say so rather than
          // leaving the tap looking broken.
          btn.addEventListener('click', function () {
            setTimeout(function () {
              if (document.visibilityState === 'visible') {
                document.getElementById('hint').textContent =
                  'PaisaSplit does not seem to be installed. ' +
                  'Install it, then enter the code above on the Join screen.';
              }
            }, 1500);
          });
        })();
        </script>`,
    })
  );
}));

module.exports = router;
