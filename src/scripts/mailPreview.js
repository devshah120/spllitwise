// Renders every notification email to preview/*.html, and optionally sends one
// through the configured SMTP relay.
//
//   node src/scripts/mailPreview.js                 # write the HTML previews
//   node src/scripts/mailPreview.js you@example.com # also send a live test
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const templates = require('../utils/emailTemplates');
const { sendMail } = require('../utils/mailer');

const outDir = path.join(__dirname, '..', '..', 'preview');

const samples = {
  welcome: templates.welcome({
    name: 'Dev',
    email: 'dev@example.com',
    provider: 'local',
    date: new Date(),
  }),
  'welcome-google': templates.welcome({
    name: 'Devarsh',
    email: 'devarsh@example.com',
    provider: 'google',
    date: new Date(),
  }),
  'expense-added': templates.expenseAdded({
    recipientName: 'Dev',
    actorName: 'Devarsh',
    groupName: 'DWARKA TRIP',
    description: 'Hotel Dwarvati',
    amount: 500,
    currency: 'INR',
    share: 83.33,
    recipientPaid: false,
    date: new Date(),
  }),
  'expense-updated': templates.expenseUpdated({
    recipientName: 'Dev',
    actorName: 'Devarsh',
    groupName: 'DWARKA TRIP',
    description: 'Hotel Dwarvati',
    amount: 750,
    currency: 'INR',
    share: 125,
    recipientPaid: false,
    date: new Date(),
  }),
  'expense-deleted': templates.expenseDeleted({
    recipientName: 'Dev',
    actorName: 'Devarsh',
    groupName: 'DWARKA TRIP',
    description: 'Hotel Dwarvati',
    amount: 500,
    currency: 'INR',
    date: new Date(),
  }),
  'settlement-payee': templates.settlementRecorded({
    recipientName: 'Dev',
    actorName: 'Devarsh',
    fromName: 'Devarsh',
    toName: 'Dev',
    groupName: 'Nathdwara',
    amount: 2547.5,
    currency: 'INR',
    role: 'payee',
    date: new Date(),
  }),
  'settlement-payer': templates.settlementRecorded({
    recipientName: 'Devarsh',
    actorName: 'Dev',
    fromName: 'Devarsh',
    toName: 'Dev',
    groupName: 'Nathdwara',
    amount: 2547.5,
    currency: 'INR',
    role: 'payer',
    date: new Date(),
  }),
  'settlement-deleted': templates.settlementDeleted({
    recipientName: 'Dev',
    actorName: 'Devarsh',
    fromName: 'Devarsh',
    toName: 'Dev',
    groupName: 'Nathdwara',
    amount: 2547.5,
    currency: 'INR',
    date: new Date(),
  }),
};

fs.mkdirSync(outDir, { recursive: true });
for (const [name, mail] of Object.entries(samples)) {
  fs.writeFileSync(path.join(outDir, `${name}.html`), mail.html, 'utf8');
  console.log(`${name.padEnd(20)} ${mail.subject}`);
}
console.log(`\nPreviews written to ${outDir}`);

const target = process.argv[2];
if (target) {
  const mail = samples['settlement-payee'];
  console.log(`\nSending "${mail.subject}" to ${target} via ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} ...`);
  sendMail({ to: target, ...mail }).then((ok) => {
    console.log(ok ? 'Sent.' : 'Not sent — see the error above.');
    process.exit(ok ? 0 : 1);
  });
}
