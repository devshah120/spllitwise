const express = require('express');
const { body } = require('express-validator');
const {
  createGroup,
  getMyGroups,
  getGroup,
  updateGroup,
  addMember,
  removeMember,
  deleteGroup,
  getBalances,
} = require('../controllers/groupController');
const {
  createExpense,
  getGroupExpenses,
} = require('../controllers/expenseController');
const {
  createSettlement,
  getGroupSettlements,
} = require('../controllers/settlementController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(getMyGroups)
  .post(
    [body('name').trim().notEmpty().withMessage('Group name is required')],
    validate,
    createGroup
  );

router.route('/:id').get(getGroup).patch(updateGroup).delete(deleteGroup);

router.get('/:id/balances', getBalances);

router.post(
  '/:id/members',
  [body('userId').notEmpty().withMessage('userId is required')],
  validate,
  addMember
);
router.delete('/:id/members/:userId', removeMember);

// Nested expense routes (groupId param).
router
  .route('/:groupId/expenses')
  .get(getGroupExpenses)
  .post(
    [
      body('description').trim().notEmpty().withMessage('Description is required'),
      body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    ],
    validate,
    createExpense
  );

// Nested settlement routes.
router
  .route('/:groupId/settlements')
  .get(getGroupSettlements)
  .post(
    [
      body('to').notEmpty().withMessage('Recipient (to) is required'),
      body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    ],
    validate,
    createSettlement
  );

module.exports = router;
