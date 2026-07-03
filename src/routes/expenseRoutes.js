const express = require('express');
const {
  getExpense,
  updateExpense,
  deleteExpense,
} = require('../controllers/expenseController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.route('/:id').get(getExpense).patch(updateExpense).delete(deleteExpense);

module.exports = router;
