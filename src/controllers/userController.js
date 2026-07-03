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

module.exports = { listUsers, getUser };
