// Decides who hears about an event and with what numbers, then hands the
// messages to the mailer.
//
// Three rules hold everywhere:
//   1. The person who performed the action is never mailed about their own action.
//   2. A member with emailNotifications off, or no email address, is skipped.
//   3. Nothing here is awaited by a request handler — see sendMailAsync.
const User = require('../models/User');
const templates = require('./emailTemplates');
const { sendMailAsync } = require('./mailer');
const { buildInvite } = require('./invite');

const idOf = (value) => String(value && value._id ? value._id : value);

// Loads the mailable members of a group, minus the actor.
async function recipientsFor(group, actorId) {
  const ids = (group.members || [])
    .map(idOf)
    .filter((id) => id !== String(actorId));
  if (!ids.length) return [];

  return User.find({
    _id: { $in: ids },
    email: { $exists: true, $nin: [null, ''] },
    emailNotifications: { $ne: false },
  })
    .select('name email')
    .lean();
}

async function nameOf(userId) {
  if (!userId) return 'Someone';
  if (userId.name) return userId.name;
  const user = await User.findById(idOf(userId)).select('name').lean();
  return user ? user.name : 'Someone';
}

// What a given member owes on an expense, 0 when they are not a participant.
const shareFor = (splits, userId) => {
  const split = (splits || []).find((s) => idOf(s.user) === String(userId));
  return split ? Number(split.amount) : 0;
};

/**
 * Welcome mail, sent once when an account is created.
 * Unlike the group notifications this one goes to the person who acted, so the
 * "never mail the actor" rule does not apply — but a user with no email, or one
 * who has already opted out, is still skipped.
 * @param {object} user  The freshly created User document.
 */
async function notifyWelcome(user) {
  if (!user || !user.email) return;
  if (user.emailNotifications === false) return;

  const mail = templates.welcome({
    name: user.name,
    email: user.email,
    provider: user.provider,
    date: user.createdAt || new Date(),
  });

  sendMailAsync({ to: user.email, ...mail });
}

/**
 * Expense created / updated / deleted.
 * @param {'added'|'updated'|'deleted'} kind
 * @param {object} p
 * @param {object} p.group    Group document.
 * @param {object} p.expense  Expense document (or plain object).
 * @param {object} p.actor    req.user — who made the change.
 */
async function notifyExpense(kind, { group, expense, actor }) {
  const build =
    kind === 'added'
      ? templates.expenseAdded
      : kind === 'updated'
        ? templates.expenseUpdated
        : templates.expenseDeleted;

  const [recipients, actorName] = await Promise.all([
    recipientsFor(group, actor._id),
    nameOf(actor),
  ]);
  if (!recipients.length) return;

  const payerId = idOf(expense.paidBy);

  const messages = recipients.map((member) => {
    const memberId = String(member._id);
    const mail = build({
      recipientName: member.name,
      actorName,
      groupName: group.name,
      description: expense.description,
      amount: expense.amount,
      currency: group.currency || 'INR',
      share: shareFor(expense.splits, memberId),
      recipientPaid: memberId === payerId,
      date: expense.date,
    });
    return { to: member.email, ...mail };
  });

  sendMailAsync(messages);
}

/**
 * Settlement recorded or deleted. Both parties hear about it, as does the rest
 * of the group — matching the reference mails, where an uninvolved member still
 * sees "X paid Y".
 * @param {'recorded'|'deleted'} kind
 * @param {object} p
 * @param {object} p.group
 * @param {object} p.settlement
 * @param {object} p.actor
 */
async function notifySettlement(kind, { group, settlement, actor }) {
  const fromId = idOf(settlement.from);
  const toId = idOf(settlement.to);

  const [recipients, actorName, fromName, toName] = await Promise.all([
    recipientsFor(group, actor._id),
    nameOf(actor),
    nameOf(settlement.from),
    nameOf(settlement.to),
  ]);
  if (!recipients.length) return;

  const build =
    kind === 'recorded' ? templates.settlementRecorded : templates.settlementDeleted;

  const messages = recipients.map((member) => {
    const memberId = String(member._id);
    const role = memberId === toId ? 'payee' : memberId === fromId ? 'payer' : 'observer';

    const mail = build({
      recipientName: member.name,
      actorName,
      fromName,
      toName,
      groupName: group.name,
      amount: settlement.amount,
      currency: group.currency || 'INR',
      role,
      note: settlement.note,
      date: settlement.createdAt || new Date(),
    });
    return { to: member.email, ...mail };
  });

  sendMailAsync(messages);
}

// Wraps a notify call so a failure in it can never break the request that
// triggered it — the write has already succeeded and been responded to.
function notifySafely(promiseFactory) {
  Promise.resolve()
    .then(promiseFactory)
    .catch((err) => console.error('[notify] failed:', err.message));
}

/**
 * Someone was invited to a group by email address.
 *
 * Unlike every other notification here the recipient is not a member and
 * usually has no account, so there is no preference to respect — the address
 * was typed in deliberately to reach them.
 *
 * @param {object} p
 * @param {string} p.email  Where to send it.
 * @param {object} p.group  Group document.
 * @param {object} p.actor  req.user — who sent the invite.
 */
async function notifyGroupInvite({ email, group, actor }) {
  if (!email) return;

  const invite = buildInvite(group);
  // No code means invites are off for this group; there is nothing to send.
  if (!invite) return;

  const mail = templates.groupInvite({
    inviterName: await nameOf(actor),
    groupName: group.name,
    inviteCode: invite.code,
    joinUrl: invite.link,
    memberCount: (group.members || []).length,
    date: new Date(),
  });

  sendMailAsync({ to: email, ...mail });
}

module.exports = {
  notifyWelcome,
  notifyGroupInvite,
  notifyExpense,
  notifySettlement,
  notifySafely,
  recipientsFor,
};
