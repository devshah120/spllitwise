const express = require('express');
const { listUsers, getUser } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', listUsers);
router.get('/:id', getUser);

module.exports = router;
