const express = require('express');
const {
  getExpense,
  updateExpense,
  deleteExpense,
  uploadExpenseReceipt,
  deleteExpenseReceipt,
} = require('../controllers/expenseController');
const { getComments, createComment } = require('../controllers/commentController');
const { protect } = require('../middleware/auth');
const { handleReceiptUpload } = require('../middleware/upload');

const router = express.Router();

router.use(protect);
router.route('/:id').get(getExpense).patch(updateExpense).delete(deleteExpense);

router
  .route('/:id/receipt')
  .post(handleReceiptUpload, uploadExpenseReceipt)
  .delete(deleteExpenseReceipt);

router
  .route('/:expenseId/comments')
  .get(getComments)
  .post(createComment);

module.exports = router;
