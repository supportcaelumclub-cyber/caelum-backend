const express = require('express');
const supabase = require('../supabase');
const { requireAdmin } = require('../middleware');
const router = express.Router();
router.use(requireAdmin);

const allowed = {
  products: ['name','category','price','image_url','description','sizes','stock','is_active'],
  categories: ['name','slug','is_active'],
  coupons: ['code','discount_type','discount_value','min_order','expires_at','is_active','usage_limit','used_count'],
  promotional_banners: ['title','description','link_url','is_active','start_at','end_at']
};
function pick(body, fields) {
  const out = {};
  for (const field of fields) if (body[field] !== undefined) out[field] = body[field];
  return out;
}
function tableFor(name) {
  if (!Object.hasOwn(allowed, name)) throw new Error('Unsupported resource.');
  return name;
}

router.get('/:resource', async (req, res, next) => {
  try {
    const table = tableFor(req.params.resource);
    const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(300);
    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
});
router.post('/:resource', async (req, res, next) => {
  try {
    const table = tableFor(req.params.resource);
    const values = pick(req.body || {}, allowed[table]);
    if (table === 'coupons' && values.code) values.code = String(values.code).trim().toUpperCase();
    const { data, error } = await supabase.from(table).insert(values).select('*').single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) { next(err); }
});
router.patch('/:resource/:id', async (req, res, next) => {
  try {
    const table = tableFor(req.params.resource);
    const values = pick(req.body || {}, allowed[table]);
    if (table === 'coupons' && values.code) values.code = String(values.code).trim().toUpperCase();
    const { data, error } = await supabase.from(table).update(values).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json({ data });
  } catch (err) { next(err); }
});
router.delete('/:resource/:id', async (req, res, next) => {
  try {
    const table = tableFor(req.params.resource);
    const { error } = await supabase.from(table).delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
});
module.exports = router;
