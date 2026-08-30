const crypto = require('crypto');
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

  // At least one identifier (email or mobile) is required
  if (!email && !mobileNumber) {
    return res.status(400).json({ message: 'Email or mobile number is required' });
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

  const user = await User.create({ name, email: email || undefined, mobileNumber: mobileNumber || undefined, password });
  const token = signToken(user._id);

  res.status(201).json({ token, user: sanitize(user) });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;

  const user = await User.findOne({
    $or: [{ email: identifier }, { mobileNumber: identifier }]
  }).select('+password');

  if (!user) {
    return res.status(401).json({ message: 'Invalid email/mobile number or password' });
  }

  // Check if user is a Google-only account (no password field)
  if (user.provider === 'google' || !user.password) {
    return res.status(401).json({ message: 'This account uses Google Sign-In. Please continue with Google instead.' });
  }

  const passwordMatch = await user.comparePassword(password);
  if (!passwordMatch) {
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
      // Google-only accounts have no password, so no mobileNumber required either
    });
  }

  const token = signToken(user._id);
  res.json({ token, user: sanitize(user) });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  res.json({ user: sanitize(req.user) });
});

// POST /api/auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    // Don't leak whether email exists; return 200 anyway
    return res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  }

  // Generate a secure reset token (32-byte hex string, valid for 1 hour)
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.resetPasswordToken = resetHash;
  user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await user.save();

  // In production, send an email with a reset link: http://yourapp.com/reset-password?token=resetToken
  // For now, we return the token to the frontend (the frontend will send it back in the reset request).
  // Frontend should NOT display this token to the user; instead, they'd click a link from the email.
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&email=${email}`;
  console.log(`[PASSWORD_RESET] Reset link for ${email}: ${resetUrl}`);

  // TODO: Send email with reset link
  // await sendPasswordResetEmail(user.email, resetUrl, user.name);

  res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });
});

// POST /api/auth/verify-reset-token
const verifyResetToken = asyncHandler(async (req, res) => {
  const { email, token } = req.body;

  if (!email || !token) {
    return res.status(400).json({ message: 'Email and reset token are required' });
  }

  const resetHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    email,
    resetPasswordToken: resetHash,
    resetPasswordExpires: { $gt: new Date() }
  });

  if (!user) {
    return res.status(400).json({ message: 'Reset token is invalid or has expired' });
  }

  res.status(200).json({ message: 'Token is valid' });
});

// POST /api/auth/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  const { email, token, password } = req.body;

  if (!email || !token || !password) {
    return res.status(400).json({ message: 'Email, reset token, and new password are required' });
  }

  const resetHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    email,
    resetPasswordToken: resetHash,
    resetPasswordExpires: { $gt: new Date() }
  });

  if (!user) {
    return res.status(400).json({ message: 'Reset token is invalid or has expired' });
  }

  // Update password (will be hashed by pre-save hook)
  user.password = password;
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;

  await user.save();

  res.status(200).json({ message: 'Password has been reset successfully. Please log in with your new password.' });
});

module.exports = { register, login, googleLogin, getMe, forgotPassword, verifyResetToken, resetPassword };
