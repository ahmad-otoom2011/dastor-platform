const express = require('express');
const { getDB, GRADE_GROUPS, groupForGrade } = require('../db');

const router = express.Router();

router.get('/public', (req, res) => {
  const db = getDB();

  const students_count = db
    .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'student'")
    .get().c;
  const quizzes_count = db.prepare('SELECT COUNT(*) AS c FROM quizzes').get().c;
  const agg = db
    .prepare(
      'SELECT COUNT(*) AS c, AVG(CASE WHEN total > 0 THEN score * 100.0 / total END) AS a FROM results'
    )
    .get();

  const counts = {};
  const grades = db
    .prepare("SELECT grade FROM users WHERE role = 'student' AND grade IS NOT NULL")
    .all();
  for (const row of grades) {
    const key = groupForGrade(row.grade);
    counts[key] = (counts[key] || 0) + 1;
  }

  const grade_distribution = GRADE_GROUPS.map((g) => ({
    group: g.key,
    label: g.label,
    count: counts[g.key] || 0,
  }));

  res.json({
    students_count,
    quizzes_count,
    results_count: agg.c,
    avg_percent: agg.a == null ? 0 : Math.round(agg.a * 10) / 10,
    grade_distribution,
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'غير مسجل الدخول' });

  const db = getDB();
  const rows = db
    .prepare(
      `SELECT r.score, r.total, r.created_at, q.title
       FROM results AS r
       JOIN quizzes AS q ON q.id = r.quiz_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC, r.id DESC`
    )
    .all(req.session.user.id);

  const total_results = rows.length;
  let percentSum = 0;
  let passed = 0;
  let best_percent = 0;

  const by_quiz = rows.map((r) => {
    const percent = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
    percentSum += percent;
    if (percent >= 60) passed++;
    if (percent > best_percent) best_percent = percent;
    return { title: r.title, percent, created_at: r.created_at };
  });

  res.json({
    total_results,
    avg_percent: total_results ? Math.round((percentSum / total_results) * 10) / 10 : 0,
    best_percent,
    by_quiz,
    pass_rate: total_results ? Math.round((passed / total_results) * 100) : 0,
  });
});

module.exports = router;
