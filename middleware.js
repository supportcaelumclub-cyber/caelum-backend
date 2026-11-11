const supabase = require('./supabase');

async function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Sign in as an administrator.' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired login.' });
    if (data.user.app_metadata?.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator access required.' });
    }
    req.admin = data.user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAdmin };
