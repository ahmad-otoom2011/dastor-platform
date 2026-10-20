const express = require('express');
const { getDB, GRADE_GROUPS } = require('../db');

const router = express.Router();

router.use((req, res, next) => {
  const user = req.session.user;
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
  next();
});

router.get('/overview', (req, res) => {
  const db = getDB();
  const users_count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const quizzes_count = db.prepare('SELECT COUNT(*) AS c FROM quizzes').get().c;
  const results_count = db.prepare('SELECT COUNT(*) AS c FROM results').get().c;
  const messages_open = db
    .prepare("SELECT COUNT(*) AS c FROM messages WHERE status = 'open'")
    .get().c;
  const recent_results = db
    .prepare(
      `SELECT u.name, q.title, r.score, r.total, r.created_at
       FROM results AS r
       JOIN users AS u ON u.id = r.user_id
       JOIN quizzes AS q ON q.id = r.quiz_id
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 10`
    )
    .all();

  res.json({ users_count, quizzes_count, results_count, messages_open, recent_results });
});

router.get('/users', (req, res) => {
  const db = getDB();
  const users = db
    .prepare('SELECT id, name, email, role, grade, created_at FROM users ORDER BY id')
    .all();
  res.json({ users });
});

router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (id === req.session.user.id) {
    return res.status(400).json({ error: 'لا يمكنك حذف حسابك الحالي' });
  }

  const db = getDB();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM results WHERE user_id = ?').run(id);
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (result.changes === 0) {
      db.exec('ROLLBACK');
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'حدث خطأ أثناء حذف المستخدم' });
  }

  res.json({ ok: true });
});

router.get('/quizzes', (req, res) => {
  const db = getDB();
  const quizzes = db
    .prepare('SELECT id, title, grade_group, description FROM quizzes ORDER BY id')
    .all();
  const questionRows = db
    .prepare('SELECT id, quiz_id, text, options, correct_index FROM questions ORDER BY id')
    .all();

  const byQuiz = new Map();
  for (const q of questionRows) {
    if (!byQuiz.has(q.quiz_id)) byQuiz.set(q.quiz_id, []);
    byQuiz.get(q.quiz_id).push({
      id: q.id,
      text: q.text,
      options: JSON.parse(q.options),
      correct_index: q.correct_index,
    });
  }

  res.json({
    quizzes: quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      grade_group: q.grade_group,
      description: q.description,
      questions: byQuiz.get(q.id) || [],
    })),
  });
});

function validateQuizPayload(body) {
  const b = body || {};
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title) return 'عنوان الاختبار مطلوب';
  if (!GRADE_GROUPS.some((g) => g.key === b.grade_group)) return 'المجموعة الدراسية غير صالحة';
  if (b.description != null && typeof b.description !== 'string') return 'وصف الاختبار غير صالح';
  if (!Array.isArray(b.questions) || b.questions.length === 0) {
    return 'يجب إضافة سؤال واحد على الأقل';
  }

  for (const q of b.questions) {
    if (!q || typeof q.text !== 'string' || !q.text.trim()) return 'نص كل سؤال مطلوب';
    if (!Array.isArray(q.options) || q.options.length < 2) {
      return 'خيارات كل سؤال يجب ألا تقل عن خيارين';
    }
    if (q.options.some((o) => typeof o !== 'string')) return 'خيارات الأسئلة يجب أن تكون نصوصاً';
    const ci = Number(q.correct_index);
    if (!Number.isInteger(ci) || ci < 0 || ci >= q.options.length) {
      return 'الإجابة الصحيحة يجب أن تكون ضمن حدود خيارات السؤال';
    }
  }

  return null;
}

function insertQuestions(db, quizId, questions) {
  const stmt = db.prepare(
    'INSERT INTO questions (quiz_id, text, options, correct_index) VALUES (?, ?, ?, ?)'
  );
  for (const q of questions) {
    stmt.run(quizId, q.text.trim(), JSON.stringify(q.options), Number(q.correct_index));
  }
}

function quizWithQuestions(db, quizId) {
  const quiz = db
    .prepare('SELECT id, title, grade_group, description FROM quizzes WHERE id = ?')
    .get(quizId);
  const rows = db
    .prepare('SELECT id, text, options, correct_index FROM questions WHERE quiz_id = ? ORDER BY id')
    .all(quizId);
  return {
    ...quiz,
    questions: rows.map((q) => ({
      id: q.id,
      text: q.text,
      options: JSON.parse(q.options),
      correct_index: q.correct_index,
    })),
  };
}

router.post('/quizzes', (req, res) => {
  const error = validateQuizPayload(req.body);
  if (error) return res.status(400).json({ error });

  const { title, grade_group, questions } = req.body;
  const description = typeof req.body.description === 'string' ? req.body.description : '';
  const db = getDB();

  let quizId;
  db.exec('BEGIN');
  try {
    const result = db
      .prepare('INSERT INTO quizzes (title, grade_group, description) VALUES (?, ?, ?)')
      .run(title.trim(), grade_group, description);
    quizId = Number(result.lastInsertRowid);
    insertQuestions(db, quizId, questions);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'حدث خطأ أثناء حفظ الاختبار' });
  }

  res.status(201).json(quizWithQuestions(db, quizId));
});

router.put('/quizzes/:id', (req, res) => {
  const quizId = Number(req.params.id);
  if (!Number.isInteger(quizId) || quizId <= 0) {
    return res.status(404).json({ error: 'الاختبار غير موجود' });
  }

  const error = validateQuizPayload(req.body);
  if (error) return res.status(400).json({ error });

  const { title, grade_group, questions } = req.body;
  const description = typeof req.body.description === 'string' ? req.body.description : '';
  const db = getDB();

  const existing = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(quizId);
  if (!existing) return res.status(404).json({ error: 'الاختبار غير موجود' });

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE quizzes SET title = ?, grade_group = ?, description = ? WHERE id = ?').run(
      title.trim(),
      grade_group,
      description,
      quizId
    );
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(quizId);
    insertQuestions(db, quizId, questions);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'حدث خطأ أثناء تحديث الاختبار' });
  }

  res.json(quizWithQuestions(db, quizId));
});

router.delete('/quizzes/:id', (req, res) => {
  const quizId = Number(req.params.id);
  if (!Number.isInteger(quizId) || quizId <= 0) {
    return res.status(404).json({ error: 'الاختبار غير موجود' });
  }

  const db = getDB();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM results WHERE quiz_id = ?').run(quizId);
    db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(quizId);
    const result = db.prepare('DELETE FROM quizzes WHERE id = ?').run(quizId);
    if (result.changes === 0) {
      db.exec('ROLLBACK');
      return res.status(404).json({ error: 'الاختبار غير موجود' });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'حدث خطأ أثناء حذف الاختبار' });
  }

  res.json({ ok: true });
});

router.get('/messages', (req, res) => {
  const db = getDB();
  const messages = db
    .prepare('SELECT * FROM messages ORDER BY created_at DESC, id DESC')
    .all();
  res.json({ messages });
});

router.post('/messages/:id/respond', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'الرسالة غير موجودة' });

  const response = req.body && typeof req.body.response === 'string' ? req.body.response.trim() : '';
  if (!response) return res.status(400).json({ error: 'نص الرد مطلوب' });

  const db = getDB();
  const msg = db.prepare('SELECT id FROM messages WHERE id = ?').get(id);
  if (!msg) return res.status(404).json({ error: 'الرسالة غير موجودة' });

  db.prepare(
    "UPDATE messages SET response = ?, status = 'closed', responded_at = datetime('now') WHERE id = ?"
  ).run(response, id);

  res.json({ ok: true });
});

router.post('/messages/:id/reopen', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'الرسالة غير موجودة' });

  const db = getDB();
  const msg = db.prepare('SELECT id FROM messages WHERE id = ?').get(id);
  if (!msg) return res.status(404).json({ error: 'الرسالة غير موجودة' });

  db.prepare("UPDATE messages SET status = 'open' WHERE id = ?").run(id);

  res.json({ ok: true });
});

module.exports = router;
