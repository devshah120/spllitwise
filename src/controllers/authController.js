const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { signToken } = require('../utils/token');

const googleClient = new OAuth2Client();

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

// POST /api/auth/google
// Body: { idToken }  -- the ID token returned by Google Sign-In on the client.
const googleLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'Google idToken is required' });
  }

  // GOOGLE_CLIENT_IDS is a comma-separated list of accepted OAuth client IDs
  // (e.g. the Android client ID and/or a Web client ID).
  const audience = (process.env.GOOGLE_CLIENT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (audience.length === 0) {
    return res.status(500).json({ message: 'Google login is not configured on the server' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid Google token' });
  }

  // payload.sub is Google's stable unique user id.
  const { sub: googleId, email, name, picture, email_verified: emailVerified } = payload;

  if (!emailVerified) {
    return res.status(401).json({ message: 'Google account email is not verified' });
  }

  // Find by googleId first, then fall back to email so an existing local
  // account with the same email gets linked to Google instead of duplicated.
  let user = await User.findOne({ googleId });

  if (!user && email) {
    user = await User.findOne({ email });
    if (user) {
      // Link Google to the existing account.
      user.googleId = googleId;
      if (user.provider === 'local') user.provider = 'google';
      if (!user.avatarUrl && picture) user.avatarUrl = picture;
      await user.save();
    }
  }

  if (!user) {
    user = await User.create({
      name: name || (email ? email.split('@')[0] : 'User'),
      email,
      googleId,
      provider: 'google',
      avatarUrl: picture || '',
    });
  }

  const token = signToken(user._id);
  res.json({ token, user: sanitize(user) });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  res.json({ user: sanitize(req.user) });
});

module.exports = { register, login, googleLogin, getMe };
