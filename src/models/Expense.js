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
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    // Who actually paid.
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
