const mongoose = require('mongoose');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const asyncHandler = require('../utils/asyncHandler');
const { round2 } = require('../utils/splitCalculator');

// Helper: true if userId is a member of the group.
const isMember = (group, userId) =>
  group.members.some((m) => m.toString() === userId.toString());

// POST /api/groups
const createGroup = asyncHandler(async (req, res) => {
  const { name, description, memberIds = [] } = req.body;

  // Creator is always a member.
  const members = new Set([req.user._id.toString(), ...memberIds.map(String)]);

  const group = await Group.create({
    name,
    description,
    createdBy: req.user._id,
    members: [...members],
  });

  const populated = await group.populate('members', 'name email avatarUrl');
  res.status(201).json({ group: populated });
});

// GET /api/groups  — groups the current user belongs to.
const getMyGroups = asyncHandler(async (req, res) => {
  const groups = await Group.find({ members: req.user._id })
    .populate('members', 'name email avatarUrl')
    .sort('-updatedAt');
  res.json({ groups });
});

// GET /api/groups/:id
const getGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id)
    .populate('members', 'name email avatarUrl')
    .populate('createdBy', 'name email');
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }
  res.json({ group });
});

// PATCH /api/groups/:id  — update name/description (creator only).
const updateGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (group.createdBy.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Only the creator can update this group' });
  }

  const { name, description } = req.body;
  if (name !== undefined) group.name = name;
  if (description !== undefined) group.description = description;
  await group.save();

  const populated = await group.populate('members', 'name email avatarUrl');
  res.json({ group: populated });
});

// POST /api/groups/:id/members  — add a member.
const addMember = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }
  if (isMember(group, userId)) {
    return res.status(409).json({ message: 'User is already a member' });
  }

  group.members.push(userId);
  await group.save();
  const populated = await group.populate('members', 'name email avatarUrl');
  res.json({ group: populated });
});

// DELETE /api/groups/:id/members/:userId  — remove a member.
const removeMember = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (group.createdBy.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Only the creator can remove members' });
  }

  const { userId } = req.params;
  if (userId === group.createdBy.toString()) {
    return res.status(400).json({ message: 'Cannot remove the group creator' });
  }

  group.members = group.members.filter((m) => m.toString() !== userId);
  await group.save();
  const populated = await group.populate('members', 'name email avatarUrl');
  res.json({ group: populated });
});

// DELETE /api/groups/:id  — creator only; removes group + its expenses/settlements.
const deleteGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (group.createdBy.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Only the creator can delete this group' });
  }

  await Promise.all([
    Expense.deleteMany({ group: group._id }),
    Settlement.deleteMany({ group: group._id }),
    group.deleteOne(),
  ]);

  res.json({ message: 'Group deleted' });
});

// GET /api/groups/:id/balances
// Net balance per member: positive => others owe them; negative => they owe.
// Also returns simplified "who pays whom" suggestions.
const getBalances = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id).populate(
    'members',
    'name email avatarUrl'
  );
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const [expenses, settlements] = await Promise.all([
    Expense.find({ group: group._id }),
    Settlement.find({ group: group._id }),
  ]);

  // net[userId] = amount they are owed (positive) or owe (negative).
  const net = {};
  group.members.forEach((m) => {
    net[m._id.toString()] = 0;
  });

  for (const exp of expenses) {
    const payer = exp.paidBy.toString();
    if (net[payer] !== undefined) net[payer] += exp.amount;
    for (const split of exp.splits) {
      const uid = split.user.toString();
      if (net[uid] !== undefined) net[uid] -= split.amount;
    }
  }

  // A settlement: `from` pays `to`, reducing what `from` owes.
  for (const s of settlements) {
    const from = s.from.toString();
    const to = s.to.toString();
    if (net[from] !== undefined) net[from] += s.amount;
    if (net[to] !== undefined) net[to] -= s.amount;
  }

  const balances = group.members.map((m) => ({
    user: { id: m._id, name: m.name, email: m.email, avatarUrl: m.avatarUrl },
    balance: round2(net[m._id.toString()] || 0),
  }));

  const suggestions = simplifyDebts(net, group.members);

  res.json({ balances, suggestions });
});

// Greedy debt simplification: match largest creditor to largest debtor.
function simplifyDebts(net, members) {
  const nameOf = {};
  members.forEach((m) => {
    nameOf[m._id.toString()] = { id: m._id, name: m.name };
  });

  const creditors = [];
  const debtors = [];
  for (const [uid, amount] of Object.entries(net)) {
    const rounded = round2(amount);
    if (rounded > 0.009) creditors.push({ uid, amount: rounded });
    else if (rounded < -0.009) debtors.push({ uid, amount: -rounded });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = round2(Math.min(debtors[i].amount, creditors[j].amount));
    transactions.push({
      from: nameOf[debtors[i].uid],
      to: nameOf[creditors[j].uid],
      amount: pay,
    });
    debtors[i].amount = round2(debtors[i].amount - pay);
    creditors[j].amount = round2(creditors[j].amount - pay);
    if (debtors[i].amount <= 0.009) i++;
    if (creditors[j].amount <= 0.009) j++;
  }

  return transactions;
}

module.exports = {
  createGroup,
  getMyGroups,
  getGroup,
  updateGroup,
  addMember,
  removeMember,
  deleteGroup,
  getBalances,
};
