const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Group = require('../models/Group');
const asyncHandler = require('../utils/asyncHandler');
const { AVATAR_DIR } = require('../middleware/upload');

// GET /api/users?search=term
// The caller's contacts: everyone who shares at least one group with them,
// optionally filtered by name/email — used to add members to groups.
// Never lists the whole userbase; someone with no groups yet gets nothing back
// and reaches new people by email/mobile invite or an invite link instead.
const listUsers = asyncHandler(async (req, res) => {
  const { search } = req.query;

  const groups = await Group.find({ members: req.user._id }).select('members');
  const contactIds = [
    ...new Set(
      groups.flatMap((g) => g.members.map(String)).filter((id) => id !== req.user._id.toString())
    ),
  ];
  if (!contactIds.length) return res.json({ users: [] });

  const filter = { _id: { $in: contactIds } };
  if (search) {
    // Escaped so a search term is matched literally, not as a regex.
    const term = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
    ];
  }
  const users = await User.find(filter).select('name email avatarUrl').limit(50);
  res.json({ users });
});

// GET /api/users/:id — readable for yourself, and for anyone you share a group
// with. Other accounts are reported as not found rather than confirming they
// exist to someone with no connection to them.
const getUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (id !== req.user._id.toString()) {
    const shared = await Group.exists({ members: { $all: [req.user._id, id] } });
    if (!shared) return res.status(404).json({ message: 'User not found' });
  }
  const user = await User.findById(id).select('name email avatarUrl createdAt');
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

// Removes a previously uploaded avatar file, if the URL points at one of ours.
// Externally hosted pictures (Google sign-in) are left alone.
const removeOldAvatar = (avatarUrl) => {
  if (!avatarUrl || !avatarUrl.includes('/uploads/avatars/')) return;
  const name = path.basename(avatarUrl.split('?')[0]);
  // Guard against a crafted URL escaping the avatars directory.
  const target = path.join(AVATAR_DIR, name);
  if (path.dirname(target) !== AVATAR_DIR) return;
  fs.promises.unlink(target).catch(() => {
    // Already gone, or never on disk — nothing to clean up.
  });
};

// POST /api/users/avatar  (multipart/form-data, field name: "avatar")
const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image was uploaded' });
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const previous = user.avatarUrl;
  // Store an absolute URL so the app can use it directly, wherever it runs.
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  user.avatarUrl = `${base}/uploads/avatars/${req.file.filename}`;
  await user.save();

  // Only once the new one is safely saved.
  removeOldAvatar(previous);

  res.json({ user: sanitize(user) });
});

// DELETE /api/users/avatar — go back to the generated initials avatar.
const deleteAvatar = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const previous = user.avatarUrl;
  user.avatarUrl = '';
  await user.save();
  removeOldAvatar(previous);

  res.json({ user: sanitize(user) });
});

module.exports = { listUsers, getUser, updateProfile, uploadAvatar, deleteAvatar };
