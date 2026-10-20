const express = require('express');
const { getDB } = require('../db');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/', (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
  if (message.length < 10) {
    return res.status(400).json({ error: 'الرسالة يجب ألا تقل عن 10 أحرف' });
  }

  const db = getDB();
  db.prepare('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)').run(
    name,
    email,
    message
  );

  res.status(201).json({ ok: true, message: 'تم استلام رسالتك وسنتواصل معك قريباً' });
});

module.exports = router;
