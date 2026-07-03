const express = require('express');
const { deleteSettlement } = require('../controllers/settlementController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.delete('/:id', deleteSettlement);

module.exports = router;
