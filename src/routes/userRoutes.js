const express = require('express');
const {
  listUsers,
  getUser,
  updateProfile,
  uploadAvatar,
  deleteAvatar,
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { handleAvatarUpload } = require('../middleware/upload');

const router = express.Router();

router.use(protect);
router.get('/', listUsers);
router.put('/profile', updateProfile);
// Avatar routes come before '/:id' so they are not captured by it.
router.post('/avatar', handleAvatarUpload, uploadAvatar);
router.delete('/avatar', deleteAvatar);
router.get('/:id', getUser);

module.exports = router;
