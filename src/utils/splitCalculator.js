// Builds the `splits` array for an expense based on the chosen split type.
//
// participants: array of userId strings sharing the expense.
// amount: total expense amount.
// splitType: 'equal' | 'exact' | 'percentage'
// values: only used for 'exact' (amounts) and 'percentage' (percents),
//         given as a map { userId: number }.
//
// Returns [{ user, amount }] and throws on invalid input.
function buildSplits({ participants, amount, splitType = 'equal', values = {} }) {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error('At least one participant is required');
  }

  const ids = participants.map(String);

  if (splitType === 'equal') {
    return distributeEqually(ids, amount);
  }

  if (splitType === 'exact') {
    const splits = ids.map((user) => ({
      user,
      amount: round2(Number(values[user])),
    }));
    const total = splits.reduce((sum, s) => sum + s.amount, 0);
    if (splits.some((s) => Number.isNaN(s.amount) || s.amount < 0)) {
      throw new Error('Each participant needs a valid non-negative amount');
    }
    if (Math.abs(total - round2(amount)) > 0.01) {
      throw new Error(`Exact splits (${total}) must sum to the total amount (${amount})`);
    }
    return splits;
  }

  if (splitType === 'percentage') {
    const percents = ids.map((user) => Number(values[user]));
    if (percents.some((p) => Number.isNaN(p) || p < 0)) {
      throw new Error('Each participant needs a valid non-negative percentage');
    }
    const totalPct = percents.reduce((sum, p) => sum + p, 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      throw new Error(`Percentages must sum to 100 (got ${totalPct})`);
    }
    // Compute amounts, then fix rounding drift on the last participant.
    const splits = ids.map((user, i) => ({
      user,
      amount: round2((amount * percents[i]) / 100),
    }));
    fixRoundingDrift(splits, amount);
    return splits;
  }

  throw new Error(`Unknown split type: ${splitType}`);
}

// Builds the `payers` array for an expense: who fronted the money and how
// much each of them paid. Mirrors `buildSplits`' validation shape so a bad
// multi-payer breakdown fails the same way a bad split does.
//
// `payers`: optional array of { user, amount } from the client — present
//           only when the expense was split between multiple payers.
// `paidBy`: single payer id, used when `payers` is absent (the common case).
// `amount`: total expense amount, which the payer amounts must sum to.
//
// Always returns a normalized, non-empty array.
function buildPayers({ payers, paidBy, amount }) {
  if (Array.isArray(payers) && payers.length > 0) {
    const list = payers.map((p) => ({
      user: String(p.user),
      amount: round2(Number(p.amount)),
    }));
    if (list.some((p) => Number.isNaN(p.amount) || p.amount <= 0)) {
      throw new Error('Each payer needs a valid amount greater than 0');
    }
    const total = list.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(total - round2(amount)) > 0.01) {
      throw new Error(`Payer amounts (${total}) must sum to the total amount (${amount})`);
    }
    return list;
  }

  if (!paidBy) {
    throw new Error('A payer is required');
  }
  return [{ user: String(paidBy), amount: round2(Number(amount)) }];
}

// The payer who fronted the most — the one to show wherever only a single
// "paid by" name fits (notifications, the paidBy field itself).
function primaryPayer(payers) {
  return payers.reduce((best, p) => (p.amount > best.amount ? p : best), payers[0]).user;
}

function distributeEqually(ids, amount) {
  const per = round2(amount / ids.length);
  const splits = ids.map((user) => ({ user, amount: per }));
  fixRoundingDrift(splits, amount);
  return splits;
}

// Nudge the last split so the parts sum exactly to the total.
function fixRoundingDrift(splits, amount) {
  const total = splits.reduce((sum, s) => sum + s.amount, 0);
  const drift = round2(round2(amount) - total);
  if (drift !== 0 && splits.length > 0) {
    splits[splits.length - 1].amount = round2(splits[splits.length - 1].amount + drift);
  }
  return splits;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

module.exports = { buildSplits, buildPayers, primaryPayer, round2 };
