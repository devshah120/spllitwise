const mongoose = require('mongoose');

// A single message in an expense's discussion thread — "can we split this
// differently?", "receipt is in the group chat", etc.
const commentSchema = new mongoose.Schema(
  {
    expense: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense',
      required: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      required: [true, 'Comment text is required'],
      trim: true,
      maxlength: [1000, 'Comment cannot exceed 1000 characters'],
    },
  },
  { timestamps: true }
);

commentSchema.index({ expense: 1, createdAt: 1 });

module.exports = mongoose.model('Comment', commentSchema);
