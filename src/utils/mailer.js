// SMTP transport and the fire-and-forget helper the controllers use.
//
// Notification mail must never hold up — or fail — an API request: a member
// added their expense, and whether the relay accepted the message is our
// problem, not theirs. Every send is therefore detached and logged on failure.
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'localhost';
const SMTP_PORT = Number(process.env.SMTP_PORT || 25);
const FROM_NAME = process.env.SMTP_FROM_NAME || 'PaisaSplit';
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'no-reply@paisasplit.app';

// Set MAIL_ENABLED=false to silence outgoing mail (handy in tests and local runs
// with no relay listening).
const ENABLED = String(process.env.MAIL_ENABLED ?? 'true').toLowerCase() !== 'false';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // The local Postfix relay listens on loopback, offers no AUTH and carries a
  // self-signed certificate, so no credentials are sent and the cert is not
  // verified. This mirrors how the other BondByte services talk to it.
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    // 465 is implicit TLS; everything else starts plain and may upgrade.
    secure: SMTP_PORT === 465,
    // Port 25 on the local relay offers no STARTTLS worth insisting on.
    ignoreTLS: SMTP_PORT === 25,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return transporter;
}

const from = `"${FROM_NAME}" <${FROM_EMAIL}>`;

// Sends one message. Resolves to true/false — never rejects.
async function sendMail({ to, subject, html, text }) {
  if (!ENABLED) return false;
  if (!to || !subject || !html) return false;

  try {
    await getTransporter().sendMail({ from, to, subject, html, text });
    return true;
  } catch (err) {
    console.error(`[mail] failed to send "${subject}" to ${to}:`, err.message);
    return false;
  }
}

// Sends a batch without making the caller wait. Use this from request handlers.
function sendMailAsync(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  const pending = list.filter(Boolean);
  if (!pending.length) return;

  // Detached on purpose: the HTTP response has already gone out by the time
  // these settle.
  setImmediate(() => {
    Promise.all(pending.map(sendMail)).catch((err) =>
      console.error('[mail] unexpected batch failure:', err.message)
    );
  });
}

module.exports = { sendMail, sendMailAsync, getTransporter, MAIL_ENABLED: ENABLED };
