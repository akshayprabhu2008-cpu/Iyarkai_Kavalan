const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { detectWaste, MODEL_PATH } = require('./lib/yolo');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const COMPLAINTS_FILE = path.join(DATA_DIR, 'complaints.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(COMPLAINTS_FILE)) fs.writeFileSync(COMPLAINTS_FILE, '[]');

app.disable('x-powered-by');
app.use(express.json({ limit: '30kb' }));
app.use(express.urlencoded({ extended: false, limit: '30kb' }));
app.use(session({
  name: 'iyarkai.sid',
  secret: process.env.SESSION_SECRET || 'replace-this-development-secret-before-deployment',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Demo-only credentials. Replace with a real user store and password hashing before deployment.
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'admin@iyarkai.in';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Kavalan@123';
const requireAuth = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Please sign in to continue.' });
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  cb(allowed.includes(file.mimetype) ? null : new Error('Please upload a JPG, PNG or WebP image.'), allowed.includes(file.mimetype));
} });

let activity = [
  { id: 'EVT-1042', type: 'Animal alert', title: 'Animal detected near Bin 03', detail: 'Safety pause enabled · Zone B', time: '2 min ago', status: 'Active', severity: 'high' },
  { id: 'EVT-1041', type: 'Bin status', title: 'Bin 01 nearing capacity', detail: 'Fill level reached 86%', time: '8 min ago', status: 'Open', severity: 'medium' },
  { id: 'EVT-1040', type: 'Sensor', title: 'Bin 04 sensor signal unstable', detail: 'Telemetry is simulated in this demo', time: '19 min ago', status: 'Investigate', severity: 'medium' },
  { id: 'EVT-1039', type: 'Collection', title: 'Zone A route reviewed', detail: 'Suggested route recalculated', time: '34 min ago', status: 'Resolved', severity: 'low' }
];
const bins = [
  { id: 'BIN-01', name: 'Central Market', zone: 'Zone A', fill: 86, type: 'Mixed waste', status: 'Needs collection' },
  { id: 'BIN-02', name: 'Lake Road Park', zone: 'Zone A', fill: 42, type: 'Recyclables', status: 'Normal' },
  { id: 'BIN-03', name: 'School Street', zone: 'Zone B', fill: 64, type: 'Organic waste', status: 'Animal alert' },
  { id: 'BIN-04', name: 'Bus Stand East', zone: 'Zone B', fill: 73, type: 'Mixed waste', status: 'Sensor warning' },
  { id: 'BIN-05', name: 'River View', zone: 'Zone C', fill: 28, type: 'Recyclables', status: 'Normal' },
  { id: 'BIN-06', name: 'Community Hall', zone: 'Zone C', fill: 91, type: 'Organic waste', status: 'Needs collection' }
];
function readComplaints() { try { return JSON.parse(fs.readFileSync(COMPLAINTS_FILE, 'utf8')); } catch { return []; } }
function writeComplaints(items) { fs.writeFileSync(COMPLAINTS_FILE, JSON.stringify(items, null, 2)); }

app.get('/', (req, res) => res.redirect(req.session.user ? '/index.html' : '/login.html'));
app.get('/api/session', (req, res) => res.json({ authenticated: Boolean(req.session.user), user: req.session.user || null }));
app.post('/api/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (email !== DEMO_EMAIL.toLowerCase() || password !== DEMO_PASSWORD) return res.status(401).json({ error: 'Email or password is incorrect.' });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Unable to start session. Please try again.' });
    req.session.user = { email, name: 'Kavalan Admin' };
    res.json({ ok: true, redirect: '/index.html' });
  });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true, redirect: '/login.html' })));
app.get('/api/dashboard', requireAuth, (req, res) => res.json({
  bins, activity, complaints: readComplaints(),
  metrics: { totalBins: bins.length, collectionNeeded: bins.filter(b => b.fill >= 80).length, activeAlerts: activity.filter(a => a.status !== 'Resolved').length, animalAlerts: activity.filter(a => a.type === 'Animal alert' && a.status !== 'Resolved').length },
  simulation: true
}));
app.post('/api/activity/:id/resolve', requireAuth, (req, res) => {
  const item = activity.find(a => a.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Activity item not found.' });
  item.status = 'Resolved';
  res.json({ ok: true, item, activity });
});
app.post('/api/route/recalculate', requireAuth, (req, res) => {
  const stops = bins.filter(b => b.fill >= 70).sort((a, b) => b.fill - a.fill);
  res.json({ ok: true, stops, distanceKm: (3.2 + stops.length * 1.35).toFixed(1), estimatedMinutes: 12 + stops.length * 8, simulation: true });
});
app.get('/api/yolo-status', requireAuth, (req, res) => { const ready = fs.existsSync(MODEL_PATH) && fs.statSync(MODEL_PATH).size >= 5_000_000; res.json({ ready, model: 'MIRA YOLO11n EXP-019', classes: ['glass', 'metal', 'paper', 'plastic', 'trash'] }); });
app.post('/api/detect-waste', requireAuth, (req, res, next) => imageUpload.single('image')(req, res, err => {
  if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.message || 'Could not upload image.' });
  next();
}), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a waste image first.' });
  try {
    const result = await detectWaste(req.file.buffer);
    res.json({ ok: true, ...result });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: status === 500 ? `YOLO inference failed: ${error.message}` : error.message });
  }
});
app.post('/api/classify', requireAuth, (req, res) => {
  const label = String(req.body.label || '').toLowerCase();
  const rules = [
    { keys: ['leaf', 'food', 'banana', 'vegetable', 'organic'], category: 'Organic waste', advice: 'Place in the green organic-waste bin.' },
    { keys: ['bottle', 'paper', 'cardboard', 'can', 'plastic', 'recycl'], category: 'Recyclables', advice: 'Keep clean and dry, then use the recycling bin.' },
    { keys: ['battery', 'chemical', 'bulb', 'electronic', 'e-waste'], category: 'Special handling', advice: 'Do not place in a regular bin; use an authorised collection point.' }
  ];
  const found = rules.find(r => r.keys.some(k => label.includes(k)));
  res.json({ category: found?.category || 'General / mixed waste', advice: found?.advice || 'Use the general-waste bin if the item cannot be recycled or composted.', demo: true });
});
app.post('/api/complaints', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const location = String(req.body.location || '').trim().slice(0, 140);
  const category = String(req.body.category || 'Other').trim().slice(0, 40);
  const description = String(req.body.description || '').trim().slice(0, 800);
  if (!name || !location || description.length < 5) return res.status(400).json({ error: 'Please enter your name, location and a description of at least 5 characters.' });
  const complaints = readComplaints();
  const item = { id: `CMP-${Date.now().toString().slice(-6)}`, name, location, category, description, status: 'Submitted', createdAt: new Date().toISOString() };
  complaints.unshift(item); writeComplaints(complaints);
  activity.unshift({ id: `EVT-${crypto.randomInt(1000, 9999)}`, type: 'Complaint', title: `New ${category.toLowerCase()} report`, detail: location, time: 'Just now', status: 'Open', severity: 'medium' });
  res.status(201).json({ ok: true, complaint: item });
});
app.get('/api/export.csv', requireAuth, (req, res) => {
  const rows = [['Bin ID', 'Location', 'Zone', 'Fill %', 'Waste Type', 'Status'], ...bins.map(b => [b.id, b.name, b.zone, b.fill, b.type, b.status])];
  const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="iyarkai-kavalan-bins.csv"');
  res.send(csv);
});
app.get('/index.html', (req, res) => req.session.user ? res.sendFile(path.join(__dirname, 'public', 'index.html')) : res.redirect('/login.html'));
app.get('/login.html', (req, res) => req.session.user ? res.redirect('/index.html') : res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.listen(PORT, () => console.log(`Iyarkai Kavalan running at http://localhost:${PORT}`));
