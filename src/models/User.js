const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    mobileNumber: {
      type: String,
      unique: true,
      sparse: true,
      match: [/^[6-9]\d{9}$/, 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9'],
      trim: true,
    },
    // Password is required only for local (email/mobile) accounts.
    // Google accounts have no password.
    password: {
      type: String,
      required: [
        function () {
          return this.provider === 'local';
        },
        'Password is required',
      ],
      minlength: 8,
      select: false,
    },
    provider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    preferredCurrency: {
      type: String,
      default: 'INR',
    },
    language: {
      type: String,
      default: 'en',
    },
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    // Off by default — a user has to explicitly opt in via the Profile
    // screen's switch before any push notification is ever sent to them.
    pushNotifications: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
