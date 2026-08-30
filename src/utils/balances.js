const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const { round2 } = require('./splitCalculator');

// Computes the net position of every member of a group.
// Positive => they are owed money; negative => they owe money.
async function computeNet(group) {
  const [expenses, settlements] = await Promise.all([
    Expense.find({ group: group._id }),
    Settlement.find({ group: group._id }),
  ]);

  const net = {};
  group.members.forEach((m) => {
    const id = (m._id ? m._id : m).toString();
    net[id] = 0;
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

  return net;
}

// Greedy debt simplification: repeatedly match the largest creditor with the
// largest debtor, which keeps the number of transfers close to minimal.
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

// Checks a group's per-member balance limit against the debts an expense would
// create. Returns null when everything stays within budget, or a describing
// object for the first member who would breach it.
//
// `existingExpense` lets an edit roll back the expense's own current effect so
// the check measures the state *after* the change rather than on top of itself.
async function checkBalanceLimit(group, splits, payerId, existingExpense) {
  if (!group.balanceLimit || group.balanceLimit <= 0) return null;

  const net = await computeNet(group);

  if (existingExpense) {
    const oldPayer = existingExpense.paidBy.toString();
    if (net[oldPayer] !== undefined) net[oldPayer] -= existingExpense.amount;
    for (const s of existingExpense.splits) {
      const uid = s.user.toString();
      if (net[uid] !== undefined) net[uid] += s.amount;
    }
  }

  const total = splits.reduce((sum, s) => sum + s.amount, 0);
  const payer = payerId.toString();
  if (net[payer] !== undefined) net[payer] += total;
  for (const s of splits) {
    const uid = s.user.toString();
    if (net[uid] !== undefined) net[uid] -= s.amount;
  }

  for (const [uid, balance] of Object.entries(net)) {
    const owed = round2(-balance);
    if (owed > group.balanceLimit + 0.01) {
      return { userId: uid, owed, limit: group.balanceLimit };
    }
  }
  return null;
}

module.exports = { computeNet, simplifyDebts, checkBalanceLimit };
