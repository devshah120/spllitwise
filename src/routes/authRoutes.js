const express = require('express');
const { body } = require('express-validator');
const { register, login, googleLogin, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email is required'),
    body('mobileNumber')
      .trim()
      .notEmpty().withMessage('Mobile number is required')
      .matches(/^[6-9]\d{9}$/).withMessage('Mobile number must be 10 digits and start with 6, 7, 8, or 9'),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  ],
  validate,
  register
);

router.post(
  '/login',
  [
    body('identifier').notEmpty().withMessage('Email or Mobile Number is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  login
);

router.post(
  '/google',
  [body('idToken').notEmpty().withMessage('Google idToken is required')],
  validate,
  googleLogin
);

router.get('/me', protect, getMe);

module.exports = router;
