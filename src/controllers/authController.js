const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { signToken } = require('../utils/token');

const sanitize = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  mobileNumber: user.mobileNumber,
  avatarUrl: user.avatarUrl,
  preferredCurrency: user.preferredCurrency || 'INR',
  language: user.language || 'en',
  emailNotifications: user.emailNotifications !== false,
  pushNotifications: user.pushNotifications !== false,
  createdAt: user.createdAt,
});

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { name, email, mobileNumber, password } = req.body;

  if (!mobileNumber) {
    return res.status(400).json({ message: 'Mobile number is required' });
  }

  if (email) {
    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return res.status(409).json({ message: 'Email already in use' });
    }
  }

  if (mobileNumber) {
    const mobileExists = await User.findOne({ mobileNumber });
    if (mobileExists) {
      return res.status(409).json({ message: 'Mobile number already in use' });
    }
  }

  const user = await User.create({ name, email, mobileNumber, password });
  const token = signToken(user._id);

  res.status(201).json({ token, user: sanitize(user) });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  const user = await User.findOne({
    $or: [{ email: identifier }, { mobileNumber: identifier }]
  }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: 'Invalid email/mobile number or password' });
  }

  const token = signToken(user._id);
  res.json({ token, user: sanitize(user) });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  res.json({ user: sanitize(req.user) });
});

module.exports = { register, login, getMe };
