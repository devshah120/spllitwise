const RecurringExpense = require('../models/RecurringExpense');
const Expense = require('../models/Expense');
const Group = require('../models/Group');
const { advance } = require('./recurrence');
const { notifyExpense, notifySafely } = require('./notifications');

// Finds every active template whose next occurrence is due and turns it
// into a real Expense, catching each template fully up to `now` (a template
// that fell behind — the server was down over its due date — fires one
// Expense per missed occurrence rather than skipping straight to today).
//
// Deliberately does not run the group's balance-limit check that a manual
// expense goes through: a recurring charge like rent is expected to post
// on schedule regardless, the same way it would if a person paid it by
// hand outside a limit-aware flow.
async function runDueRecurringExpenses(now = new Date()) {
  const due = await RecurringExpense.find({ active: true, nextRunDate: { $lte: now } });

  for (const template of due) {
    try {
      await processTemplate(template, now);
    } catch (err) {
      console.error(`[recurring] failed to run template ${template._id}:`, err.message);
    }
  }
}

async function processTemplate(template, now) {
  const group = await Group.findById(template.group);
  if (!group) {
    // The group is gone — nothing sensible to charge this to. Stop it
    // rather than erroring on every future tick.
    template.active = false;
    await template.save();
    return;
  }

  let lastExpense = null;
  while (template.nextRunDate <= now) {
    lastExpense = await Expense.create({
      group: template.group,
      description: template.description,
      category: template.category,
      amount: template.amount,
      paidBy: template.paidBy,
      payers: template.payers,
      splitType: template.splitType,
      splits: template.splits,
      date: template.nextRunDate,
      notes: 'Auto-added from a recurring expense',
    });
    template.nextRunDate = advance(template.nextRunDate, template.frequency);
  }

  if (!lastExpense) return;

  template.lastRunAt = now;
  await template.save();

  notifySafely(() =>
    notifyExpense('added', {
      group,
      expense: lastExpense,
      actor: { _id: template.createdBy },
    })
  );
}

module.exports = { runDueRecurringExpenses, processTemplate };
