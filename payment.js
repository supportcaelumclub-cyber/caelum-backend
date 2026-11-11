const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const supabase = require('../supabase');
const { requireAdmin } = require('../middleware');

const router = express.Router();
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const fail = (res, status, message) => res.status(status).json({ error: message });
const asMoney = value => Math.round(Number(value) * 100) / 100;

async function calculateCart(items, couponCode) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) throw new Error('Cart is empty or invalid.');
  const clean = items.map(item => ({
    product_id: String(item.product_id || ''),
    size: String(item.size || '').slice(0, 20),
    quantity: Number(item.quantity)
  }));
  if (clean.some(i => !i.product_id || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 10)) {
    throw new Error('Invalid product or quantity.');
  }
  const ids = [...new Set(clean.map(i => i.product_id))];
  const { data: products, error } = await supabase
    .from('products')
    .select('id,name,price,stock,sizes,is_active')
    .in('id', ids)
    .eq('is_active', true);
  if (error) throw new Error('Could not validate products.');
  if (!products || products.length !== ids.length) throw new Error('A product is unavailable. Refresh your cart.');

  const byId = new Map(products.map(p => [String(p.id), p]));
  const lines = clean.map(item => {
    const product = byId.get(item.product_id);
    if (!product) throw new Error('A product is unavailable.');
    if (Number.isFinite(Number(product.stock)) && Number(product.stock) < item.quantity) throw new Error(`${product.name} is out of stock.`);
    const availableSizes = Array.isArray(product.sizes) ? product.sizes : String(product.sizes || 'S,M,L,XL,XXL').split(',').map(s => s.trim());
    if (item.size && availableSizes.length && !availableSizes.includes(item.size)) throw new Error(`Selected size is unavailable for ${product.name}.`);
    const unitPrice = asMoney(product.price);
    if (!(unitPrice > 0)) throw new Error('Invalid product price.');
    return { product_id: product.id, name: product.name, size: item.size, quantity: item.quantity, unit_price: unitPrice, line_total: asMoney(unitPrice * item.quantity) };
  });

  const subtotal = asMoney(lines.reduce((sum, line) => sum + line.line_total, 0));
  let coupon = null;
  let discount = 0;
  if (couponCode) {
    const code = String(couponCode).trim().toUpperCase().slice(0, 40);
    const { data, error: couponError } = await supabase.from('coupons').select('*').eq('code', code).eq('is_active', true).maybeSingle();
    if (couponError || !data) throw new Error('Coupon is invalid or unavailable.');
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) throw new Error('Coupon has expired.');
    if (subtotal < Number(data.min_order || 0)) throw new Error(`Minimum order amount for this coupon is ₹${data.min_order}.`);
    if (data.usage_limit != null && Number(data.used_count || 0) >= Number(data.usage_limit)) throw new Error('Coupon usage limit reached.');
    discount = data.discount_type === 'percentage'
      ? Math.min(subtotal, subtotal * Number(data.discount_value) / 100)
      : Math.min(subtotal, Number(data.discount_value));
    coupon = { code: data.code, discount_type: data.discount_type, discount_value: Number(data.discount_value) };
  }
  const total = asMoney(Math.max(0, subtotal - discount));
  if (total <= 0) throw new Error('Order total must be greater than zero.');
  return { lines, subtotal, discount: asMoney(discount), total, coupon };
}

function validateCustomer(customer) {
  const c = customer || {};
  const clean = {
    name: String(c.name || '').trim().slice(0, 120),
    email: String(c.email || '').trim().toLowerCase().slice(0, 254),
    phone: String(c.phone || '').replace(/\D/g, '').slice(0, 15),
    address: String(c.address || '').trim().slice(0, 500),
    city: String(c.city || '').trim().slice(0, 100),
    pin: String(c.pin || '').trim().slice(0, 10)
  };
  if (!clean.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email) || clean.phone.length < 10 || !clean.address || !clean.city || !/^\d{6}$/.test(clean.pin)) {
    throw new Error('Please provide valid name, email, mobile number and delivery address.');
  }
  return clean;
}

// The server recalculates every price; client-submitted totals are ignored.
router.post('/create-razorpay-order', async (req, res, next) => {
  try {
    const customer = validateCustomer(req.body.customer);
    const cart = await calculateCart(req.body.items, req.body.coupon);
    const receipt = `cc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const rpOrder = await razorpay.orders.create({
      amount: Math.round(cart.total * 100), currency: 'INR', receipt,
      notes: { store: 'CAELUM CLUB' }
    });
    const { data: saved, error } = await supabase.from('orders').insert({
      customer, items: cart.lines, subtotal: cart.subtotal, discount: cart.discount,
      total: cart.total, currency: 'INR', coupon_code: cart.coupon?.code || null,
      razorpay_order_id: rpOrder.id, status: 'payment_pending'
    }).select('id').single();
    if (error) throw new Error('Payment order was created but order record could not be saved. Contact support before retrying.');
    res.json({ order_id: rpOrder.id, amount: rpOrder.amount, currency: rpOrder.currency, key_id: process.env.RAZORPAY_KEY_ID, reference: saved.id });
  } catch (err) {
    if (err.message && /Cart|cart|product|Product|Coupon|coupon|order amount|Please provide|size|stock|expired|Minimum/.test(err.message)) return fail(res, 400, err.message);
    next(err);
  }
});

async function markPaymentPaid(paymentEntity) {
  const { data: order, error: findError } = await supabase.from('orders')
    .select('id,status,coupon_code,items')
    .eq('razorpay_order_id', paymentEntity.order_id).maybeSingle();
  if (findError || !order) throw new Error('Matching order not found.');
  if (order.status === 'paid') return order;
  const { data: changed, error: updateError } = await supabase.from('orders').update({
    status: 'paid', razorpay_payment_id: paymentEntity.id, paid_at: new Date().toISOString()
  }).eq('id', order.id).eq('status', 'payment_pending').select('id').maybeSingle();
  if (updateError) throw new Error('Could not update paid order.');
  // A webhook and the browser verification can arrive together; only the first transition increments coupon usage.
  if (!changed) return order;
  if (order.coupon_code) {
    const { data: coupon } = await supabase.from('coupons').select('used_count').eq('code', order.coupon_code).maybeSingle();
    if (coupon) await supabase.from('coupons').update({ used_count: Number(coupon.used_count || 0) + 1 }).eq('code', order.coupon_code);
  }
  return order;
}

router.post('/verify-razorpay-payment', async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return fail(res, 400, 'Missing payment verification fields.');
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(String(razorpay_signature), 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail(res, 400, 'Payment signature verification failed.');
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.order_id !== razorpay_order_id || payment.status !== 'captured') return fail(res, 402, 'Payment is not captured yet.');
    const order = await markPaymentPaid(payment);
    res.json({ success: true, order_id: order.id, status: 'paid' });
  } catch (err) { next(err); }
});

// Razorpay webhook is a second confirmation channel. Configure this URL in Razorpay.
router.post('/razorpay-webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature || !process.env.RAZORPAY_WEBHOOK_SECRET) return res.status(400).send('Webhook not configured.');
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(req.rawBody || Buffer.from('')).digest('hex');
    const a = Buffer.from(expected, 'hex'); const b = Buffer.from(String(signature), 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).send('Invalid signature.');
    const event = JSON.parse((req.rawBody || Buffer.from('{}')).toString('utf8'));
    if (event.event === 'payment.captured') await markPaymentPaid(event.payload.payment.entity);
    res.json({ received: true });
  } catch (err) { console.error('Razorpay webhook error:', err.message); res.status(500).send('Webhook processing failed.'); }
});

// Admin order listing; Supabase Auth user must have app_metadata.role = admin.
router.get('/admin/orders', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json({ orders: data });
  } catch (err) { next(err); }
});

module.exports = router;
