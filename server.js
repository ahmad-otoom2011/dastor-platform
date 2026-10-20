const path = require('path');
const express = require('express');
const session = require('express-session');

const { initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

initDB();

app.set('trust proxy', 1);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dastor-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/quizzes', require('./routes/quizzes'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/stats', require('./routes/stats'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});
app.get('/dashboard', requireAuth('student'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/admin', requireAuth('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/quiz/:id', requireAuth('student'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'quiz.html'));
});

function requireAuth(role) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user) return res.redirect('/login');
    if (role === 'admin' && user.role !== 'admin') return res.redirect('/dashboard');
    next();
  };
}

app.use((req, res) => {
  res.status(404).json({ error: 'الصفحة غير موجودة' });
});

app.listen(PORT, () => {
  console.log(`Dastor platform running on http://localhost:${PORT}`);
});
