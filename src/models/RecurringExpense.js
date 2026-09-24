const mongoose = require('mongoose');

const FREQUENCIES = ['weekly', 'fortnightly', 'monthly', 'yearly'];

const payerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0.01 },
  },
  { _id: false }
);

const splitSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// A template for an expense that repeats on a schedule — rent, a shared
// subscription, anything that recurs with (usually) the same amount and
// split every time. The scheduler in utils/recurringScheduler.js turns a
// due template into a real Expense and pushes `nextRunDate` forward.
const recurringExpenseSchema = new mongoose.Schema(
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
    category: {
      type: String,
      default: 'Other',
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    payers: {
      type: [payerSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'At least one payer is required',
      },
    },
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
    frequency: {
      type: String,
      enum: {
        values: FREQUENCIES,
        message: `Frequency must be one of: ${FREQUENCIES.join(', ')}`,
      },
      required: true,
    },
    // The next occurrence due. Starts at the first occurrence's date and is
    // pushed forward by `frequency` every time the scheduler fires it.
    nextRunDate: {
      type: Date,
      required: true,
    },
    // Lets a member pause (or permanently stop) it without losing the
    // template — resuming just picks up from `nextRunDate` again.
    active: {
      type: Boolean,
      default: true,
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

recurringExpenseSchema.statics.FREQUENCIES = FREQUENCIES;

module.exports = mongoose.model('RecurringExpense', recurringExpenseSchema);
module.exports.FREQUENCIES = FREQUENCIES;
