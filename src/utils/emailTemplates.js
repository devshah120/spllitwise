// HTML for the notification emails, built on one shared shell so every message
// reads the same: brand header, white card, headline, amount, call to action.
//
// Written as table-based HTML with inline styles because mail clients — Gmail
// and Outlook above all — strip <style> blocks and ignore flexbox.

const BRAND_NAME = process.env.MAIL_BRAND_NAME || 'PaisaSplit';
const ACCENT = process.env.MAIL_ACCENT_COLOR || '#FF652F';
// Where "View in app" points. The invite base URL already names this server,
// so reuse its origin when nothing more specific is configured.
const APP_URL =
  process.env.MAIL_APP_URL ||
  process.env.PUBLIC_BASE_URL ||
  (process.env.INVITE_BASE_URL || '').replace(/\/join\/?$/, '') ||
  '';

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// "INR2,547.50" — matches the reference mails, which print the ISO code rather
// than a symbol so any currency renders in every client.
function money(amount, currency = 'INR') {
  const n = Number(amount || 0);
  const formatted = n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${String(currency || 'INR').toUpperCase()}${formatted}`;
}

function longDate(date) {
  const d = date ? new Date(date) : new Date();
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

// Strips tags for the plain-text alternative every message carries.
const toText = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/(p|div|tr|h1|h2|h3)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsaquo;/g, '>')
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&copy;/g, '(c)')
    // &amp; last, so "&amp;lt;" does not turn into a working "<".
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * The shared shell.
 * @param {object} p
 * @param {string} p.intro       Sentence above the card ("Hey Dev! ...").
 * @param {string} p.tag         Small label in the card's top-right.
 * @param {string} p.date        Small label in the card's top-left.
 * @param {string} p.title       Big headline inside the card.
 * @param {string} [p.total]     Muted line under the title.
 * @param {string} [p.highlight] Accent line ("You owe INR83.33").
 * @param {string} [p.note]      Extra muted line under the highlight.
 * @param {string} [p.footer]    Closing sentence under the card.
 */
function shell({ intro, tag, date, title, total, highlight, note, footer }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

        <tr>
          <td align="center" style="padding:16px 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:bold;color:#1cc29f;">
            ${esc(BRAND_NAME)}
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:24px 24px 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#333333;background-color:#ffffff;">
            ${intro}
          </td>
        </tr>

        <tr>
          <td style="background-color:#ffffff;padding:0 24px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e0e0e0;border-radius:4px;">
              <tr>
                <td style="padding:16px 20px 4px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#888888;">
                  ${esc(date)}
                </td>
                <td align="right" style="padding:16px 20px 4px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#888888;">
                  ${esc(tag)}
                </td>
              </tr>
              <tr>
                <td colspan="2" align="center" style="padding:18px 20px 6px;font-family:Helvetica,Arial,sans-serif;font-size:26px;line-height:32px;color:#333333;">
                  ${esc(title)}
                </td>
              </tr>
              ${
                total
                  ? `<tr><td colspan="2" align="center" style="padding:2px 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#555555;">${esc(
                      total
                    )}</td></tr>`
                  : ''
              }
              ${
                highlight
                  ? `<tr><td colspan="2" align="center" style="padding:2px 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:${ACCENT};">${esc(
                      highlight
                    )}</td></tr>`
                  : ''
              }
              ${
                note
                  ? `<tr><td colspan="2" align="center" style="padding:6px 20px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#888888;">${esc(
                      note
                    )}</td></tr>`
                  : ''
              }
              <tr>
                <td colspan="2" align="center" style="padding:22px 20px 26px;">
                  ${
                    APP_URL
                      ? `<a href="${esc(
                          APP_URL
                        )}" style="display:inline-block;background-color:${ACCENT};color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 32px;border-radius:4px;">View in ${esc(
                          BRAND_NAME
                        )}</a>`
                      : ''
                  }
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="background-color:#ffffff;padding:18px 32px 28px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:19px;color:#888888;">
            ${footer || ''}
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:18px 24px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:17px;color:#aaaaaa;">
            You are receiving this because you are a member of this group on ${esc(
              BRAND_NAME
            )}.<br>Turn these off any time in Settings &rsaquo; Notifications.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// Standing line at the bottom of every notification, as in the reference mails.
const confusedFooter = (actorName) =>
  `If you&#39;re confused about this, just hit reply to send an email to ${esc(
    actorName
  )} and figure out what&#39;s going on.`;

/**
 * "'Hotel Dwarvati' (INR500.00) added by Devarsh"
 * @param {object} p
 * @param {string} p.recipientName
 * @param {string} p.actorName      Who added the expense.
 * @param {string} p.groupName
 * @param {string} p.description
 * @param {number} p.amount         Expense total.
 * @param {string} p.currency
 * @param {number} p.share          What the recipient owes (0 when nothing).
 * @param {boolean} p.recipientPaid True when the recipient is the payer.
 * @param {Date}   p.date
 */
function expenseAdded(p) {
  const total = money(p.amount, p.currency);
  const subject = `'${p.description}' (${total}) added by ${p.actorName}`;

  const highlight = p.recipientPaid
    ? `You paid ${total}`
    : p.share > 0
      ? `You owe ${money(p.share, p.currency)}`
      : 'You are not involved in this expense';

  const html = shell({
    intro: `Hey ${esc(p.recipientName)}! <strong>${esc(
      p.actorName
    )}</strong> just added <strong>&ldquo;${esc(
      p.description
    )}&rdquo;</strong> to the group <strong>&ldquo;${esc(p.groupName)}&rdquo;</strong>.`,
    tag: 'Expense',
    date: longDate(p.date),
    title: p.description,
    total: `Total: ${total}`,
    highlight,
    footer: confusedFooter(p.actorName),
  });

  return { subject, html, text: toText(html) };
}

/** Same card, for an edited expense. */
function expenseUpdated(p) {
  const total = money(p.amount, p.currency);
  const subject = `'${p.description}' (${total}) updated by ${p.actorName}`;

  const highlight = p.recipientPaid
    ? `You paid ${total}`
    : p.share > 0
      ? `You owe ${money(p.share, p.currency)}`
      : 'You are not involved in this expense';

  const html = shell({
    intro: `Hey ${esc(p.recipientName)}! <strong>${esc(
      p.actorName
    )}</strong> just updated <strong>&ldquo;${esc(
      p.description
    )}&rdquo;</strong> in the group <strong>&ldquo;${esc(p.groupName)}&rdquo;</strong>.`,
    tag: 'Expense updated',
    date: longDate(p.date),
    title: p.description,
    total: `New total: ${total}`,
    highlight,
    footer: confusedFooter(p.actorName),
  });

  return { subject, html, text: toText(html) };
}

/** Deleted expense — nothing is owed any more, so the card states the removal. */
function expenseDeleted(p) {
  const total = money(p.amount, p.currency);
  const subject = `'${p.description}' (${total}) deleted by ${p.actorName}`;

  const html = shell({
    intro: `Hey ${esc(p.recipientName)}! <strong>${esc(
      p.actorName
    )}</strong> just deleted <strong>&ldquo;${esc(
      p.description
    )}&rdquo;</strong> from the group <strong>&ldquo;${esc(p.groupName)}&rdquo;</strong>.`,
    tag: 'Expense removed',
    date: longDate(p.date),
    title: p.description,
    total: `Was: ${total}`,
    highlight: 'This expense no longer counts towards your balance.',
    footer: confusedFooter(p.actorName),
  });

  return { subject, html, text: toText(html) };
}

/**
 * "Devarsh paid you INR2,547.50 on PaisaSplit"
 * @param {object} p
 * @param {string} p.recipientName
 * @param {string} p.actorName  Who recorded the payment.
 * @param {string} p.fromName   Payer.
 * @param {string} p.toName     Payee.
 * @param {string} p.groupName
 * @param {number} p.amount
 * @param {string} p.currency
 * @param {'payee'|'payer'|'observer'} p.role  The recipient's part in it.
 * @param {string} [p.note]
 * @param {Date}   p.date
 */
function settlementRecorded(p) {
  const amount = money(p.amount, p.currency);

  let subject;
  let intro;
  let highlight;

  if (p.role === 'payee') {
    subject = `${p.fromName} paid you ${amount} on ${BRAND_NAME}`;
    intro = `Hey ${esc(p.recipientName)}! FYI: <strong>${esc(
      p.fromName
    )}</strong> just recorded a payment to you in the group <strong>&ldquo;${esc(
      p.groupName
    )}&rdquo;</strong>.`;
    highlight = `You received ${amount}`;
  } else if (p.role === 'payer') {
    subject = `You paid ${p.toName} ${amount} on ${BRAND_NAME}`;
    intro = `Hey ${esc(p.recipientName)}! FYI: <strong>${esc(
      p.actorName
    )}</strong> just recorded your payment to <strong>${esc(
      p.toName
    )}</strong> in the group <strong>&ldquo;${esc(p.groupName)}&rdquo;</strong>.`;
    highlight = `You paid ${amount}`;
  } else {
    subject = `${p.fromName} paid ${p.toName} ${amount} on ${BRAND_NAME}`;
    intro = `Hey ${esc(p.recipientName)}! FYI: <strong>${esc(
      p.fromName
    )}</strong> just recorded a payment to <strong>${esc(
      p.toName
    )}</strong> in the group <strong>&ldquo;${esc(p.groupName)}&rdquo;</strong>.`;
    highlight = `${p.fromName} paid ${p.toName} ${amount}`;
  }

  const html = shell({
    intro,
    tag: 'Payment',
    date: longDate(p.date),
    title: `Payment to ${p.toName}`,
    highlight,
    note: p.note || '',
    footer: confusedFooter(p.role === 'payer' ? p.toName : p.fromName),
  });

  return { subject, html, text: toText(html) };
}

/** Settlement removed — balances go back to what they were. */
function settlementDeleted(p) {
  const amount = money(p.amount, p.currency);
  const subject = `A payment of ${amount} was deleted by ${p.actorName}`;

  const html = shell({
    intro: `Hey ${esc(p.recipientName)}! <strong>${esc(
      p.actorName
    )}</strong> just deleted a payment from <strong>${esc(
      p.fromName
    )}</strong> to <strong>${esc(p.toName)}</strong> in the group <strong>&ldquo;${esc(
      p.groupName
    )}&rdquo;</strong>.`,
    tag: 'Payment removed',
    date: longDate(p.date),
    title: `Payment to ${p.toName}`,
    total: `Was: ${amount}`,
    highlight: 'Your balance has been restored to what it was before.',
    footer: confusedFooter(p.actorName),
  });

  return { subject, html, text: toText(html) };
}

/**
 * Sent once, when an account is created. Unlike the group notifications this
 * one carries no amount, so it uses its own body: account details, then what
 * to do next.
 * @param {object} p
 * @param {string} p.name      The new member's name.
 * @param {string} p.email     Where the mail is going, echoed back in the card.
 * @param {'local'|'google'} [p.provider] How they signed up.
 * @param {Date}   [p.date]
 */
function welcome(p) {
  // Plain ASCII, so the subject needs no RFC 2047 encoding in any client.
  const subject = `Welcome to ${BRAND_NAME} - your account is ready`;
  const signedUpWith = p.provider === 'google' ? 'Google Sign-In' : 'Email and password';

  const row = (label, value) => `
    <tr>
      <td style="padding:0 0 14px;font-family:Helvetica,Arial,sans-serif;">
        <div style="font-size:11px;color:#888888;text-transform:uppercase;letter-spacing:0.4px;padding-bottom:4px;">${esc(
          label
        )}</div>
        <div style="font-size:14px;color:#333333;font-weight:500;">${esc(value)}</div>
      </td>
    </tr>`;

  const step = (title, detail) => `
    <tr>
      <td style="padding:0 0 14px;font-family:Helvetica,Arial,sans-serif;">
        <div style="font-size:14px;color:#333333;font-weight:500;">${esc(title)}</div>
        <div style="font-size:13px;color:#777777;padding-top:3px;">${esc(detail)}</div>
      </td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:6px;">

        <tr>
          <td style="background-color:#1cc29f;padding:30px;border-radius:6px 6px 0 0;font-family:Helvetica,Arial,sans-serif;">
            <div style="color:#ffffff;font-size:24px;font-weight:bold;">${esc(BRAND_NAME)}</div>
            <div style="color:rgba(255,255,255,0.88);font-size:13px;padding-top:6px;">Your account is ready</div>
          </td>
        </tr>

        <tr>
          <td style="padding:30px 30px 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#333333;">
            Hi <strong>${esc(p.name || 'there')}</strong>,
            <p style="margin:14px 0 0;color:#555555;font-size:14px;line-height:22px;">
              Thanks for joining ${esc(
                BRAND_NAME
              )}. Your account is set up and ready to use. Create a group, add the people you share costs with, and let ${esc(
    BRAND_NAME
  )} keep track of who owes what.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 30px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e0e0e0;border-radius:6px;">
              <tr>
                <td style="padding:22px 22px 8px;">
                  <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;color:#1cc29f;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:16px;">Account details</div>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${row('Name', p.name || 'User')}
                    ${row('Email', p.email || '')}
                    ${row('Signed up with', signedUpWith)}
                    ${row('Created', longDate(p.date))}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:26px 30px 0;font-family:Helvetica,Arial,sans-serif;">
            <div style="font-size:12px;font-weight:bold;color:#333333;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:16px;">What&#39;s next</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${step('Create a group', 'A trip, a flat, or anything else you split.')}
              ${step('Invite your people', 'Share the invite link or let them scan the QR code.')}
              ${step('Add an expense', 'Split it equally, by exact amounts, or by percentage.')}
              ${step('Settle up', 'Record payments and watch the balances clear.')}
            </table>
          </td>
        </tr>

        ${
          APP_URL
            ? `<tr>
          <td align="center" style="padding:28px 30px 4px;">
            <a href="${esc(
              APP_URL
            )}" style="display:inline-block;background-color:${ACCENT};color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 36px;border-radius:4px;">Open ${esc(
                BRAND_NAME
              )}</a>
          </td>
        </tr>`
            : ''
        }

        <tr>
          <td style="padding:26px 30px 30px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#888888;">
            If you did not create this account, you can safely ignore this email.
          </td>
        </tr>

      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td align="center" style="padding:18px 24px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:17px;color:#aaaaaa;">
            &copy; ${new Date().getFullYear()} ${esc(
    BRAND_NAME
  )}. This is an automated message.<br>Manage your email preferences in Settings &rsaquo; Notifications.
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html, text: toText(html) };
}

/**
 * "Devarsh invited you to 'NATHDWARA 2026' on PaisaSplit"
 *
 * Goes to someone who is not on the app yet, so it carries the invite code and
 * the join link rather than the usual "view in app" button, and it never calls
 * the reader a member of anything.
 *
 * @param {object} p
 * @param {string} p.inviterName  Who sent the invite.
 * @param {string} p.groupName
 * @param {string} p.inviteCode   The code to type on the Join screen.
 * @param {string} p.joinUrl      Landing page that opens the app.
 * @param {number} p.memberCount
 * @param {Date}   p.date
 */
function groupInvite(p) {
  const subject = `${p.inviterName} invited you to '${p.groupName}' on ${BRAND_NAME}`;
  const members = `${p.memberCount} ${p.memberCount === 1 ? 'member' : 'members'}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:6px;">

        <tr>
          <td style="background-color:#1cc29f;padding:30px;border-radius:6px 6px 0 0;font-family:Helvetica,Arial,sans-serif;">
            <div style="color:#ffffff;font-size:24px;font-weight:bold;">${esc(BRAND_NAME)}</div>
            <div style="color:rgba(255,255,255,0.88);font-size:13px;padding-top:6px;">You have been invited to a group</div>
          </td>
        </tr>

        <tr>
          <td style="padding:30px 30px 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#333333;">
            Hi there,
            <p style="margin:14px 0 0;color:#555555;font-size:14px;line-height:22px;">
              <strong>${esc(p.inviterName)}</strong> has invited you to join
              <strong>${esc(p.groupName)}</strong> (${esc(members)}) on ${esc(BRAND_NAME)},
              where you can split bills and keep track of who owes what.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 30px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e0e0e0;border-radius:6px;">
              <tr>
                <td align="center" style="padding:22px;font-family:Helvetica,Arial,sans-serif;">
                  <div style="font-size:11px;color:#888888;text-transform:uppercase;letter-spacing:0.4px;padding-bottom:10px;">Your invite code</div>
                  <div style="font-size:26px;font-weight:bold;letter-spacing:6px;color:#1cc29f;font-family:Courier,monospace;">${esc(
                    p.inviteCode
                  )}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:26px 30px 4px;">
            <a href="${esc(
              p.joinUrl
            )}" style="display:inline-block;background-color:${ACCENT};color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 36px;border-radius:4px;">Join ${esc(
    p.groupName
  )}</a>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:14px 30px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#888888;">
            Already have ${esc(
              BRAND_NAME
            )}? Open it and enter the code above on the Join screen.
          </td>
        </tr>

        <tr>
          <td style="padding:26px 30px 30px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#888888;">
            If you were not expecting this invite, you can safely ignore this email.
          </td>
        </tr>

      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td align="center" style="padding:18px 24px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:17px;color:#aaaaaa;">
            &copy; ${new Date().getFullYear()} ${esc(
    BRAND_NAME
  )}. This is an automated message.
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html, text: toText(html) };
}

module.exports = {
  welcome,
  groupInvite,
  expenseAdded,
  expenseUpdated,
  expenseDeleted,
  settlementRecorded,
  settlementDeleted,
  money,
  longDate,
};
