const express = require('express');
const router = express.Router();
const supabase = require('./supabase'); // <--- ഇവിടെ മാറ്റം വരുത്തിയിട്ടുണ്ട്
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Razorpay Order Creation Route
router.post('/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;
    
    const options = {
      amount: amount * 100, // amount in the smallest currency unit
      currency,
      receipt
    };

    const order = await razorpay.orders.create(options);
    res.json({ success: true, order });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
