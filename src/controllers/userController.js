const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/users?search=term
// Lists users, optionally filtered by name/email — used to add members to groups.
const listUsers = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const filter = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }
  const users = await User.find(filter).select('name email avatarUrl').limit(50);
  res.json({ users });
});

// GET /api/users/:id
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('name email avatarUrl createdAt');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user });
});

const sanitize = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  mobileNumber: user.mobileNumber,
  avatarUrl: user.avatarUrl,
  preferredCurrency: user.preferredCurrency,
  language: user.language,
  emailNotifications: user.emailNotifications,
  pushNotifications: user.pushNotifications,
  createdAt: user.createdAt,
});

// PUT /api/users/profile
const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const {
    name,
    email,
    mobileNumber,
    avatarUrl,
    preferredCurrency,
    language,
    emailNotifications,
    pushNotifications,
    password,
  } = req.body;

  if (name !== undefined) user.name = name;
  if (email !== undefined) {
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(409).json({ message: 'Email already in use' });
      }
    }
    user.email = email || undefined;
  }
  if (mobileNumber !== undefined) {
    if (mobileNumber && mobileNumber !== user.mobileNumber) {
      if (!/^[6-9]\d{9}$/.test(mobileNumber)) {
        return res.status(400).json({ message: 'Invalid mobile number format' });
      }
      const mobileExists = await User.findOne({ mobileNumber });
      if (mobileExists) {
        return res.status(409).json({ message: 'Mobile number already in use' });
      }
    }
    user.mobileNumber = mobileNumber;
  }
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
  if (preferredCurrency !== undefined) user.preferredCurrency = preferredCurrency;
  if (language !== undefined) user.language = language;
  if (emailNotifications !== undefined) user.emailNotifications = emailNotifications;
  if (pushNotifications !== undefined) user.pushNotifications = pushNotifications;

  if (password) {
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    const complexRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
    if (!complexRegex.test(password)) {
      return res.status(400).json({ message: 'Password does not meet complexity requirements' });
    }
    user.password = password;
  }

  await user.save();
  res.json({ user: sanitize(user) });
});

module.exports = { listUsers, getUser, updateProfile };
