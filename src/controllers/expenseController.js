const Group = require('../models/Group');
const Expense = require('../models/Expense');
const asyncHandler = require('../utils/asyncHandler');
const { buildSplits } = require('../utils/splitCalculator');
const User = require('../models/User');
const { checkBalanceLimit } = require('../utils/balances');
const { notifyExpense, notifySafely } = require('../utils/notifications');

const isMember = (group, userId) =>
  group.members.some((m) => m.toString() === userId.toString());

// Turns a limit breach into the 409 the client shows the user.
const limitResponse = async (res, breach, verb) => {
  const who = await User.findById(breach.userId).select('name');
  return res.status(409).json({
    message: `This ${verb} would push ${
      who ? who.name : 'a member'
    } past the group balance limit of ${breach.limit} (they would owe ${breach.owed}).`,
    limitExceeded: true,
    ...breach,
  });
};

const populateExpense = (query) =>
  query.populate('paidBy', 'name email avatarUrl').populate('splits.user', 'name email avatarUrl');

// POST /api/groups/:groupId/expenses
const createExpense = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const {
    description,
    amount,
    paidBy,
    splitType = 'equal',
    participants,
    values,
    date,
    notes,
  } = req.body;

  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const payer = paidBy || req.user._id.toString();
  if (!isMember(group, payer)) {
    return res.status(400).json({ message: 'Payer must be a group member' });
  }

  // Default participants to all members.
  const parts = (participants && participants.length ? participants : group.members).map(String);
  for (const p of parts) {
    if (!isMember(group, p)) {
      return res.status(400).json({ message: `Participant ${p} is not a group member` });
    }
  }

  let splits;
  try {
    splits = buildSplits({ participants: parts, amount: Number(amount), splitType, values });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  const breach = await checkBalanceLimit(group, splits, payer, null);
  if (breach) return limitResponse(res, breach, 'expense');

  const expense = await Expense.create({
    group: groupId,
    description,
    amount: Number(amount),
    paidBy: payer,
    splitType,
    splits,
    date: date || Date.now(),
    notes,
  });

  const populated = await populateExpense(Expense.findById(expense._id));
  res.status(201).json({ expense: populated });

  // Tell the other members, after the response has gone out.
  notifySafely(() =>
    notifyExpense('added', { group, expense, actor: req.user })
  );
});

// GET /api/groups/:groupId/expenses
const getGroupExpenses = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const expenses = await populateExpense(Expense.find({ group: groupId }).sort('-date'));
  res.json({ expenses });
});

// GET /api/expenses/:id
const getExpense = asyncHandler(async (req, res) => {
  const expense = await populateExpense(Expense.findById(req.params.id));
  if (!expense) return res.status(404).json({ message: 'Expense not found' });

  const group = await Group.findById(expense.group);
  if (!group || !isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not authorized to view this expense' });
  }
  res.json({ expense });
});

// PATCH /api/expenses/:id
const updateExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) return res.status(404).json({ message: 'Expense not found' });

  const group = await Group.findById(expense.group);
  if (!group || !isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not authorized to edit this expense' });
  }

  const {
    description,
    amount,
    paidBy,
    splitType,
    participants,
    values,
    date,
    notes,
  } = req.body;

  if (description !== undefined) expense.description = description;
  if (date !== undefined) expense.date = date;
  if (notes !== undefined) expense.notes = notes;

  if (paidBy !== undefined) {
    if (!isMember(group, paidBy)) {
      return res.status(400).json({ message: 'Payer must be a group member' });
    }
    expense.paidBy = paidBy;
  }

  // Recompute splits if any split-affecting field changed.
  const amountChanged = amount !== undefined;
  const splitChanged = splitType !== undefined || participants !== undefined || values !== undefined;
  if (amountChanged || splitChanged) {
    const newAmount = amountChanged ? Number(amount) : expense.amount;
    const newType = splitType || expense.splitType;
    const parts = (participants && participants.length
      ? participants
      : expense.splits.map((s) => s.user)
    ).map(String);
    for (const p of parts) {
      if (!isMember(group, p)) {
        return res.status(400).json({ message: `Participant ${p} is not a group member` });
      }
    }
    let newSplits;
    try {
      newSplits = buildSplits({
        participants: parts,
        amount: newAmount,
        splitType: newType,
        values,
      });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    // Measure the limit against the *original* stored expense, then apply.
    const original = await Expense.findById(expense._id).lean();
    const breach = await checkBalanceLimit(
      group,
      newSplits,
      expense.paidBy,
      original
    );
    if (breach) return limitResponse(res, breach, 'change');

    expense.amount = newAmount;
    expense.splitType = newType;
    expense.splits = newSplits;
  }

  await expense.save();
  const populated = await populateExpense(Expense.findById(expense._id));
  res.json({ expense: populated });

  notifySafely(() =>
    notifyExpense('updated', { group, expense, actor: req.user })
  );
});

// DELETE /api/expenses/:id
const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) return res.status(404).json({ message: 'Expense not found' });

  const group = await Group.findById(expense.group);
  if (!group || !isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not authorized to delete this expense' });
  }

  // Snapshot what the mail needs before the document disappears.
  const snapshot = expense.toObject();

  await expense.deleteOne();
  res.json({ message: 'Expense deleted' });

  notifySafely(() =>
    notifyExpense('deleted', { group, expense: snapshot, actor: req.user })
  );
});

module.exports = {
  createExpense,
  getGroupExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
};
