const Expense = require('../models/Expense');
const Group = require('../models/Group');
const Comment = require('../models/Comment');
const asyncHandler = require('../utils/asyncHandler');

const isMember = (group, userId) =>
  group.members.some((m) => m.toString() === userId.toString());

// Shared by every route here: loads the expense and its group, and 403s
// unless the requester is in that group. Comments are only ever visible to
// (and addable by) people who can already see the expense itself.
async function expenseAndGroupFor(expenseId, userId) {
  const expense = await Expense.findById(expenseId);
  if (!expense) return { error: { status: 404, message: 'Expense not found' } };

  const group = await Group.findById(expense.group);
  if (!group || !isMember(group, userId)) {
    return { error: { status: 403, message: 'Not authorized to view this expense' } };
  }

  return { expense, group };
}

// GET /api/expenses/:expenseId/comments
const getComments = asyncHandler(async (req, res) => {
  const { expense, error } = await expenseAndGroupFor(req.params.expenseId, req.user._id);
  if (error) return res.status(error.status).json({ message: error.message });

  const comments = await Comment.find({ expense: expense._id })
    .sort('createdAt')
    .populate('author', 'name email avatarUrl');
  res.json({ comments });
});

// POST /api/expenses/:expenseId/comments
const createComment = asyncHandler(async (req, res) => {
  const { expense, error } = await expenseAndGroupFor(req.params.expenseId, req.user._id);
  if (error) return res.status(error.status).json({ message: error.message });

  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ message: 'Comment cannot be empty' });

  const comment = await Comment.create({
    expense: expense._id,
    author: req.user._id,
    text,
  });

  const populated = await comment.populate('author', 'name email avatarUrl');
  res.status(201).json({ comment: populated });
});

// DELETE /api/comments/:id
const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });

  // Only the person who wrote it can take it back — unlike the expense
  // itself, a comment is one person's words, not shared group data any
  // member should be able to edit away.
  if (comment.author.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Not authorized to delete this comment' });
  }

  await comment.deleteOne();
  res.json({ message: 'Comment deleted' });
});

module.exports = { getComments, createComment, deleteComment };
