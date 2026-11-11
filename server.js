require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');

const app = express();
const port = Number(process.env.PORT || 3000);
const origins = (process.env.FRONTEND_ORIGINS || 'http://localhost:3000').split(',').map(x => x.trim()).filter(Boolean);

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin(origin, callback) {
  if (!origin || origins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS.'));
}, methods: ['GET','POST','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '40kb', verify: (req, res, buf) => { req.rawBody = Buffer.from(buf); } }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }));
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'CAELUM CLUB API' }));
app.use('/api', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((err, req, res, next) => {
  console.error(err.message || err);
  if (res.headersSent) return next(err);
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  res.status(status).json({ error: status === 500 ? 'Server error. Please try again later.' : err.message });
});

app.listen(port, () => console.log(`CAELUM CLUB API listening on port ${port}`));
