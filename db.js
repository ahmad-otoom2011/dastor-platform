const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

let db;

function initDB() {
  db = new DatabaseSync(path.join(__dirname, 'data', 'dastor.db'));
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      grade INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      grade_group TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      response TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      responded_at TEXT
    );
  `);

  seed();
  return db;
}

function getDB() {
  if (!db) throw new Error('DB not initialized');
  return db;
}

const GRADE_GROUPS = [
  { key: '1-2', label: 'الصف الأول والثاني' },
  { key: '3-4', label: 'الصف الثالث والرابع' },
  { key: '5-6', label: 'الصف الخامس والسادس' },
  { key: '7-8', label: 'الصف السابع والثامن' },
  { key: '9', label: 'الصف التاسع' },
  { key: '10', label: 'الصف العاشر' },
];

function groupForGrade(grade) {
  if (grade <= 2) return '1-2';
  if (grade <= 4) return '3-4';
  if (grade <= 6) return '5-6';
  if (grade <= 8) return '7-8';
  if (grade === 9) return '9';
  return '10';
}

function seed() {
  const d = getDB();
  const adminExists = d.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!adminExists) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Dastor@2026', 10);
    d.prepare(
      'INSERT INTO users (name, email, password_hash, role, grade) VALUES (?, ?, ?, ?, ?)'
    ).run('مدير المنصة', 'admin@dastor.com', hash, 'admin', null);
  }

  const quizCount = d.prepare('SELECT COUNT(*) AS c FROM quizzes').get().c;
  if (quizCount > 0) return;

  const quizzes = [
    {
      title: 'اختبار المهارات الأساسية',
      grade_group: '1-2',
      description: 'اختبار ممتع يقيس مهارات القراءة والحساب والعلوم لطلاب الصفوف الأولى',
      questions: [
        { text: 'ما ناتج 5 + 7؟', options: ['10', '11', '12', '13'], correct: 2 },
        { text: 'أي كلمة تبدأ بحرف "ب"؟', options: ['قلم', 'بيت', 'شمس', 'نهر'], correct: 1 },
        { text: 'كم عدد أيام الأسبوع؟', options: ['5', '6', '7', '8'], correct: 2 },
        { text: 'ما لون السماء في اليوم المشمس؟', options: ['أزرق', 'أخضر', 'أسود', 'بنفسجي'], correct: 0 },
        { text: 'ما ناتج 9 - 4؟', options: ['4', '5', '6', '7'], correct: 1 },
      ],
    },
    {
      title: 'اختبار الرياضيات والعلوم',
      grade_group: '3-4',
      description: 'اختبار يجمع بين مهارات العمليات الحسابية والمفاهيم العلمية الأساسية',
      questions: [
        { text: 'ما ناتج 12 × 4؟', options: ['36', '44', '48', '52'], correct: 2 },
        { text: 'أي مما يلي غاز؟', options: ['الماء', 'الحديد', 'الأكسجين', 'الملح'], correct: 2 },
        { text: 'كم ضلعاً للمثلث؟', options: ['2', '3', '4', '5'], correct: 1 },
        { text: 'ما هو العدد الأولي من هذه الأعداد؟', options: ['4', '6', '7', '9'], correct: 2 },
        { text: 'أي حيوان يُعد من الثدييات؟', options: ['السمكة', 'الديك', 'الحوت', 'الثعبان'], correct: 2 },
      ],
    },
    {
      title: 'اختبار الكيمياء والفيزياء',
      grade_group: '5-6',
      description: 'اختبار في المفاهيم العلمية المتقدمة قليلاً لطلاب منتصف المرحلة',
      questions: [
        { text: 'ما رمز العنصر "الأكسجين"؟', options: ['Ox', 'O', 'Og', 'On'], correct: 1 },
        { text: 'ما وحدة قياس القوة؟', options: ['النيوتن', 'الجول', 'الواط', 'البيسكال'], correct: 0 },
        { text: 'أي مما يلي حمض؟', options: ['الماء', 'الخل', 'الصودا', 'السكر'], correct: 1 },
        { text: 'كم يبلغ عدد كواكب المجموعة الشمسية؟', options: ['7', '8', '9', '10'], correct: 1 },
        { text: 'ما أسرع وسيلة لانتشار الصوت؟', options: ['الهواء', 'الماء', 'الفضاء', 'المعادن'], correct: 3 },
      ],
    },
    {
      title: 'اختبار العلوم المتكاملة',
      grade_group: '7-8',
      description: 'اختبار شامل لطلاب الصفين السابع والثامن يغطي عدة تخصصات علمية',
      questions: [
        { text: 'ما وحدة قياس التيار الكهربائي؟', options: ['الفولت', 'الأمبير', 'الأوم', 'الواط'], correct: 1 },
        { text: 'أي مما يلي يُعد قاعدة؟', options: ['NaCl', 'H2O', 'NH3', 'كل ما سبق'], correct: 3 },
        { text: 'ما الوظيفة الأساسية للريبوسوم؟', options: ['التنفس', 'تصنيع البروتين', 'التخزين', 'النقل'], correct: 1 },
        { text: 'ما سرعة الضوء تقريباً؟', options: ['300 كم/ث', '3000 كم/ث', '300000 كم/ث', '3000000 كم/ث'], correct: 2 },
        { text: 'أي مما يلي ينتج الطاقة في الخلية؟', options: ['الميتوكوندريا', 'النواة', 'الغشاء', 'الليسوسوم'], correct: 0 },
      ],
    },
    {
      title: 'اختبار الكيمياء المتقدم',
      grade_group: '9',
      description: 'اختبار متخصص لطلاب الصف التاسع في أساسيات الكيمياء والفيزياء',
      questions: [
        { text: 'ما عدد أنواع الروابط الكيميائية الرئيسية؟', options: ['2', '3', '4', '5'], correct: 1 },
        { text: 'ما مقدار pH للماء المقطر عند 25°C؟', options: ['0', '7', '10', '14'], correct: 1 },
        { text: 'أي قانون ينص على أن الحجم يتناسب عكسياً مع الضغط؟', options: ['نوتن', 'شارل', 'بويل', 'أفوجادرو'], correct: 2 },
        { text: 'ما الغاز الأكثر وفرة في الغلاف الجوي؟', options: ['الأكسجين', 'النيتروجين', 'الثاني أكسيد الكربون', 'الهيدروجين'], correct: 1 },
        { text: 'ما ناتج تفاعل الحمض مع القاعدة؟', options: ['غاز', 'ملح وماء', 'فلز', 'بلورة'], correct: 1 },
      ],
    },
    {
      title: 'اختبار تجريبي لطلاب الصف العاشر',
      grade_group: '10',
      description: 'اختبار شامل يمثّل مستوى الثانوية العامة يغطي عدة مواد علمية',
      questions: [
        { text: 'ما ناتج اشتقاق الدالة f(x) = x³؟', options: ['x²', '3x²', '3x', 'x³/3'], correct: 1 },
        { text: 'أي مما يلي مخلوق حي غير خلوي؟', options: ['البكتيريا', 'الفطر', 'الفيروس', 'الشجرة'], correct: 2 },
        { text: 'ما وحدة قياس الشحنة الكهربائية؟', options: ['الكولوم', 'الفولت', 'الأمبير', 'الهنري'], correct: 0 },
        { text: 'كم عدد ذرات الكربون في جزيء C₂H₆؟', options: ['1', '2', '3', '6'], correct: 1 },
        { text: 'ما أقصى كمية لتوافق الحركة (فيزياء) تُحسب بوحدة؟', options: ['الكيلوجرام·متر/ثانية', 'الجول', 'الواط', 'النيوتن'], correct: 0 },
      ],
    },
  ];

  const insertQuiz = d.prepare('INSERT INTO quizzes (title, grade_group, description) VALUES (?, ?, ?)');
  const insertQ = d.prepare('INSERT INTO questions (quiz_id, text, options, correct_index) VALUES (?, ?, ?, ?)');

  for (const q of quizzes) {
    const r = insertQuiz.run(q.title, q.grade_group, q.description);
    for (const question of q.questions) {
      insertQ.run(r.lastInsertRowid, question.text, JSON.stringify(question.options), question.correct);
    }
  }
}

module.exports = { initDB, getDB, GRADE_GROUPS, groupForGrade };
