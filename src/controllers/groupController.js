const Group = require('../models/Group');
const { GROUP_TYPES, generateInviteCode } = require('../models/Group');
const User = require('../models/User');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/splitCalculator');
const { computeNet, simplifyDebts } = require('../utils/balances');
const { buildInvite } = require('../utils/invite');

const MEMBER_FIELDS = 'name email mobileNumber avatarUrl';

// Helper: true if userId is a member of the group.
const isMember = (group, userId) =>
  group.members.some((m) => {
    const id = m._id ? m._id : m;
    return id.toString() === userId.toString();
  });

const isCreator = (group, userId) =>
  (group.createdBy._id ? group.createdBy._id : group.createdBy).toString() ===
  userId.toString();

// Shapes a group for the client, adding the invite payload only for members.
const present = (group, viewerId) => {
  const obj = group.toObject ? group.toObject() : group;
  const visible = viewerId && isMember(group, viewerId);
  return {
    ...obj,
    invites: visible
      ? (obj.invites || []).filter((i) => i.status === 'pending')
      : undefined,
    invite: visible ? buildInvite(group) : undefined,
  };
};

const loadGroup = (id) =>
  Group.findById(id)
    .populate('members', MEMBER_FIELDS)
    .populate('createdBy', 'name email avatarUrl');

// POST /api/groups
const createGroup = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    type,
    photoUrl,
    balanceLimit,
    currency,
    memberIds = [],
  } = req.body;

  if (type && !GROUP_TYPES.includes(type)) {
    return res
      .status(400)
      .json({ message: `Group type must be one of: ${GROUP_TYPES.join(', ')}` });
  }

  // Only accept member ids that actually exist.
  const requested = [...new Set(memberIds.map(String))].filter(
    (id) => id !== req.user._id.toString()
  );
  if (requested.length) {
    const found = await User.find({ _id: { $in: requested } }).select('_id');
    if (found.length !== requested.length) {
      return res.status(400).json({ message: 'One or more members do not exist' });
    }
  }

  // Creator is always a member.
  const members = [req.user._id.toString(), ...requested];

  const group = await Group.create({
    name,
    description,
    type: type || 'other',
    photoUrl: photoUrl || '',
    balanceLimit: balanceLimit != null ? Number(balanceLimit) : 0,
    currency: currency || req.user.preferredCurrency || 'INR',
    createdBy: req.user._id,
    members,
  });

  const populated = await loadGroup(group._id);
  res.status(201).json({ group: present(populated, req.user._id) });
});

// GET /api/groups  — groups the current user belongs to.
const getMyGroups = asyncHandler(async (req, res) => {
  const filter = { members: req.user._id };
  if (req.query.type) filter.type = req.query.type;

  const groups = await Group.find(filter)
    .populate('members', MEMBER_FIELDS)
    .populate('createdBy', 'name email avatarUrl')
    .sort('-updatedAt');

  res.json({ groups: groups.map((g) => present(g, req.user._id)) });
});

// GET /api/groups/types  — the catalogue the client renders its picker from.
const getGroupTypes = asyncHandler(async (req, res) => {
  res.json({ types: GROUP_TYPES });
});

// GET /api/groups/:id
const getGroup = asyncHandler(async (req, res) => {
  const group = await loadGroup(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }
  res.json({ group: present(group, req.user._id) });
});

// PATCH /api/groups/:id  — update details (creator only).
const updateGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isCreator(group, req.user._id)) {
    return res.status(403).json({ message: 'Only the creator can update this group' });
  }

  const { name, description, type, photoUrl, balanceLimit, currency } = req.body;

  if (type !== undefined) {
    if (!GROUP_TYPES.includes(type)) {
      return res
        .status(400)
        .json({ message: `Group type must be one of: ${GROUP_TYPES.join(', ')}` });
    }
    group.type = type;
  }
  if (name !== undefined) group.name = name;
  if (description !== undefined) group.description = description;
  if (photoUrl !== undefined) group.photoUrl = photoUrl;
  if (currency !== undefined) group.currency = currency;
  if (balanceLimit !== undefined) {
    const limit = Number(balanceLimit);
    if (Number.isNaN(limit) || limit < 0) {
      return res.status(400).json({ message: 'Balance limit must be zero or greater' });
    }
    group.balanceLimit = limit;
  }

  await group.save();
  const populated = await loadGroup(group._id);
  res.json({ group: present(populated, req.user._id) });
});

// POST /api/groups/:id/members  — add an existing user by id, email or mobile.
const addMember = asyncHandler(async (req, res) => {
  const { userId, email, mobileNumber } = req.body;
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  let user = null;
  if (userId) user = await User.findById(userId);
  else if (email) user = await User.findOne({ email: String(email).toLowerCase() });
  else if (mobileNumber) user = await User.findOne({ mobileNumber });
  else {
    return res
      .status(400)
      .json({ message: 'Provide a userId, email or mobileNumber' });
  }

  if (!user) {
    return res.status(404).json({ message: 'No user found with those details' });
  }
  if (isMember(group, user._id)) {
    return res.status(409).json({ message: 'User is already a member' });
  }

  group.members.push(user._id);
  // Clear any pending invite that this join satisfies.
  group.invites.forEach((inv) => {
    if (
      inv.status === 'pending' &&
      ((inv.email && inv.email === user.email) ||
        (inv.mobileNumber && inv.mobileNumber === user.mobileNumber))
    ) {
      inv.status = 'accepted';
    }
  });
  await group.save();

  const populated = await loadGroup(group._id);
  res.json({ group: present(populated, req.user._id) });
});

// POST /api/groups/:id/invites  — record an invitation by email or mobile.
// If the person already has an account they are added straight away.
const inviteMember = asyncHandler(async (req, res) => {
  const { email, mobileNumber } = req.body;
  if (!email && !mobileNumber) {
    return res.status(400).json({ message: 'Provide an email or mobileNumber' });
  }

  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const normalisedEmail = email ? String(email).toLowerCase().trim() : undefined;

  // Already on the app? Add them directly.
  const existing = await User.findOne(
    normalisedEmail ? { email: normalisedEmail } : { mobileNumber }
  );
  if (existing) {
    if (isMember(group, existing._id)) {
      return res.status(409).json({ message: 'User is already a member' });
    }
    group.members.push(existing._id);
    await group.save();
    const populated = await loadGroup(group._id);
    return res.json({
      group: present(populated, req.user._id),
      added: true,
      message: `${existing.name} was added to the group`,
    });
  }

  const duplicate = group.invites.find(
    (inv) =>
      inv.status === 'pending' &&
      ((normalisedEmail && inv.email === normalisedEmail) ||
        (mobileNumber && inv.mobileNumber === mobileNumber))
  );
  if (duplicate) {
    return res.status(409).json({ message: 'An invite is already pending for them' });
  }

  group.invites.push({
    email: normalisedEmail,
    mobileNumber,
    invitedBy: req.user._id,
  });
  await group.save();

  const populated = await loadGroup(group._id);
  res.status(201).json({
    group: present(populated, req.user._id),
    added: false,
    message: 'Invite recorded — share the group link or QR code with them',
  });
});

// DELETE /api/groups/:id/invites/:inviteId  — withdraw a pending invite.
const revokeInvite = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const invite = group.invites.id(req.params.inviteId);
  if (!invite) return res.status(404).json({ message: 'Invite not found' });

  invite.status = 'revoked';
  await group.save();

  const populated = await loadGroup(group._id);
  res.json({ group: present(populated, req.user._id) });
});

// GET /api/groups/:id/invite  — current code, link and QR payload.
const getInvite = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }
  res.json({ invite: buildInvite(group) });
});

// POST /api/groups/:id/invite/rotate  — issue a fresh code (creator only).
// Any previously shared link or QR code stops working.
const rotateInvite = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isCreator(group, req.user._id)) {
    return res
      .status(403)
      .json({ message: 'Only the creator can regenerate the invite code' });
  }

  const { expiresInHours } = req.body || {};
  group.inviteCode = generateInviteCode();
  group.inviteEnabled = true;
  group.inviteExpiresAt = expiresInHours
    ? new Date(Date.now() + Number(expiresInHours) * 60 * 60 * 1000)
    : null;
  await group.save();

  res.json({ invite: buildInvite(group) });
});

// PATCH /api/groups/:id/invite  — turn joining on or off (creator only).
const setInviteEnabled = asyncHandler(async (req, res) => {
  const { enabled, expiresInHours } = req.body;
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isCreator(group, req.user._id)) {
    return res
      .status(403)
      .json({ message: 'Only the creator can change invite settings' });
  }

  if (enabled !== undefined) group.inviteEnabled = Boolean(enabled);
  if (expiresInHours !== undefined) {
    group.inviteExpiresAt = expiresInHours
      ? new Date(Date.now() + Number(expiresInHours) * 60 * 60 * 1000)
      : null;
  }
  await group.save();

  res.json({ invite: buildInvite(group) });
});

// GET /api/groups/join/:code  — preview a group before joining.
// Authenticated, but does not require membership.
const previewInvite = asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  const group = await Group.findOne({ inviteCode: code }).populate(
    'createdBy',
    'name avatarUrl'
  );
  if (!group) return res.status(404).json({ message: 'Invalid invite code' });

  res.json({
    group: {
      id: group._id,
      name: group.name,
      description: group.description,
      type: group.type,
      photoUrl: group.photoUrl,
      memberCount: group.members.length,
      createdBy: group.createdBy,
      currency: group.currency,
    },
    active: group.isInviteActive(),
    alreadyMember: isMember(group, req.user._id),
  });
});

// POST /api/groups/join  — join using an invite code from a link or QR scan.
const joinByCode = asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase().trim();
  if (!code) return res.status(400).json({ message: 'Invite code is required' });

  const group = await Group.findOne({ inviteCode: code });
  if (!group) return res.status(404).json({ message: 'Invalid invite code' });

  if (!group.inviteEnabled) {
    return res.status(403).json({ message: 'Joining is turned off for this group' });
  }
  if (group.inviteExpiresAt && group.inviteExpiresAt.getTime() < Date.now()) {
    return res.status(410).json({ message: 'This invite link has expired' });
  }

  if (isMember(group, req.user._id)) {
    const populated = await loadGroup(group._id);
    return res.json({
      group: present(populated, req.user._id),
      joined: false,
      message: 'You are already a member of this group',
    });
  }

  group.members.push(req.user._id);
  // Mark a matching pending invite as accepted.
  group.invites.forEach((inv) => {
    if (
      inv.status === 'pending' &&
      ((inv.email && inv.email === req.user.email) ||
        (inv.mobileNumber && inv.mobileNumber === req.user.mobileNumber))
    ) {
      inv.status = 'accepted';
    }
  });
  await group.save();

  const populated = await loadGroup(group._id);
  res.json({
    group: present(populated, req.user._id),
    joined: true,
    message: `Welcome to ${group.name}`,
  });
});

// DELETE /api/groups/:id/members/:userId  — remove a member.
// The creator can remove anyone; a member can remove themselves (leave).
const removeMember = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });

  const { userId } = req.params;
  const selfRemoval = userId === req.user._id.toString();

  if (!selfRemoval && !isCreator(group, req.user._id)) {
    return res.status(403).json({ message: 'Only the creator can remove members' });
  }
  if (!isMember(group, userId)) {
    return res.status(404).json({ message: 'User is not a member of this group' });
  }
  if (userId === group.createdBy.toString()) {
    return res.status(400).json({ message: 'Cannot remove the group creator' });
  }

  // Refuse to drop someone who still owes or is owed money.
  const balance = await memberBalance(group, userId);
  if (Math.abs(balance) > 0.01) {
    return res.status(409).json({
      message: 'Settle up before leaving — this member still has an outstanding balance',
      balance: round2(balance),
    });
  }

  group.members = group.members.filter((m) => m.toString() !== userId);
  await group.save();

  const populated = await loadGroup(group._id);
  res.json({ group: present(populated, req.user._id) });
});

// DELETE /api/groups/:id  — creator only; removes group + its expenses/settlements.
const deleteGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isCreator(group, req.user._id)) {
    return res.status(403).json({ message: 'Only the creator can delete this group' });
  }

  await Promise.all([
    Expense.deleteMany({ group: group._id }),
    Settlement.deleteMany({ group: group._id }),
    group.deleteOne(),
  ]);

  res.json({ message: 'Group deleted' });
});

async function memberBalance(group, userId) {
  const net = await computeNet(group);
  return net[userId.toString()] || 0;
}

// GET /api/groups/:id/balances
const getBalances = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id).populate('members', MEMBER_FIELDS);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const net = await computeNet(group);

  const balances = group.members.map((m) => {
    const balance = round2(net[m._id.toString()] || 0);
    return {
      user: { id: m._id, name: m.name, email: m.email, avatarUrl: m.avatarUrl },
      balance,
      // How much of the group's limit this member has used up.
      limitUsed: group.balanceLimit > 0 && balance < 0 ? round2(-balance) : 0,
      limitExceeded: group.balanceLimit > 0 && -balance > group.balanceLimit,
    };
  });

  const suggestions = simplifyDebts(net, group.members);

  res.json({
    balances,
    suggestions,
    balanceLimit: group.balanceLimit,
    currency: group.currency,
  });
});

module.exports = {
  createGroup,
  getMyGroups,
  getGroupTypes,
  getGroup,
  updateGroup,
  addMember,
  inviteMember,
  revokeInvite,
  getInvite,
  rotateInvite,
  setInviteEnabled,
  previewInvite,
  joinByCode,
  removeMember,
  deleteGroup,
  getBalances,
};
