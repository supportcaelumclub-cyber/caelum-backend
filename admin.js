const express = require('express');
const router = express.Router();
const supabase = require('./supabase'); // <--- ഇവിടെയും മാറ്റം വരുത്തിയിട്ടുണ്ട്

// Admin verification middleware
const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

    // Check if user is admin
    if (user.app_metadata?.role !== 'admin' && user.user_metadata?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Admin only' });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Example Admin protected route
router.get('/dashboard', verifyAdmin, async (req, res) => {
  res.json({ message: 'Welcome to Caelum Club Admin Dashboard' });
});

module.exports = router;
