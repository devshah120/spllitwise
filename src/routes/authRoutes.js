const express = require('express');
const { body } = require('express-validator');
const { register, login, googleLogin, getMe, forgotPassword, verifyResetToken, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email')
      .optional({ checkFalsy: true })
      .trim()
      .isEmail().withMessage('Valid email is required')
      .matches(/^[a-zA-Z0-9][a-zA-Z0-9._%-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/)
      .withMessage('Email must start with a letter or number'),
    body('mobileNumber')
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^[6-9]\d{9}$/)
      .withMessage('Mobile number must be 10 digits and start with 6, 7, 8, or 9'),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  ],
  (req, res, next) => {
    // Custom validation: at least one of email or mobileNumber must be provided
    const { email, mobileNumber } = req.body;
    if (!email && !mobileNumber) {
      return res.status(400).json({ message: 'Email or mobile number is required' });
    }
    next();
  },
  validate,
  register
);

router.post(
  '/login',
  [
    body('identifier').notEmpty().withMessage('Email or Mobile Number is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  (req, res, next) => {
    // Custom validation: identifier must be valid email or mobile
    const { identifier } = req.body;
    const emailRegex = /^[a-zA-Z0-9][a-zA-Z0-9._%-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/;
    const mobileRegex = /^[6-9]\d{9}$/;

    if (identifier.includes('@')) {
      if (!emailRegex.test(identifier)) {
        return res.status(400).json({ message: 'Please enter a valid email address' });
      }
    } else if (!mobileRegex.test(identifier)) {
      return res.status(400).json({ message: 'Please enter a valid 10-digit mobile number (starts with 6-9)' });
    }
    next();
  },
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

router.post(
  '/forgot-password',
  [
    body('email')
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Valid email is required')
      .matches(/^[a-zA-Z0-9][a-zA-Z0-9._%-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/)
      .withMessage('Please enter a valid email address (must start with a letter or number)')
  ],
  validate,
  forgotPassword
);

router.post(
  '/verify-reset-token',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('token').notEmpty().withMessage('Reset token is required'),
  ],
  validate,
  verifyResetToken
);

router.post(
  '/reset-password',
  [
    body('email')
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Valid email is required')
      .matches(/^[a-zA-Z0-9][a-zA-Z0-9._%-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/)
      .withMessage('Please enter a valid email address (must start with a letter or number)'),
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  ],
  validate,
  resetPassword
);

module.exports = router;
