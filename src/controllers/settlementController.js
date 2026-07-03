const Group = require('../models/Group');
const Settlement = require('../models/Settlement');
const asyncHandler = require('../utils/asyncHandler');

const isMember = (group, userId) =>
  group.members.some((m) => m.toString() === userId.toString());

const populate = (query) =>
  query.populate('from', 'name email avatarUrl').populate('to', 'name email avatarUrl');

// POST /api/groups/:groupId/settlements  — record a payment between members.
const createSettlement = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { from, to, amount, note } = req.body;

  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const payer = from || req.user._id.toString();
  if (!isMember(group, payer) || !isMember(group, to)) {
    return res.status(400).json({ message: 'Both parties must be group members' });
  }
  if (payer === String(to)) {
    return res.status(400).json({ message: 'Cannot settle with yourself' });
  }

  const settlement = await Settlement.create({
    group: groupId,
    from: payer,
    to,
    amount: Number(amount),
    note,
  });

  const populated = await populate(Settlement.findById(settlement._id));
  res.status(201).json({ settlement: populated });
});

// GET /api/groups/:groupId/settlements
const getGroupSettlements = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const settlements = await populate(Settlement.find({ group: groupId }).sort('-createdAt'));
  res.json({ settlements });
});

// DELETE /api/settlements/:id
const deleteSettlement = asyncHandler(async (req, res) => {
  const settlement = await Settlement.findById(req.params.id);
  if (!settlement) return res.status(404).json({ message: 'Settlement not found' });

  const group = await Group.findById(settlement.group);
  if (!group || !isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not authorized to delete this settlement' });
  }

  await settlement.deleteOne();
  res.json({ message: 'Settlement deleted' });
});

module.exports = { createSettlement, getGroupSettlements, deleteSettlement };
