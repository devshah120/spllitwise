const express = require('express');
const { body } = require('express-validator');
const {
  createGroup,
  getMyGroups,
  getGroupTypes,
  getGroup,
  updateGroup,
  addMember,
  inviteMember,
  revokeInvite,
  getInvite,
  rotateInvite,
  setInviteEnabled,
  previewInvite,
  joinByCode,
  removeMember,
  deleteGroup,
  getBalances,
} = require('../controllers/groupController');
const {
  createExpense,
  getGroupExpenses,
  exportGroupExpensesCsv,
} = require('../controllers/expenseController');
const {
  createRecurringExpense,
  getGroupRecurringExpenses,
} = require('../controllers/recurringExpenseController');
const {
  createSettlement,
  getGroupSettlements,
} = require('../controllers/settlementController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.use(protect);

// The catalogue of group types the picker renders. Declared before `/:id` so
// "types" is not swallowed as a group id.
router.get('/types', getGroupTypes);

// Joining by invite code (from a link or a scanned QR code).
router.post(
  '/join',
  [body('code').trim().notEmpty().withMessage('Invite code is required')],
  validate,
  joinByCode
);
router.get('/join/:code', previewInvite);

router
  .route('/')
  .get(getMyGroups)
  .post(
    [
      body('name').trim().notEmpty().withMessage('Group name is required'),
      body('balanceLimit')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Balance limit must be zero or greater'),
    ],
    validate,
    createGroup
  );

router.route('/:id').get(getGroup).patch(updateGroup).delete(deleteGroup);

router.get('/:id/balances', getBalances);

// Invite code: read, rotate, enable/disable.
router
  .route('/:id/invite')
  .get(getInvite)
  .patch(setInviteEnabled);
router.post('/:id/invite/rotate', rotateInvite);

// Pending invitations by email / mobile.
router.post('/:id/invites', inviteMember);
router.delete('/:id/invites/:inviteId', revokeInvite);

router.post('/:id/members', addMember);
router.delete('/:id/members/:userId', removeMember);

// CSV export — before the generic /:groupId/expenses route below so
// "export" is never mistaken for an expense id.
router.get('/:groupId/expenses/export', exportGroupExpensesCsv);

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

// Nested recurring-expense routes (groupId param). Editing/deleting a
// specific template is handled by the top-level /recurring-expenses/:id
// routes, matching the expense/settlement pattern above.
router
  .route('/:groupId/recurring-expenses')
  .get(getGroupRecurringExpenses)
  .post(
    [
      body('description').trim().notEmpty().withMessage('Description is required'),
      body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
      body('frequency')
        .isIn(['weekly', 'fortnightly', 'monthly', 'yearly'])
        .withMessage('Frequency must be weekly, fortnightly, monthly or yearly'),
    ],
    validate,
    createRecurringExpense
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
