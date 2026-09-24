const Group = require('../models/Group');
const RecurringExpense = require('../models/RecurringExpense');
const asyncHandler = require('../utils/asyncHandler');
const { buildSplits, buildPayers, primaryPayer } = require('../utils/splitCalculator');
const { processTemplate } = require('../utils/recurringScheduler');

const isMember = (group, userId) =>
  group.members.some((m) => m.toString() === userId.toString());

const populateTemplate = (query) =>
  query
    .populate('paidBy', 'name email avatarUrl')
    .populate('payers.user', 'name email avatarUrl')
    .populate('splits.user', 'name email avatarUrl');

// POST /api/groups/:groupId/recurring-expenses
const createRecurringExpense = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const {
    description,
    category,
    amount,
    paidBy,
    payers: rawPayers,
    splitType = 'equal',
    participants,
    values,
    frequency,
    startDate,
  } = req.body;

  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  if (!RecurringExpense.FREQUENCIES.includes(frequency)) {
    return res.status(400).json({
      message: `Frequency must be one of: ${RecurringExpense.FREQUENCIES.join(', ')}`,
    });
  }

  const amt = Number(amount);
  let payers;
  try {
    payers = buildPayers({ payers: rawPayers, paidBy: paidBy || req.user._id.toString(), amount: amt });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
  for (const p of payers) {
    if (!isMember(group, p.user)) {
      return res.status(400).json({ message: `Payer ${p.user} is not a group member` });
    }
  }

  const parts = (participants && participants.length ? participants : group.members).map(String);
  for (const p of parts) {
    if (!isMember(group, p)) {
      return res.status(400).json({ message: `Participant ${p} is not a group member` });
    }
  }

  let splits;
  try {
    splits = buildSplits({ participants: parts, amount: amt, splitType, values });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  const template = await RecurringExpense.create({
    group: groupId,
    description,
    category,
    amount: amt,
    paidBy: primaryPayer(payers),
    payers,
    splitType,
    splits,
    frequency,
    nextRunDate: startDate ? new Date(startDate) : new Date(),
    createdBy: req.user._id,
  });

  // A start date of today (the common case) is already due — fire its
  // first occurrence right away instead of leaving the user waiting for
  // the next hourly scheduler tick.
  if (template.nextRunDate <= new Date()) {
    await processTemplate(template, new Date());
  }

  const populated = await populateTemplate(RecurringExpense.findById(template._id));
  res.status(201).json({ recurringExpense: populated });
});

// GET /api/groups/:groupId/recurring-expenses
const getGroupRecurringExpenses = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const recurringExpenses = await populateTemplate(
    RecurringExpense.find({ group: groupId }).sort('-createdAt')
  );
  res.json({ recurringExpenses });
});

// PATCH /api/recurring-expenses/:id
const updateRecurringExpense = asyncHandler(async (req, res) => {
  const template = await RecurringExpense.findById(req.params.id);
  if (!template) return res.status(404).json({ message: 'Recurring expense not found' });

  const group = await Group.findById(template.group);
  if (!group || !isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not authorized to edit this recurring expense' });
  }

  const {
    description,
    category,
    amount,
    paidBy,
    payers: rawPayers,
    splitType,
    participants,
    values,
    frequency,
    active,
  } = req.body;

  if (description !== undefined) template.description = description;
  if (category !== undefined) template.category = category;
  if (active !== undefined) template.active = Boolean(active);

  if (frequency !== undefined) {
    if (!RecurringExpense.FREQUENCIES.includes(frequency)) {
      return res.status(400).json({
        message: `Frequency must be one of: ${RecurringExpense.FREQUENCIES.join(', ')}`,
      });
    }
    template.frequency = frequency;
  }

  const amountChanged = amount !== undefined;
  const splitChanged = splitType !== undefined || participants !== undefined || values !== undefined;
  const payersChanged = paidBy !== undefined || rawPayers !== undefined;
  const newAmount = amountChanged ? Number(amount) : template.amount;

  if (payersChanged || amountChanged) {
    let newPayers;
    try {
      newPayers = buildPayers({ payers: rawPayers, paidBy: paidBy || template.paidBy, amount: newAmount });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
    for (const p of newPayers) {
      if (!isMember(group, p.user)) {
        return res.status(400).json({ message: `Payer ${p.user} is not a group member` });
      }
    }
    template.payers = newPayers;
    template.paidBy = primaryPayer(newPayers);
  }

  if (amountChanged || splitChanged) {
    const newType = splitType || template.splitType;
    const parts = (participants && participants.length
      ? participants
      : template.splits.map((s) => s.user)
    ).map(String);
    for (const p of parts) {
      if (!isMember(group, p)) {
        return res.status(400).json({ message: `Participant ${p} is not a group member` });
      }
    }
    let newSplits;
    try {
      newSplits = buildSplits({ participants: parts, amount: newAmount, splitType: newType, values });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
    template.splitType = newType;
    template.splits = newSplits;
  }

  if (amountChanged) template.amount = newAmount;

  await template.save();
  const populated = await populateTemplate(RecurringExpense.findById(template._id));
  res.json({ recurringExpense: populated });
});

// DELETE /api/recurring-expenses/:id
const deleteRecurringExpense = asyncHandler(async (req, res) => {
  const template = await RecurringExpense.findById(req.params.id);
  if (!template) return res.status(404).json({ message: 'Recurring expense not found' });

  const group = await Group.findById(template.group);
  if (!group || !isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not authorized to delete this recurring expense' });
  }

  await template.deleteOne();
  res.json({ message: 'Recurring expense deleted' });
});

module.exports = {
  createRecurringExpense,
  getGroupRecurringExpenses,
  updateRecurringExpense,
  deleteRecurringExpense,
};
