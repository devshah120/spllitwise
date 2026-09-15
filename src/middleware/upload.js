const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Avatars are written to <project>/uploads/avatars and served as static files
// by app.js. Keeping the directory outside src/ means a code reload never
// touches user data.
const AVATAR_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');

fs.mkdirSync(AVATAR_DIR, { recursive: true });

const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    // Name by user id plus a timestamp: one user cannot overwrite another's
    // photo, and the changing name busts any cached copy of the old one.
    const ext = ALLOWED.get(file.mimetype) || '.jpg';
    cb(null, `${req.user._id}-${Date.now()}${ext}`);
  },
});

// Reject anything that is not one of the image types we serve. The extension
// is derived from the mimetype above, so a renamed file cannot smuggle in a
// different type.
const fileFilter = (req, file, cb) => {
  if (!ALLOWED.has(file.mimetype)) {
    return cb(new Error('Only JPG, PNG or WebP images are allowed'));
  }
  cb(null, true);
};

const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('avatar');

// Wraps multer so its errors come back as JSON in the app's usual shape
// rather than as an unhandled 500.
const handleAvatarUpload = (req, res, next) => {
  uploadAvatar(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Image must be 5MB or smaller'
          : 'Could not read the uploaded image';
      return res.status(400).json({ message });
    }
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};

module.exports = { handleAvatarUpload, AVATAR_DIR };
