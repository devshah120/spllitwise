const express = require('express');
const {
  updateRecurringExpense,
  deleteRecurringExpense,
} = require('../controllers/recurringExpenseController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.route('/:id').patch(updateRecurringExpense).delete(deleteRecurringExpense);

module.exports = router;
