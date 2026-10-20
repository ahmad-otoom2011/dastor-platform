const express = require('express');
const { getDB, groupForGrade } = require('../db');

const router = express.Router();

router.use((req, res, next) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'غير مسجل الدخول' });
  if (user.role !== 'student' && user.role !== 'admin') {
    return res.status(403).json({ error: 'غير مصرح' });
  }
  next();
});

router.get('/', (req, res) => {
  const user = req.session.user;
  const db = getDB();
  const base = `
    SELECT q.id, q.title, q.grade_group, q.description,
      (SELECT COUNT(*) FROM questions AS qs WHERE qs.quiz_id = q.id) AS question_count
    FROM quizzes AS q
  `;
  const rows =
    user.role === 'admin'
      ? db.prepare(base + ' ORDER BY q.id').all()
      : db.prepare(base + ' WHERE q.grade_group = ? ORDER BY q.id').all(groupForGrade(user.grade));
  res.json({ quizzes: rows });
});

router.get('/results/mine', (req, res) => {
  const db = getDB();
  const rows = db
    .prepare(
      `SELECT r.id, r.quiz_id, q.title, r.score, r.total, r.created_at
       FROM results AS r
       JOIN quizzes AS q ON q.id = r.quiz_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC, r.id DESC`
    )
    .all(req.session.user.id);

  res.json({
    results: rows.map((r) => ({
      id: r.id,
      quiz_id: r.quiz_id,
      title: r.title,
      score: r.score,
      total: r.total,
      percent: r.total > 0 ? Math.round((r.score / r.total) * 100) : 0,
      created_at: r.created_at,
    })),
  });
});

router.post('/:id/submit', (req, res) => {
  const quizId = Number(req.params.id);
  if (!Number.isInteger(quizId) || quizId <= 0) {
    return res.status(404).json({ error: 'الاختبار غير موجود' });
  }

  const answers = req.body && req.body.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ error: 'الإجابات مطلوبة' });
  }

  const db = getDB();
  const quiz = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) return res.status(404).json({ error: 'الاختبار غير موجود' });

  const questions = db.prepare('SELECT id, correct_index FROM questions WHERE quiz_id = ?').all(quizId);
  let score = 0;
  for (const q of questions) {
    if (Number(answers[q.id]) === q.correct_index) score++;
  }
  const total = questions.length;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  const result = db
    .prepare('INSERT INTO results (user_id, quiz_id, score, total) VALUES (?, ?, ?, ?)')
    .run(req.session.user.id, quizId, score, total);

  res.json({
    score,
    total,
    percent,
    passed: percent >= 60,
    result_id: Number(result.lastInsertRowid),
  });
});

router.get('/:id', (req, res) => {
  const quizId = Number(req.params.id);
  if (!Number.isInteger(quizId) || quizId <= 0) {
    return res.status(404).json({ error: 'الاختبار غير موجود' });
  }

  const db = getDB();
  const quiz = db
    .prepare('SELECT id, title, description, grade_group FROM quizzes WHERE id = ?')
    .get(quizId);
  if (!quiz) return res.status(404).json({ error: 'الاختبار غير موجود' });

  const rows = db
    .prepare('SELECT id, text, options FROM questions WHERE quiz_id = ? ORDER BY id')
    .all(quizId);

  res.json({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    grade_group: quiz.grade_group,
    questions: rows.map((q) => ({
      id: q.id,
      text: q.text,
      options: JSON.parse(q.options),
    })),
  });
});

router.use((req, res) => {
  res.status(404).json({ error: 'المسار غير موجود' });
});

module.exports = router;
