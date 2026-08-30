const crypto = require('crypto');
const mongoose = require('mongoose');

// The kinds of group the app offers. `other` is the catch-all.
const GROUP_TYPES = ['family', 'friends', 'couple', 'trip', 'office', 'other'];

// Invite codes are short, unambiguous and case-insensitive on lookup.
// The alphabet drops 0/O/1/I/L so codes read cleanly off a screen or QR.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateInviteCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Group name is required'],
      trim: true,
      maxlength: [60, 'Group name cannot exceed 60 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [280, 'Description cannot exceed 280 characters'],
    },
    type: {
      type: String,
      enum: {
        values: GROUP_TYPES,
        message: `Group type must be one of: ${GROUP_TYPES.join(', ')}`,
      },
      default: 'other',
    },
    // Group avatar. Either a remote URL or a `data:image/...;base64,...` string.
    photoUrl: {
      type: String,
      default: '',
    },
    // Per-member spending guard. 0 (the default) means "no limit".
    // Enforced when creating an expense: a member's outstanding debt in the
    // group may not exceed this after the new expense is applied.
    balanceLimit: {
      type: Number,
      default: 0,
      min: [0, 'Balance limit cannot be negative'],
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Shareable join code, also the payload behind the QR code and invite link.
    inviteCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    // Lets the creator switch joining off without discarding the code.
    inviteEnabled: {
      type: Boolean,
      default: true,
    },
    // Optional expiry for the current code. null means it never expires.
    inviteExpiresAt: {
      type: Date,
      default: null,
    },
    // Pending invitations for people who are not on the app yet, or who were
    // invited by email/mobile before they accepted.
    invites: [
      {
        email: { type: String, lowercase: true, trim: true },
        mobileNumber: { type: String, trim: true },
        invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        invitedAt: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ['pending', 'accepted', 'revoked'],
          default: 'pending',
        },
      },
    ],
  },
  { timestamps: true }
);

groupSchema.index({ members: 1 });

// Every group gets an invite code the moment it is created.
groupSchema.pre('validate', function assignInviteCode(next) {
  if (!this.inviteCode) {
    this.inviteCode = generateInviteCode();
  }
  next();
});

// True when the code can currently be redeemed.
groupSchema.methods.isInviteActive = function isInviteActive() {
  if (!this.inviteEnabled || !this.inviteCode) return false;
  if (this.inviteExpiresAt && this.inviteExpiresAt.getTime() < Date.now()) return false;
  return true;
};

groupSchema.statics.GROUP_TYPES = GROUP_TYPES;
groupSchema.statics.generateInviteCode = generateInviteCode;

module.exports = mongoose.model('Group', groupSchema);
module.exports.GROUP_TYPES = GROUP_TYPES;
module.exports.generateInviteCode = generateInviteCode;
