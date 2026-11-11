const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Security and Middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_ORIGINS ? process.env.FRONTEND_ORIGINS.split(',') : '*',
  credentials: true
}));

app.use(express.json());

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Import local routes (Updated to match root folder structure)
const paymentRoutes = require('./payment');
const adminRoutes = require('./admin');

// Use Routes
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Base Route
app.get('/', (req, res) => {
  res.json({ status: 'Caelum Club Backend is running successfully!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
