const mongoose = require('mongoose');

// A single participant's share of an expense.
const splitSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Amount this user owes for this expense.
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    // The broad kind of spend (Food & drink, Travel, ...); `description` is
    // the free-text title within it, e.g. "Tea" under "Food & drink".
    category: {
      type: String,
      default: 'Other',
      trim: true,
    },
    // Always in the group's own currency — every split, payer amount and
    // balance is computed from this figure. When the expense was entered in
    // a different currency, this is the *converted* amount; what was
    // actually typed lives in `originalAmount`/`originalCurrency` below,
    // purely for display.
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    // Set only when this expense was entered in a currency other than the
    // group's own (e.g. paid for something in USD while splitting with a
    // group whose currency is INR).
    originalAmount: {
      type: Number,
      default: undefined,
    },
    originalCurrency: {
      type: String,
      uppercase: true,
      trim: true,
      default: undefined,
    },
    // Who actually paid. When `payers` holds more than one entry this is
    // just the largest contributor, kept so every place that only needs a
    // single "paid by" name (notifications, older clients) keeps working.
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // The real breakdown of who fronted the money, when it is known.
    // More than one entry means this was a multi-payer expense (e.g. two
    // cards split a restaurant bill); amounts always sum to `amount`.
    //
    // Deliberately has no "at least one entry" requirement: every document
    // saved before multi-payer support shipped has no `payers` at all, and
    // Mongoose hydrates a missing array field as `[]` — a hard minimum here
    // would fail validation on that *empty* array the moment one of those
    // older expenses is next saved, even for an edit that has nothing to do
    // with who paid. Every reader (balances.js, notifications, the Dart
    // client) already falls back to `{ user: paidBy, amount }` when this is
    // empty, so an empty array is a valid, meaningful state, not an error.
    payers: {
      type: [
        new mongoose.Schema(
          {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            amount: { type: Number, required: true, min: 0.01 },
          },
          { _id: false }
        ),
      ],
    },
    // How the total is split among members.
    splitType: {
      type: String,
      enum: ['equal', 'exact', 'percentage'],
      default: 'equal',
    },
    splits: {
      type: [splitSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'At least one split is required',
      },
    },
    date: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);
