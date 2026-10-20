/* ============================================================
   منصة دستور — لوحة الإدارة (admin.js)
   ============================================================ */

const GRADE_LABELS = {
  '1-2': 'الصف الأول والثاني',
  '3-4': 'الصف الثالث والرابع',
  '5-6': 'الصف الخامس والسادس',
  '7-8': 'الصف السابع والثامن',
  '9': 'الصف التاسع',
  '10': 'الصف العاشر',
};
const GRADE_ORDER = ['1-2', '3-4', '5-6', '7-8', '9', '10'];
const CHART_FONT = { family: 'Tajawal', size: 13 };

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

function guardAuth(err) {
  if (err && (err.status === 401 || err.status === 403)) {
    location.href = '/login';
    return true;
  }
  return false;
}

function pickNumber(obj, keys, fallback = null) {
  if (!obj || typeof obj !== 'object') return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '' && !isNaN(Number(v))) return Number(v);
  }
  return fallback;
}

function pickString(obj, keys, fallback = '') {
  if (!obj || typeof obj !== 'object') return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return fallback;
}

function asArray(data, keys) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const k of keys) if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

function deepGet(obj, paths) {
  for (const p of paths) {
    let cur = obj;
    let ok = true;
    for (const seg of p.split('.')) {
      if (cur && typeof cur === 'object' && seg in cur) cur = cur[seg];
      else { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}

function toEntries(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item, i) => {
      if (typeof item === 'object' && item !== null) {
        const key = item.grade_group ?? item.group ?? item.key ?? item.grade ?? item.label ?? i;
        const count = pickNumber(item, ['count', 'total', 'students', 'quizzes', 'value', 'users', 'results'], 0);
        return { key: String(key), count };
      }
      return { key: String(i), count: Number(item) || 0 };
    });
  }
  if (typeof value === 'object') {
    return Object.entries(value).map(([k, v]) => ({
      key: String(k),
      count: typeof v === 'object' ? pickNumber(v, ['count', 'total', 'students', 'quizzes', 'value'], 0) : Number(v) || 0,
    }));
  }
  return [];
}

function orderEntries(entries) {
  const idx = (k) => { const i = GRADE_ORDER.findIndex((o) => o === String(k)); return i === -1 ? 999 : i; };
  return [...entries].sort((a, b) => idx(a.key) - idx(b.key));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showBoxAlert(id, type, msg) {
  const box = document.getElementById(id);
  if (!box) return;
  if (!msg) { box.className = 'alert'; box.textContent = ''; return; }
  box.className = `alert alert-${type} show`;
  box.textContent = msg;
}

function showEmpty(canvasId, emptyId, show) {
  const canvas = document.getElementById(canvasId);
  const empty = document.getElementById(emptyId);
  if (canvas) canvas.style.display = show ? 'none' : 'block';
  if (empty) empty.style.display = show ? 'flex' : 'none';
}

/* ================= التبديل بين الأقسام ================= */
const PANEL_META = {
  overview: { title: 'نظرة عامة', sub: 'ملخّص حالة المنصة لحظة بلحظة' },
  users: { title: 'المستخدمون', sub: 'إدارة حسابات المنصة وصلاحياتها' },
  quizzes: { title: 'الاختبارات', sub: 'إنشاء الاختبارات وتعديلها وحذفها' },
  messages: { title: 'الرسائل', sub: 'رسائل الزوار والردّ عليها' },
};
const loadedPanels = {};
let currentPanel = 'overview';

function switchPanel(name) {
  if (!PANEL_META[name]) name = 'overview';
  currentPanel = name;

  document.querySelectorAll('.admin-panel').forEach((p) => p.classList.remove('active'));
  document.getElementById(`panel-${name}`)?.classList.add('active');

  document.querySelectorAll('#sideNav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.panel === name);
  });

  const meta = PANEL_META[name];
  document.getElementById('pageTitle').textContent = meta.title;
  document.getElementById('pageSub').textContent = meta.sub;
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sideBackdrop')?.classList.remove('show');

  if (!loadedPanels[name]) {
    loadedPanels[name] = true;
    ({ overview: loadOverview, users: loadUsers, quizzes: loadQuizzes, messages: loadMessages })[name]();
  }
}

document.querySelectorAll('#sideNav a[data-panel]').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    switchPanel(a.dataset.panel);
    history.replaceState(null, '', `#${a.dataset.panel}`);
  });
});

/* ================= نظرة عامة ================= */
async function loadOverview() {
  try {
    const data = (await api('/api/admin/overview')) || {};

    setText('ovStudents', pickNumber(data, ['students', 'totalStudents', 'users', 'studentCount', 'usersCount'], '—'));
    setText('ovQuizzes', pickNumber(data, ['quizzes', 'totalQuizzes', 'quizCount'], '—'));
    setText('ovResults', pickNumber(data, ['results', 'totalResults', 'resultCount', 'attempts'], '—'));
    const msgs = pickNumber(data, ['messages', 'totalMessages', 'messageCount', 'openMessages'], null);
    setText('ovMessages', msgs !== null ? msgs : '—');

    const usersRaw = deepGet(data, [
      'studentsByGrade', 'students_by_grade', 'usersByGrade', 'gradeDistribution',
      'byGrade', 'byGroup', 'distribution.students', 'charts.studentsByGrade',
    ]) ?? deepGet(data, ['distribution']);
    renderUsersChart(orderEntries(toEntries(usersRaw)));

    /* مصادر بيانات النتائج — ترتيب الأولوية */
    const resultsByGroupRaw = deepGet(data, ['resultsByGrade', 'results_by_grade', 'resultsByGroup', 'quizResultsByGroup']);
    if (resultsByGroupRaw) {
      document.getElementById('ovResultsChartSub').textContent = 'عدد النتائج المسجّلة لكل مجموعة دراسية';
      renderResultsChart(orderEntries(toEntries(resultsByGroupRaw)).map((e) => ({
        label: GRADE_LABELS[e.key] || e.key,
        value: e.count,
        color: paletteFor(e.key),
      })), 'doughnut');
      return;
    }

    const recent = asArray(deepGet(data, ['recentResults', 'latestResults', 'results']), ['recentResults', 'results']);
    if (recent.length) {
      const buckets = [
        { label: 'ممتاز (٩٠ – ١٠٠)', color: '#10B981', value: 0 },
        { label: 'جيد (٧٥ – ٨٩)', color: '#4C6EF5', value: 0 },
        { label: 'مقبول (٦٠ – ٧٤)', color: '#F59E0B', value: 0 },
        { label: 'ضعيف (أقل من ٦٠)', color: '#EF4444', value: 0 },
      ];
      recent.forEach((r) => {
        let pct = pickNumber(r, ['percentage', 'percent', 'rate'], null);
        if (pct === null) {
          const score = pickNumber(r, ['score', 'correct'], 0);
          const total = pickNumber(r, ['total', 'max_score'], 0);
          pct = total > 0 ? (score / total) * 100 : 0;
        }
        if (pct >= 90) buckets[0].value++;
        else if (pct >= 75) buckets[1].value++;
        else if (pct >= 60) buckets[2].value++;
        else buckets[3].value++;
      });
      document.getElementById('ovResultsChartSub').textContent = 'توزيع الدرجات المسجّلة على مستويات الإتقان';
      renderResultsChart(buckets.filter((b) => b.value > 0), 'doughnut');
      return;
    }

    const avg = pickNumber(data, ['average', 'avg', 'averageScore'], null);
    if (avg !== null) {
      document.getElementById('ovResultsChartSub').textContent = 'متوسط التحصيل مقابل باقي النطاق';
      renderResultsChart([
        { label: 'متوسط التحصيل', value: Math.round(avg * 10) / 10, color: '#4C6EF5' },
        { label: 'المتبقي', value: Math.round((100 - avg) * 10) / 10, color: '#E5E9F2' },
      ], 'doughnut');
      return;
    }

    showEmpty('ovResultsChart', 'ovResultsChartEmpty', true);
  } catch (err) {
    if (guardAuth(err)) return;
    setText('ovStudents', '—'); setText('ovQuizzes', '—');
    setText('ovResults', '—'); setText('ovMessages', '—');
    showEmpty('ovUsersChart', 'ovUsersChartEmpty', true);
    showEmpty('ovResultsChart', 'ovResultsChartEmpty', true);
  }
}

function paletteFor(key) {
  const map = { '1-2': '#3B5BDB', '3-4': '#4C6EF5', '5-6': '#F59E0B', '7-8': '#10B981', '9': '#845EF7', '10': '#0EA5E9' };
  return map[key] || '#4C6EF5';
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

let ovUsersChart = null;
function renderUsersChart(entries) {
  const hasData = entries.length > 0 && entries.some((e) => e.count > 0);
  showEmpty('ovUsersChart', 'ovUsersChartEmpty', !hasData);
  if (!hasData || typeof Chart === 'undefined') return;
  ovUsersChart?.destroy();
  ovUsersChart = new Chart(document.getElementById('ovUsersChart'), {
    type: 'bar',
    data: {
      labels: entries.map((e) => GRADE_LABELS[e.key] || e.key),
      datasets: [{
        label: 'عدد المستخدمين',
        data: entries.map((e) => e.count),
        backgroundColor: entries.map((e) => paletteFor(e.key)),
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 50,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { rtl: true, textDirection: 'rtl', titleFont: CHART_FONT, bodyFont: CHART_FONT } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#EEF1F8' }, ticks: { color: '#6B7280', font: CHART_FONT, precision: 0 } },
        x: { grid: { display: false }, ticks: { color: '#6B7280', font: CHART_FONT } },
      },
      animation: { duration: 1100, easing: 'easeOutQuart' },
    },
  });
}

let ovResultsChart = null;
function renderResultsChart(items, type) {
  const hasData = items.length > 0 && items.some((i) => i.value > 0);
  showEmpty('ovResultsChart', 'ovResultsChartEmpty', !hasData);
  if (!hasData || typeof Chart === 'undefined') return;
  ovResultsChart?.destroy();
  ovResultsChart = new Chart(document.getElementById('ovResultsChart'), {
    type,
    data: {
      labels: items.map((i) => i.label),
      datasets: [{ data: items.map((i) => i.value), backgroundColor: items.map((i) => i.color), borderColor: '#fff', borderWidth: 3, hoverOffset: 10 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', rtl: true, labels: { color: '#1F2937', font: CHART_FONT, usePointStyle: true, padding: 14 } },
        tooltip: { rtl: true, textDirection: 'rtl', titleFont: CHART_FONT, bodyFont: CHART_FONT },
      },
      animation: { duration: 1100, easing: 'easeOutQuart' },
    },
  });
}

/* ================= المستخدمون ================= */
async function loadUsers() {
  const tbody = document.getElementById('usersBody');
  try {
    const data = await api('/api/admin/users');
    const users = asArray(data, ['users', 'items', 'data']);
    setText('usersCount', `${users.length} مستخدم`);

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">لا يوجد مستخدمون بعد.</td></tr>';
      return;
    }

    tbody.innerHTML = users.map((u, i) => {
      const id = u.id;
      const role = pickString(u, ['role'], 'student');
      const grade = pickNumber(u, ['grade'], null);
      const roleChip = role === 'admin'
        ? '<span class="chip gold">مدير</span>'
        : '<span class="chip green">طالب</span>';
      return `
        <tr>
          <td>${i + 1}</td>
          <td><b>${escapeHtml(pickString(u, ['name'], 'بدون اسم'))}</b></td>
          <td dir="ltr">${escapeHtml(pickString(u, ['email'], '—'))}</td>
          <td>${roleChip}</td>
          <td>${grade !== null ? escapeHtml(GRADE_LABELS[String(grade)] || `الصف ${grade}`) : '—'}</td>
          <td>${fmtDate(u.created_at || u.createdAt)}</td>
          <td>
            <button class="btn btn-danger btn-sm btn-delete-user" data-id="${escapeHtml(id)}" data-name="${escapeHtml(pickString(u, ['name'], ''))}">حذف</button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-delete-user').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = confirm(`هل تريد فعلاً حذف حساب "${btn.dataset.name}"؟ لا يمكن التراجع عن هذا الإجراء.`);
        if (!ok) return;
        btn.disabled = true;
        try {
          await api(`/api/admin/users/${btn.dataset.id}`, { method: 'DELETE' });
          loadUsers();
        } catch (err) {
          if (guardAuth(err)) return;
          alert(err.message || 'تعذّر حذف المستخدم.');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    if (guardAuth(err)) return;
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

/* ================= الاختبارات ================= */
let editingQuizId = null;

async function loadQuizzes() {
  const list = document.getElementById('adminQuizList');
  try {
    const data = await api('/api/admin/quizzes');
    const quizzes = asArray(data, ['quizzes', 'items', 'data']);

    if (!quizzes.length) {
      list.innerHTML = '<p class="table-empty" style="color:var(--muted);">لا توجد اختبارات — أنشئ أول اختبار من النموذج أعلاه.</p>';
      return;
    }

    list.innerHTML = quizzes.map((q) => {
      const id = q.id ?? q.quiz_id;
      const title = escapeHtml(pickString(q, ['title', 'name'], 'اختبار'));
      const group = pickString(q, ['grade_group', 'group'], '');
      const qCount = pickNumber(q, ['question_count', 'questions_count', 'count'], null);
      const questionsLen = Array.isArray(q.questions) ? q.questions.length : null;
      const countLabel = qCount !== null ? `${qCount} سؤال` : questionsLen !== null ? `${questionsLen} سؤال` : '';
      return `
        <div class="quiz-admin-item">
          <div class="qi-main">
            <b>${title}</b>
            <span>${escapeHtml(GRADE_LABELS[group] || group || '—')}${countLabel ? ' · ' + countLabel : ''} · أُنشئ في ${fmtDate(q.created_at || q.createdAt)}</span>
          </div>
          <div class="qi-actions">
            <button class="btn btn-outline btn-sm qi-edit" data-id="${escapeHtml(id)}">تعديل</button>
            <button class="btn btn-danger btn-sm qi-delete" data-id="${escapeHtml(id)}" data-title="${title}">حذف</button>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.qi-edit').forEach((btn) =>
      btn.addEventListener('click', () => startEditQuiz(btn.dataset.id, quizzes))
    );
    list.querySelectorAll('.qi-delete').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const ok = confirm(`هل تريد حذف الاختبار "${btn.dataset.title}" وكل أسئلته ونتائجه؟`);
        if (!ok) return;
        btn.disabled = true;
        try {
          await api(`/api/admin/quizzes/${btn.dataset.id}`, { method: 'DELETE' });
          if (String(editingQuizId) === String(btn.dataset.id)) resetQuizForm();
          loadQuizzes();
        } catch (err) {
          if (guardAuth(err)) return;
          alert(err.message || 'تعذّر حذف الاختبار.');
          btn.disabled = false;
        }
      })
    );
  } catch (err) {
    if (guardAuth(err)) return;
    list.innerHTML = `<div class="alert alert-error show">${escapeHtml(err.message)}</div>`;
  }
}

function updateQuestionsCount() {
  const n = document.getElementById('questionsWrap').children.length;
  document.getElementById('questionsCount').textContent =
    n === 0 ? 'لا توجد أسئلة بعد' : n === 1 ? 'سؤال واحد' : n === 2 ? 'سؤالان' : `${n} أسئلة`;
}

function addQuestionBlock(data = null) {
  const wrap = document.getElementById('questionsWrap');
  const n = wrap.children.length + 1;
  const radioName = `correct-${Date.now()}-${n}`;
  const block = document.createElement('div');
  block.className = 'q-block';

  const options = data && Array.isArray(data.options) ? data.options : ['', '', '', ''];
  const correctIdx = data && Number.isInteger(data.correct_index) ? data.correct_index : -1;
  const keys = ['أ', 'ب', 'ج', 'د'];

  block.innerHTML = `
    <div class="q-block-head">
      <b>السؤال <span class="q-num">${n}</span></b>
      <button type="button" class="q-remove">حذف السؤال</button>
    </div>
    <div class="form-group" style="margin-bottom:6px;">
      <label>نص السؤال</label>
      <input type="text" class="form-control q-text" placeholder="اكتب نص السؤال هنا..." value="${escapeHtml(data ? data.text || '' : '')}" />
    </div>
    <div class="q-options">
      ${[0, 1, 2, 3].map((i) => `
        <div class="q-option-row">
          <input type="radio" name="${radioName}" class="q-correct" value="${i}" ${correctIdx === i ? 'checked' : ''} id="${radioName}-${i}" />
          <label for="${radioName}-${i}">الخيار ${keys[i]}</label>
          <input type="text" class="form-control q-option" style="border:none;background:transparent;padding:6px 0;" placeholder="نص الخيار ${keys[i]}" value="${escapeHtml(options[i] ?? '')}" />
        </div>`).join('')}
    </div>
    <div style="margin-top:8px;font-size:.82rem;color:var(--muted);">حدّد الزر بجانب الإجابة الصحيحة من الخيارات الأربعة.</div>
  `;

  block.querySelector('.q-remove').addEventListener('click', () => {
    if (document.getElementById('questionsWrap').children.length <= 1) {
      showBoxAlert('quizFormAlert', 'error', 'يجب أن يحتوي الاختبار على سؤال واحد على الأقل.');
      return;
    }
    block.remove();
    renumberQuestions();
    updateQuestionsCount();
  });

  wrap.appendChild(block);
  updateQuestionsCount();
}

function renumberQuestions() {
  document.querySelectorAll('#questionsWrap .q-num').forEach((span, i) => { span.textContent = i + 1; });
}

function resetQuizForm() {
  editingQuizId = null;
  document.getElementById('quizForm').reset();
  document.getElementById('quizId').value = '';
  document.getElementById('questionsWrap').innerHTML = '';
  document.getElementById('quizFormTitle').textContent = 'إضافة اختبار جديد';
  document.getElementById('saveQuizBtn').textContent = 'حفظ الاختبار';
  document.getElementById('cancelEditBtn').hidden = true;
  showBoxAlert('quizFormAlert', 'info', '');
  addQuestionBlock();
  updateQuestionsCount();
}

async function startEditQuiz(id, quizzes) {
  let quiz = quizzes.find((q) => String(q.id ?? q.quiz_id) === String(id));
  if (!quiz) return;

  let questions = Array.isArray(quiz.questions) ? quiz.questions : null;
  if (!questions) {
    try {
      const deep = await api(`/api/admin/quizzes/${id}`);
      const d = deep.quiz || deep;
      questions = Array.isArray(d.questions) ? d.questions : null;
    } catch (_) { questions = null; }
  }

  editingQuizId = id;
  document.getElementById('quizId').value = id;
  document.getElementById('quizTitle').value = pickString(quiz, ['title', 'name'], '');
  document.getElementById('quizGroup').value = pickString(quiz, ['grade_group', 'group'], '1-2');
  document.getElementById('quizDesc').value = pickString(quiz, ['description', 'desc'], '');
  document.getElementById('quizFormTitle').textContent = 'تعديل الاختبار';
  document.getElementById('saveQuizBtn').textContent = 'حفظ التعديلات';
  document.getElementById('cancelEditBtn').hidden = false;

  const wrap = document.getElementById('questionsWrap');
  wrap.innerHTML = '';
  if (questions && questions.length) {
    questions.forEach((q) => {
      let opts = q.options;
      if (typeof opts === 'string') {
        try { opts = JSON.parse(opts); } catch (_) { opts = opts.split('||'); }
      }
      let correct = pickNumber(q, ['correct_index', 'correct'], -1);
      addQuestionBlock({ text: q.text || '', options: Array.isArray(opts) ? opts : ['', '', '', ''], correct_index: correct });
    });
  } else {
    addQuestionBlock();
    showBoxAlert('quizFormAlert', 'info', 'تعذّر تحميل أسئلة الاختبار تلقائياً — أعد إدخالها ثم احفظ التعديلات.');
  }
  updateQuestionsCount();

  showBoxAlert('quizFormAlert', questions && questions.length ? 'success' : 'info',
    `تم فتح "${document.getElementById('quizTitle').value}" للتعديل.`);
  document.getElementById('panel-quizzes').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('addQuestionBtn').addEventListener('click', () => {
  addQuestionBlock();
  const wrap = document.getElementById('questionsWrap');
  wrap.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

document.getElementById('cancelEditBtn').addEventListener('click', resetQuizForm);

document.getElementById('quizForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showBoxAlert('quizFormAlert', 'info', '');

  const title = document.getElementById('quizTitle').value.trim();
  const grade_group = document.getElementById('quizGroup').value;
  const description = document.getElementById('quizDesc').value.trim();
  const blocks = [...document.querySelectorAll('#questionsWrap .q-block')];

  if (!title || !description) {
    showBoxAlert('quizFormAlert', 'error', 'يرجى إدخال عنوان الاختبار ووصفه.');
    return;
  }
  if (!blocks.length) {
    showBoxAlert('quizFormAlert', 'error', 'أضف سؤالاً واحداً على الأقل.');
    return;
  }

  const questions = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const text = b.querySelector('.q-text').value.trim();
    const options = [...b.querySelectorAll('.q-option')].map((o) => o.value.trim());
    const checked = b.querySelector('.q-correct:checked');
    const correct_index = checked ? Number(checked.value) : -1;

    if (!text) {
      showBoxAlert('quizFormAlert', 'error', `نص السؤال ${i + 1} فارغ.`);
      b.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (options.some((o) => !o)) {
      showBoxAlert('quizFormAlert', 'error', `يجب تعبئة خياراً الأربعة في السؤال ${i + 1}.`);
      b.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (correct_index < 0) {
      showBoxAlert('quizFormAlert', 'error', `حدّد الإجابة الصحيحة في السؤال ${i + 1}.`);
      b.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    questions.push({ text, options, correct_index, correct: correct_index });
  }

  const btn = document.getElementById('saveQuizBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';

  const body = { title, grade_group, description, questions };
  try {
    if (editingQuizId) {
      await api(`/api/admin/quizzes/${editingQuizId}`, { method: 'PUT', body });
      showBoxAlert('quizFormAlert', 'success', 'تم حفظ تعديلات الاختبار بنجاح.');
    } else {
      await api('/api/admin/quizzes', { method: 'POST', body });
      showBoxAlert('quizFormAlert', 'success', 'تم إنشاء الاختبار بنجاح!');
    }
    resetQuizForm();
    showBoxAlert('quizFormAlert', 'success', 'تم حفظ الاختبار بنجاح.');
    loadQuizzes();
  } catch (err) {
    if (guardAuth(err)) return;
    showBoxAlert('quizFormAlert', 'error', err.message || 'تعذّر حفظ الاختبار.');
  } finally {
    btn.disabled = false;
    btn.textContent = editingQuizId ? 'حفظ التعديلات' : originalText;
    if (!editingQuizId) btn.textContent = 'حفظ الاختبار';
  }
});

/* ================= الرسائل ================= */
async function loadMessages() {
  const box = document.getElementById('messagesList');
  try {
    const data = await api('/api/admin/messages');
    const messages = asArray(data, ['messages', 'items', 'data']);
    setText('messagesCount', `${messages.length} رسالة`);

    if (!messages.length) {
      box.innerHTML = '<p class="table-empty" style="color:var(--muted);">لا توجد رسائل واردة حالياً.</p>';
      return;
    }

    box.innerHTML = messages.map((m) => {
      const id = m.id;
      const status = pickString(m, ['status'], 'open');
      const responded = pickString(m, ['response'], '') || status === 'responded' || status === 'closed';
      const statusChip = responded
        ? '<span class="chip green">تم الردّ</span>'
        : '<span class="chip gold">بانتظار الردّ</span>';
      return `
        <article class="msg-card">
          <div class="msg-head">
            <div class="msg-from">
              <b>${escapeHtml(pickString(m, ['name'], 'مرسل'))}</b>
              <span dir="ltr">${escapeHtml(pickString(m, ['email'], ''))}</span>
              <span>· ${fmtDate(m.created_at || m.createdAt)}</span>
            </div>
            ${statusChip}
          </div>
          <div class="msg-body">${escapeHtml(pickString(m, ['message'], ''))}</div>
          ${m.response ? `<div class="msg-response"><b>ردّ المنصة:</b> ${escapeHtml(m.response)}</div>` : ''}
          <div class="respond-form">
            <textarea class="form-control resp-input" id="resp-${escapeHtml(id)}" placeholder="اكتب ردّك هنا...">${escapeHtml(pickString(m, ['response'], ''))}</textarea>
            <button class="btn btn-green btn-sm resp-btn" data-id="${escapeHtml(id)}">${m.response ? 'تحديث الردّ' : 'إرسال الردّ'}</button>
          </div>
        </article>`;
    }).join('');

    box.querySelectorAll('.resp-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const input = document.getElementById(`resp-${btn.dataset.id}`);
        const response = input.value.trim();
        if (!response) {
          input.focus();
          alert('يرجى كتابة نص الردّ أولاً.');
          return;
        }
        btn.disabled = true;
        btn.textContent = 'جارٍ الإرسال...';
        try {
          await api(`/api/admin/messages/${btn.dataset.id}/respond`, { method: 'POST', body: { response } });
          loadMessages();
        } catch (err) {
          if (guardAuth(err)) return;
          alert(err.message || 'تعذّر إرسال الردّ.');
          btn.disabled = false;
          btn.textContent = 'إرسال الردّ';
        }
      });
    });
  } catch (err) {
    if (guardAuth(err)) return;
    box.innerHTML = `<div class="alert alert-error show">${escapeHtml(err.message)}</div>`;
  }
}

/* ================= الخروج + الشريط الجانبي ================= */
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* نتابع */ }
  location.href = '/login?msg=loggedout';
});

const sideToggle = document.getElementById('sideToggle');
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sideBackdrop');
sideToggle?.addEventListener('click', () => {
  sidebar?.classList.toggle('open');
  backdrop?.classList.toggle('show');
});
backdrop?.addEventListener('click', () => {
  sidebar?.classList.remove('open');
  backdrop?.classList.remove('show');
});

/* ================= البدء ================= */
async function init() {
  try {
    await api('/api/admin/overview');
    document.getElementById('pageLoading').hidden = true;
    document.getElementById('pageContent').style.display = 'block';

    const hash = location.hash.replace('#', '');
    switchPanel(PANEL_META[hash] ? hash : 'overview');
  } catch (err) {
    if (guardAuth(err)) return;
    document.getElementById('pageLoading').innerHTML =
      `<div class="alert alert-error show" style="max-width:540px;">${escapeHtml(err.message)}</div>`;
  }
}
init();
