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
const { sendPushToUsers } = require('./pushNotifications');

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

// Who to push to for a group event: every member but the actor, and only
// those who have actually opted in. Push is off by default (see
// User.pushNotifications), so this deliberately requires `true` rather than
// "not false" — a .lean() read skips schema defaults, so a document that
// somehow has no value stored for this field must NOT be treated as opted
// in. Unlike recipientsFor this doesn't require an email — push targets the
// FCM topic `user_<id>`, not an address.
async function pushRecipientsFor(group, actorId) {
  const ids = (group.members || [])
    .map(idOf)
    .filter((id) => id !== String(actorId));
  if (!ids.length) return [];

  const users = await User.find({
    _id: { $in: ids },
    pushNotifications: true,
  })
    .select('_id')
    .lean();
  return users.map((u) => String(u._id));
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

  const [recipients, pushUserIds, actorName] = await Promise.all([
    recipientsFor(group, actor._id),
    pushRecipientsFor(group, actor._id),
    nameOf(actor),
  ]);

  // Multi-payer expenses have several contributors; anyone in that list
  // "paid", not just the primary payer stored on `paidBy`.
  const payerIds = (expense.payers && expense.payers.length ? expense.payers : [{ user: expense.paidBy }])
    .map((p) => idOf(p.user));

  if (recipients.length) {
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
        recipientPaid: payerIds.includes(memberId),
        date: expense.date,
      });
      return { to: member.email, ...mail };
    });

    sendMailAsync(messages);
  }

  if (pushUserIds.length) {
    const verb = kind === 'added' ? 'added' : kind === 'updated' ? 'updated' : 'deleted';
    const currency = group.currency || 'INR';
    sendPushToUsers(pushUserIds, {
      title: `${actorName} ${verb} an expense`,
      body: `"${expense.description}" — ${currency} ${expense.amount} in ${group.name}`,
      data: { type: 'expense', groupId: String(group._id), expenseId: String(expense._id) },
    });
  }
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

  const [recipients, pushUserIds, actorName, fromName, toName] = await Promise.all([
    recipientsFor(group, actor._id),
    pushRecipientsFor(group, actor._id),
    nameOf(actor),
    nameOf(settlement.from),
    nameOf(settlement.to),
  ]);

  const build =
    kind === 'recorded' ? templates.settlementRecorded : templates.settlementDeleted;

  if (recipients.length) {
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

  if (pushUserIds.length) {
    const currency = group.currency || 'INR';
    const verb = kind === 'recorded' ? 'settled up' : 'undid a settlement';
    sendPushToUsers(pushUserIds, {
      title: `${actorName} ${verb}`,
      body: `${fromName} paid ${toName} ${currency} ${settlement.amount} in ${group.name}`,
      data: { type: 'settlement', groupId: String(group._id) },
    });
  }
}

/**
 * Someone joined a group — either by accepting an invite/entering a code
 * themselves, or by another member adding them directly. Every other
 * member (not the actor who caused it) gets a push; there is no
 * corresponding email today, so this is push-only.
 * @param {object} p
 * @param {object} p.group     Group document (after the new member was added).
 * @param {object} p.newMember The user who joined — populated or a plain doc.
 * @param {object} p.actor     req.user — who performed the join/add.
 */
async function notifyMemberJoined({ group, newMember, actor }) {
  const [pushUserIds, actorName] = await Promise.all([
    pushRecipientsFor(group, actor._id),
    nameOf(actor),
  ]);
  if (!pushUserIds.length) return;

  const joinedName = newMember && newMember.name ? newMember.name : 'Someone';
  const selfJoined = String(actor._id) === idOf(newMember);

  sendPushToUsers(pushUserIds, {
    title: selfJoined ? `${joinedName} joined ${group.name}` : `${actorName} added ${joinedName}`,
    body: `${joinedName} is now in "${group.name}"`,
    data: { type: 'member_joined', groupId: String(group._id) },
  });
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
  notifyMemberJoined,
  notifySafely,
  recipientsFor,
  pushRecipientsFor,
};
