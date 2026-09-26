const Group = require('../models/Group');
const Expense = require('../models/Expense');
const asyncHandler = require('../utils/asyncHandler');
const { buildSplits, buildPayers, primaryPayer, round2 } = require('../utils/splitCalculator');
const { getRate } = require('../utils/exchangeRates');
const { RECEIPT_DIR } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');
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

// Every split/payer/balance figure is always in the group's own currency.
// When the caller entered the expense in a different one, this resolves
// the single conversion rate involved and returns everything scaling by it
// needs: `amount` (the group-currency total everything else is built
// from), that same `rate` (so a caller can scale a payer breakdown or
// exact-split values by the identical factor rather than drifting between
// separate conversions), and the original figure/currency kept only for
// display.
//
// Throws (with `isConversionFailure: true`) when a live rate is needed and
// unavailable, rather than silently recording the wrong amount.
async function resolveAmount({ amount, currency, groupCurrency }) {
  const entered = Number(amount);
  const enteredCurrency = (currency || groupCurrency).toUpperCase();
  const homeCurrency = groupCurrency.toUpperCase();

  if (enteredCurrency === homeCurrency) {
    return {
      amount: round2(entered),
      rate: 1,
      originalAmount: undefined,
      originalCurrency: undefined,
    };
  }

  const rate = await getRate(enteredCurrency, homeCurrency);
  if (rate === null) {
    const err = new Error(
      `Could not convert ${enteredCurrency} to ${homeCurrency} right now — try again shortly, or enter the amount in ${homeCurrency}.`
    );
    err.isConversionFailure = true;
    throw err;
  }
  return {
    amount: round2(entered * rate),
    rate,
    originalAmount: entered,
    originalCurrency: enteredCurrency,
  };
}

// Scales a { key: number } map by `rate` and rounds each entry — used to
// bring exact-split values or a multi-payer breakdown (both entered in the
// expense's own currency) into the group's currency, the same way the
// headline amount was converted.
function scaleValues(values, rate) {
  if (!values || rate === 1) return values;
  const scaled = {};
  for (const [key, value] of Object.entries(values)) {
    scaled[key] = round2(Number(value) * rate);
  }
  return scaled;
}

// Scales a [{ user, amount }] list (a payer breakdown) by `rate` the same
// way [scaleValues] does for a plain map.
function scalePayers(payers, rate) {
  if (!payers || rate === 1) return payers;
  return payers.map((p) => ({ ...p, amount: round2(Number(p.amount) * rate) }));
}

const populateExpense = (query) =>
  query
    .populate('paidBy', 'name email avatarUrl')
    .populate('payers.user', 'name email avatarUrl')
    .populate('splits.user', 'name email avatarUrl');

// POST /api/groups/:groupId/expenses
const createExpense = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const {
    description,
    category,
    amount,
    currency,
    paidBy,
    payers: rawPayers,
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

  let resolved;
  try {
    resolved = await resolveAmount({ amount, currency, groupCurrency: group.currency });
  } catch (err) {
    return res.status(err.isConversionFailure ? 502 : 400).json({ message: err.message });
  }
  const amt = resolved.amount;
  // Exact-split figures and a payer breakdown are entered in the expense's
  // own currency, same as the headline amount — scale them by the same
  // rate rather than converting the total in isolation.
  const scaledValues = splitType === 'exact' ? scaleValues(values, resolved.rate) : values;
  const scaledPayers = scalePayers(rawPayers, resolved.rate);

  let payers;
  try {
    payers = buildPayers({ payers: scaledPayers, paidBy: paidBy || req.user._id.toString(), amount: amt });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
  for (const p of payers) {
    if (!isMember(group, p.user)) {
      return res.status(400).json({ message: `Payer ${p.user} is not a group member` });
    }
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
    splits = buildSplits({ participants: parts, amount: amt, splitType, values: scaledValues });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  const breach = await checkBalanceLimit(group, splits, payers, null);
  if (breach) return limitResponse(res, breach, 'expense');

  const expense = await Expense.create({
    group: groupId,
    description,
    category,
    amount: amt,
    originalAmount: resolved.originalAmount,
    originalCurrency: resolved.originalCurrency,
    paidBy: primaryPayer(payers),
    payers,
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
    category,
    amount,
    currency,
    paidBy,
    payers: rawPayers,
    splitType,
    participants,
    values,
    date,
    notes,
  } = req.body;

  if (description !== undefined) expense.description = description;
  if (category !== undefined) expense.category = category;
  if (date !== undefined) expense.date = date;
  if (notes !== undefined) expense.notes = notes;

  // Snapshot before any change, so the limit check below measures against
  // the state as it was before this request touched it.
  const original = await Expense.findById(expense._id).lean();

  // Recompute splits if any split-affecting field changed. A currency
  // change with no new `amount` still means re-resolving the group-currency
  // total, so it counts as an amount change too.
  const currencyChanged = currency !== undefined;
  const amountChanged = amount !== undefined || currencyChanged;
  const splitChanged = splitType !== undefined || participants !== undefined || values !== undefined;
  const payersChanged = paidBy !== undefined || rawPayers !== undefined;

  let newAmount = expense.amount;
  let newOriginalAmount = expense.originalAmount;
  let newOriginalCurrency = expense.originalCurrency;
  let rate = 1;
  if (amountChanged) {
    const amountToUse = amount !== undefined ? amount : (expense.originalAmount ?? expense.amount);
    const currencyToUse = currency !== undefined ? currency : (expense.originalCurrency || group.currency);
    let resolved;
    try {
      resolved = await resolveAmount({ amount: amountToUse, currency: currencyToUse, groupCurrency: group.currency });
    } catch (err) {
      return res.status(err.isConversionFailure ? 502 : 400).json({ message: err.message });
    }
    newAmount = resolved.amount;
    newOriginalAmount = resolved.originalAmount;
    newOriginalCurrency = resolved.originalCurrency;
    rate = resolved.rate;
  }

  const newType = splitType || expense.splitType;
  const scaledValues = newType === 'exact' ? scaleValues(values, rate) : values;
  const scaledPayers = scalePayers(rawPayers, rate);

  let newPayers = null;
  if (payersChanged || amountChanged) {
    try {
      newPayers = buildPayers({
        payers: scaledPayers,
        paidBy: paidBy || expense.paidBy,
        amount: newAmount,
      });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
    for (const p of newPayers) {
      if (!isMember(group, p.user)) {
        return res.status(400).json({ message: `Payer ${p.user} is not a group member` });
      }
    }
  }

  let newSplits = null;
  if (amountChanged || splitChanged) {
    const parts = (participants && participants.length
      ? participants
      : expense.splits.map((s) => s.user)
    ).map(String);
    for (const p of parts) {
      if (!isMember(group, p)) {
        return res.status(400).json({ message: `Participant ${p} is not a group member` });
      }
    }
    try {
      newSplits = buildSplits({
        participants: parts,
        amount: newAmount,
        splitType: newType,
        values: scaledValues,
      });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
    expense.splitType = newType;
  }

  if (newPayers || newSplits) {
    const breach = await checkBalanceLimit(
      group,
      newSplits || expense.splits,
      newPayers || (expense.payers && expense.payers.length ? expense.payers : [{ user: expense.paidBy, amount: expense.amount }]),
      original
    );
    if (breach) return limitResponse(res, breach, 'change');
  }

  if (newPayers) {
    expense.payers = newPayers;
    expense.paidBy = primaryPayer(newPayers);
  }
  if (newSplits) expense.splits = newSplits;
  if (amountChanged) {
    expense.amount = newAmount;
    expense.originalAmount = newOriginalAmount;
    expense.originalCurrency = newOriginalCurrency;
  }

  await expense.save();
  const populated = await populateExpense(Expense.findById(expense._id));
  res.json({ expense: populated });

  notifySafely(() =>
    notifyExpense('updated', { group, expense, actor: req.user })
  );
});

// GET /api/groups/:groupId/expenses/export — one row per (expense, member
// share) pair rather than one column per member, so the CSV never has to
// guess at a fixed set of columns for a group whose membership changes.
const exportGroupExpensesCsv = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const group = await Group.findById(groupId);
  if (!group) return res.status(404).json({ message: 'Group not found' });
  if (!isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const expenses = await populateExpense(Expense.find({ group: groupId }).sort('date'));

  const rows = [
    [
      'Date', 'Description', 'Category', 'Amount', 'Currency',
      'Original amount', 'Original currency', 'Paid By', 'Member', 'Share',
    ],
  ];
  for (const exp of expenses) {
    const date = exp.date.toISOString().slice(0, 10);
    const contributors = exp.payers && exp.payers.length ? exp.payers : [{ user: exp.paidBy }];
    const paidByNames = contributors.map((p) => nameOf(p.user)).join(' & ');

    for (const split of exp.splits) {
      rows.push([
        date,
        exp.description,
        exp.category,
        exp.amount.toFixed(2),
        group.currency,
        exp.originalAmount != null ? exp.originalAmount.toFixed(2) : '',
        exp.originalCurrency || '',
        paidByNames,
        nameOf(split.user),
        split.amount.toFixed(2),
      ]);
    }
  }

  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  const filename = `${group.name.replace(/[^a-z0-9]+/gi, '_') || 'group'}_expenses.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csv);
});

const nameOf = (user) => (user && user.name ? user.name : 'Someone');

const csvEscape = (value) => {
  const str = String(value ?? '');
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// Removes a previously uploaded receipt file, if the URL points at one of
// ours (an externally hosted one, if that ever exists, is left alone).
const removeOldReceipt = (receiptUrl) => {
  if (!receiptUrl || !receiptUrl.includes('/uploads/receipts/')) return;
  const name = path.basename(receiptUrl.split('?')[0]);
  const target = path.join(RECEIPT_DIR, name);
  if (path.dirname(target) !== RECEIPT_DIR) return; // guard against a crafted URL
  fs.promises.unlink(target).catch(() => {
    // Already gone, or never on disk — nothing to clean up.
  });
};

// POST /api/expenses/:id/receipt (multipart/form-data, field name: "receipt")
const uploadExpenseReceipt = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) return res.status(404).json({ message: 'Expense not found' });

  const group = await Group.findById(expense.group);
  if (!group || !isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not authorized to edit this expense' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No image was uploaded' });
  }

  const previous = expense.receiptUrl;
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  expense.receiptUrl = `${base}/uploads/receipts/${req.file.filename}`;
  await expense.save();

  // Only once the new one is safely saved.
  removeOldReceipt(previous);

  const populated = await populateExpense(Expense.findById(expense._id));
  res.json({ expense: populated });
});

// DELETE /api/expenses/:id/receipt
const deleteExpenseReceipt = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) return res.status(404).json({ message: 'Expense not found' });

  const group = await Group.findById(expense.group);
  if (!group || !isMember(group, req.user._id)) {
    return res.status(403).json({ message: 'Not authorized to edit this expense' });
  }

  const previous = expense.receiptUrl;
  expense.receiptUrl = '';
  await expense.save();
  removeOldReceipt(previous);

  const populated = await populateExpense(Expense.findById(expense._id));
  res.json({ expense: populated });
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
  exportGroupExpensesCsv,
  uploadExpenseReceipt,
  deleteExpenseReceipt,
};
