/* ============================================================
   منصة دستور — صفحة الاختبار (quiz.js)
   ============================================================ */

async function api(url, options = {}) {
  const opts = { credentials: 'same-origin', ...options, headers: { ...(options.headers || {}) } };
  if (opts.body && typeof opts.body === 'object') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    const err = new Error('تعذّر الاتصال بالخادم، تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.');
    err.network = true;
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* بدون JSON */ }
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || 'حدث خطأ غير متوقع.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function pickNumber(obj, keys, fallback = null) {
  if (!obj || typeof obj !== 'object') return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '' && !isNaN(Number(v))) return Number(v);
  }
  return fallback;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const quizId = location.pathname.split('/').filter(Boolean).pop();

const els = {
  loading: document.getElementById('quizLoading'),
  error: document.getElementById('quizError'),
  card: document.getElementById('quizCard'),
  result: document.getElementById('resultCard'),
  title: document.getElementById('quizTitle'),
  desc: document.getElementById('quizDesc'),
  progressText: document.getElementById('progressText'),
  answeredText: document.getElementById('answeredText'),
  progressFill: document.getElementById('progressFill'),
  question: document.getElementById('questionText'),
  options: document.getElementById('optionsList'),
  prev: document.getElementById('prevBtn'),
  next: document.getElementById('nextBtn'),
  submit: document.getElementById('submitBtn'),
};

let quiz = null;
let questions = [];
let currentIndex = 0;
const answers = {}; // { questionId: optionIndex }

function showError(msg) {
  els.loading.hidden = true;
  els.card.hidden = true;
  els.error.style.display = 'block';
  els.error.innerHTML = `${escapeHtml(msg)} <a href="/dashboard" style="color:var(--primary);font-weight:700;">العودة للوحة</a>`;
}

function normalizeOptions(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch (_) { /* نص حر */ }
    return raw.split('||');
  }
  return [];
}

function normalizeQuiz(payload) {
  const q = payload.quiz || payload.data || payload;
  const rawQuestions = Array.isArray(q.questions) ? q.questions : [];
  return {
    id: q.id ?? quizId,
    title: q.title || 'اختبار',
    description: q.description || '',
    questions: rawQuestions.map((item) => ({
      id: item.id ?? item.question_id,
      text: item.text || item.question || 'سؤال بدون نص',
      options: normalizeOptions(item.options),
    })),
  };
}

function renderQuestion() {
  const q = questions[currentIndex];
  const total = questions.length;

  els.progressText.textContent = `السؤال ${currentIndex + 1} من ${total}`;
  const answeredCount = Object.keys(answers).length;
  els.answeredText.textContent = `${answeredCount} إجابة مُختارة`;
  els.progressFill.style.width = `${((currentIndex + 1) / total) * 100}%`;

  els.question.textContent = q.text;
  const keys = ['أ', 'ب', 'ج', 'د'];
  els.options.innerHTML = q.options
    .map((opt, i) => {
      const selected = answers[q.id] === i;
      return `
        <button type="button" class="option-btn${selected ? ' selected' : ''}" data-opt="${i}">
          <span class="opt-key">${keys[i] || i + 1}</span>
          <span>${escapeHtml(opt)}</span>
        </button>`;
    })
    .join('');

  els.options.querySelectorAll('.option-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      answers[q.id] = Number(btn.dataset.opt);
      renderQuestion();
    });
  });

  els.prev.disabled = currentIndex === 0;
  const isLast = currentIndex === total - 1;
  els.next.hidden = isLast;
  els.submit.hidden = !isLast;
}

async function submitAnswers() {
  const unanswered = questions.filter((q) => answers[q.id] === undefined).length;
  if (unanswered > 0) {
    const ok = confirm(`لديك ${unanswered} سؤالاً دون إجابة. هل تريد إرسال إجاباتك الآن؟`);
    if (!ok) return;
  }

  els.submit.disabled = true;
  els.submit.textContent = 'جارٍ التصحيح...';
  try {
    const payload = await api(`/api/quizzes/${quizId}/submit`, {
      method: 'POST',
      body: { answers },
    });
    showResult(payload || {});
  } catch (err) {
    alert(err.message || 'تعذّر إرسال الإجابات، حاول مرة أخرى.');
    els.submit.disabled = false;
    els.submit.textContent = 'إرسال الإجابات';
  }
}

function showResult(data) {
  const score = pickNumber(data, ['score', 'correct', 'correctCount'], 0) ?? 0;
  const total = pickNumber(data, ['total', 'totalQuestions', 'questions'], questions.length) ?? questions.length;
  let pct = pickNumber(data, ['percentage', 'percent', 'rate'], null);
  if (pct === null) pct = total > 0 ? Math.round((score / total) * 100) : 0;
  pct = Math.max(0, Math.min(100, Math.round(pct)));

  els.card.hidden = true;
  els.result.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  document.getElementById('rbScore').textContent = `${score} / ${total}`;
  document.getElementById('rbCorrect').textContent = score;
  document.getElementById('rbWrong').textContent = Math.max(0, total - score);

  const passed = pct >= 60;
  const title = document.getElementById('resultTitle');
  const msg = document.getElementById('resultMsg');
  if (passed) {
    title.textContent = pct >= 90 ? 'أداء استثنائي! 🌟' : 'مبروك، لقد نجحت!';
    title.style.color = 'var(--green)';
    msg.textContent = pct >= 90
      ? 'نتيجة ممتازة تدل على إتقان حقيقي للمادة — واصل بهذا المستوى الرائع.'
      : 'نتيجة جيدة جداً! راجع ما أخطأت فيه وستبلغ القمة بسرعة.';
  } else {
    title.textContent = 'لا بأس — أعد المحاولة!';
    title.style.color = 'var(--gold)';
    msg.textContent = 'التعلّم رحلة. راجع نقاط ضعفك وحاول مرة أخرى، ستتحسّن نتيجتك بالتأكيد.';
  }

  const ring = document.getElementById('ringFg');
  const CIRC = 408.4;
  ring.style.strokeDashoffset = CIRC;
  requestAnimationFrame(() => {
    setTimeout(() => {
      ring.style.strokeDashoffset = CIRC * (1 - pct / 100);
    }, 120);
  });
  document.getElementById('ringPct').textContent = `${pct}٪`;
}

els.prev.addEventListener('click', () => {
  if (currentIndex > 0) {
    currentIndex--;
    renderQuestion();
  }
});
els.next.addEventListener('click', () => {
  if (currentIndex < questions.length - 1) {
    currentIndex++;
    renderQuestion();
  }
});
els.submit.addEventListener('click', submitAnswers);
document.getElementById('retryBtn').addEventListener('click', () => location.reload());

async function init() {
  if (!quizId) {
    showError('معرّف الاختبار غير صحيح.');
    return;
  }
  try {
    const data = await api(`/api/quizzes/${quizId}`);
    quiz = normalizeQuiz(data);
    questions = quiz.questions;

    if (!questions.length) {
      showError('هذا الاختبار لا يحتوي على أسئلة حالياً.');
      return;
    }

    els.title.textContent = quiz.title;
    els.desc.textContent = quiz.description;
    els.loading.hidden = true;
    els.card.hidden = false;
    renderQuestion();
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      location.href = '/login';
      return;
    }
    if (err.status === 404) {
      showError('الاختبار غير موجود أو تم حذفه.');
      return;
    }
    showError(err.message || 'تعذّر تحميل الاختبار.');
  }
}

init();
