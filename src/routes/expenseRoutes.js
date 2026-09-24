const express = require('express');
const {
  getExpense,
  updateExpense,
  deleteExpense,
} = require('../controllers/expenseController');
const { getComments, createComment } = require('../controllers/commentController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.route('/:id').get(getExpense).patch(updateExpense).delete(deleteExpense);

router
  .route('/:expenseId/comments')
  .get(getComments)
  .post(createComment);

module.exports = router;
