const express = require('express');
const { listUsers, getUser, updateProfile } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', listUsers);
router.put('/profile', updateProfile);
router.get('/:id', getUser);

module.exports = router;
