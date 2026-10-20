const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../db');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = body.password;
  const grade = Number(body.grade);

  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 6 أحرف' });
  }
  if (!Number.isInteger(grade) || grade < 1 || grade > 10) {
    return res.status(400).json({ error: 'الصف الدراسي يجب أن يكون رقماً صحيحاً بين 1 و10' });
  }

  const db = getDB();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'البريد الإلكتروني مستخدم مسبقاً' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role, grade) VALUES (?, ?, ?, ?, ?)')
    .run(name, email, hash, 'student', grade);

  const user = {
    id: Number(result.lastInsertRowid),
    name,
    email,
    role: 'student',
    grade,
  };
  req.session.user = user;
  res.status(201).json(user);
});

router.post('/login', (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = body.password;

  if (!email || typeof password !== 'string' || !password) {
    return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
  }

  const db = getDB();
  const row = db
    .prepare('SELECT id, name, email, password_hash, role, grade FROM users WHERE email = ?')
    .get(email);

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
  }

  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    grade: row.grade,
  };
  req.session.user = user;
  res.json(user);
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'غير مسجل الدخول' });
  res.json(req.session.user);
});

module.exports = router;
