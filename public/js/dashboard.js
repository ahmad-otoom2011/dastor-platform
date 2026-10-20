/* ============================================================
   منصة دستور — لوحة الطالب (dashboard.js)
   ============================================================ */

const GRADE_LABELS = {
  1: 'الصف الأول', 2: 'الصف الثاني', 3: 'الصف الثالث', 4: 'الصف الرابع',
  5: 'الصف الخامس', 6: 'الصف السادس', 7: 'الصف السابع', 8: 'الصف الثامن',
  9: 'الصف التاسع', 10: 'الصف العاشر',
};

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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric' });
}

function percentOf(item) {
  const direct = pickNumber(item, ['percentage', 'percent', 'rate', 'score_percent', 'percentScore']);
  if (direct !== null) return Math.max(0, Math.min(100, direct));
  const score = pickNumber(item, ['score', 'correct', 'grade'], 0);
  const total = pickNumber(item, ['total', 'max_score', 'questions'], 0);
  if (total > 0) return Math.round((score / total) * 1000) / 10;
  return 0;
}

function scoreClass(pct) {
  if (pct >= 75) return 'good';
  if (pct >= 60) return 'mid';
  return 'bad';
}

/* ============================================================ */
function showPageError(msg) {
  const loading = document.getElementById('pageLoading');
  if (loading) loading.innerHTML = `<div class="alert alert-error show" style="max-width:520px;margin:60px auto;">${escapeHtml(msg)}</div>`;
}

function showContent() {
  const loading = document.getElementById('pageLoading');
  const content = document.getElementById('pageContent');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';
}

/* ---------------- المستخدم ---------------- */
async function loadUser() {
  const data = await api('/api/auth/me');
  const user = data && (data.user || data.data?.user || (data.role ? data : null));
  if (!user) throw Object.assign(new Error('الجلسة منتهية، يرجى تسجيل الدخول مجدداً.'), { status: 401 });

  const nameEl = document.getElementById('welcomeName');
  if (nameEl) nameEl.textContent = `مرحباً، ${user.name || 'طالبنا العزيز'} 👋`;

  const badge = document.getElementById('gradeBadgeText');
  const g = Number(user.grade);
  if (badge) badge.textContent = GRADE_LABELS[g] || (user.grade ? `الصف ${user.grade}` : 'غير محدد');

  return user;
}

/* ---------------- الإحصائيات الشخصية ---------------- */
async function loadMyStats() {
  try {
    const data = (await api('/api/stats/me')) || {};
    const total = pickNumber(data, ['total', 'totalQuizzes', 'count', 'attempts', 'quizzes']);
    const avg = pickNumber(data, ['average', 'avg', 'averageScore', 'averagePercent', 'avgScore', 'mean']);
    const best = pickNumber(data, ['best', 'bestScore', 'highest', 'max', 'topScore']);
    const pass = pickNumber(data, ['passRate', 'pass', 'successRate', 'passPercent', 'success']);

    setText('statTotal', total !== null ? total : '—');
    setText('statAvg', avg !== null ? Math.round(avg * 10) / 10 : '—');
    setText('statBest', best !== null ? Math.round(best * 10) / 10 : '—');
    setText('statPass', pass !== null ? Math.round(pass * 10) / 10 : '—');
  } catch (err) {
    if (err.status === 401 || err.status === 403) throw err;
    console.error('تعذّر جلب الإحصائيات:', err.message);
    ['statTotal', 'statAvg', 'statBest', 'statPass'].forEach((id) => setText(id, '—'));
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ---------------- الاختبارات المتاحة ---------------- */
async function loadQuizzes() {
  const box = document.getElementById('quizList');
  try {
    const data = await api('/api/quizzes');
    const quizzes = asArray(data, ['quizzes', 'items', 'data']);
    if (!quizzes.length) {
      box.innerHTML = '<p class="table-empty" style="grid-column:1/-1;color:var(--muted);">لا توجد اختبارات متاحة لمجموعتك حالياً — عدّنا قريباً!</p>';
      return;
    }
    box.innerHTML = quizzes.map((q) => {
      const id = q.id ?? q.quiz_id;
      const title = escapeHtml(pickString(q, ['title', 'name'], 'اختبار'));
      const desc = escapeHtml(pickString(q, ['description', 'desc'], 'لا يوجد وصف متاح لهذا الاختبار.'));
      const qCount = pickNumber(q, ['question_count', 'questions_count', 'count']);
      const meta = [];
      if (qCount !== null) meta.push(`<span class="chip">${qCount} أسئلة</span>`);
      const level = pickString(q, ['grade_group', 'group', 'level']);
      if (level) meta.push(`<span class="chip gold">${escapeHtml(GRADE_GROUP_LABELS[level] || level)}</span>`);
      return `
        <article class="quiz-item">
          <div class="quiz-meta">${meta.join('')}</div>
          <h3>${title}</h3>
          <p>${desc}</p>
          <button class="btn btn-primary btn-sm" data-quiz-id="${escapeHtml(id)}">ابدأ الاختبار</button>
        </article>`;
    }).join('');

    box.querySelectorAll('[data-quiz-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        location.href = `/quiz/${btn.dataset.quizId}`;
      });
    });
  } catch (err) {
    if (err.status === 401 || err.status === 403) throw err;
    box.innerHTML = `<div class="alert alert-error show">${escapeHtml(err.message)}</div>`;
  }
}

const GRADE_GROUP_LABELS = {
  '1-2': 'الصف الأول والثاني',
  '3-4': 'الصف الثالث والرابع',
  '5-6': 'الصف الخامس والسادس',
  '7-8': 'الصف السابع والثامن',
  '9': 'الصف التاسع',
  '10': 'الصف العاشر',
};

/* ---------------- النتائج + الرسوم البيانية ---------------- */
let resultsCache = [];

async function loadResults() {
  const tbody = document.getElementById('resultsBody');
  try {
    const data = await api('/api/quizzes/results/mine');
    resultsCache = asArray(data, ['results', 'items', 'data']);

    if (!resultsCache.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">لم تُنجز أي اختبار بعد — ابدأ الآن من قائمة الاختبارات أعلاه.</td></tr>';
      showEmpty('perfChart', 'perfChartEmpty', true);
      showEmpty('distChart', 'distChartEmpty', true);
      return;
    }

    tbody.innerHTML = resultsCache.map((r, i) => {
      const title = escapeHtml(pickString(r, ['title', 'quiz_title', 'quizTitle', 'name'], `اختبار #${r.quiz_id ?? i + 1}`));
      const score = pickNumber(r, ['score', 'correct'], 0);
      const total = pickNumber(r, ['total', 'max_score'], 0);
      const pct = percentOf(r);
      const date = fmtDate(r.created_at || r.createdAt || r.date);
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${title}</td>
          <td><b>${score} / ${total}</b></td>
          <td><span class="score-pill ${scoreClass(pct)}">${pct}٪</span></td>
          <td>${date}</td>
        </tr>`;
    }).join('');

    renderPerfChart(resultsCache);
    renderDistChart(resultsCache);
  } catch (err) {
    if (err.status === 401 || err.status === 403) throw err;
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">${escapeHtml(err.message)}</td></tr>`;
  }
}

const CHART_FONT = { family: 'Tajawal', size: 13 };

function showEmpty(canvasId, emptyId, show) {
  const canvas = document.getElementById(canvasId);
  const empty = document.getElementById(emptyId);
  if (canvas) canvas.style.display = show ? 'none' : 'block';
  if (empty) empty.style.display = show ? 'flex' : 'none';
}

function renderPerfChart(results) {
  if (typeof Chart === 'undefined') return;
  showEmpty('perfChart', 'perfChartEmpty', false);
  const labels = results.map((r, i) => {
    const t = pickString(r, ['title', 'quiz_title', 'quizTitle'], `اختبار ${i + 1}`);
    return t.length > 16 ? t.slice(0, 16) + '…' : t;
  });
  const values = results.map(percentOf);

  new Chart(document.getElementById('perfChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'النسبة (٪)',
        data: values,
        borderColor: '#3B5BDB',
        backgroundColor: (c) => {
          const g = c.chart.ctx.createLinearGradient(0, 0, 0, 280);
          g.addColorStop(0, 'rgba(76,110,245,.30)');
          g.addColorStop(1, 'rgba(76,110,245,0)');
          return g;
        },
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#F59E0B',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { rtl: true, textDirection: 'rtl', titleFont: CHART_FONT, bodyFont: CHART_FONT, callbacks: { label: (c) => ` ${c.parsed.y}٪` } },
      },
      scales: {
        y: { min: 0, max: 100, grid: { color: '#EEF1F8' }, ticks: { color: '#6B7280', font: CHART_FONT, callback: (v) => v + '٪' } },
        x: { grid: { display: false }, ticks: { color: '#6B7280', font: CHART_FONT } },
      },
      animation: { duration: 1100, easing: 'easeOutQuart' },
    },
  });
}

function renderDistChart(results) {
  if (typeof Chart === 'undefined') return;
  const buckets = [
    { label: 'ممتاز (٩٠ – ١٠٠)', color: '#10B981', count: 0 },
    { label: 'جيد (٧٥ – ٨٩)', color: '#4C6EF5', count: 0 },
    { label: 'مقبول (٦٠ – ٧٤)', color: '#F59E0B', count: 0 },
    { label: 'ضعيف (أقل من ٦٠)', color: '#EF4444', count: 0 },
  ];
  results.forEach((r) => {
    const p = percentOf(r);
    if (p >= 90) buckets[0].count++;
    else if (p >= 75) buckets[1].count++;
    else if (p >= 60) buckets[2].count++;
    else buckets[3].count++;
  });
  const active = buckets.filter((b) => b.count > 0);
  showEmpty('distChart', 'distChartEmpty', active.length === 0);
  if (!active.length) return;

  new Chart(document.getElementById('distChart'), {
    type: 'doughnut',
    data: {
      labels: active.map((b) => b.label),
      datasets: [{ data: active.map((b) => b.count), backgroundColor: active.map((b) => b.color), borderColor: '#fff', borderWidth: 3, hoverOffset: 10 }],
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

/* ---------------- الخروج ---------------- */
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* نتابع للخروج مهما حدث */ }
    location.href = '/login?msg=loggedout';
  });
}

/* ---------------- Sidebar للموبايل ---------------- */
const sideToggle = document.getElementById('sideToggle');
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sideBackdrop');
function closeSidebar() {
  sidebar?.classList.remove('open');
  backdrop?.classList.remove('show');
}
sideToggle?.addEventListener('click', () => {
  sidebar?.classList.toggle('open');
  backdrop?.classList.toggle('show');
});
backdrop?.addEventListener('click', closeSidebar);
document.querySelectorAll('#sideNav a').forEach((a) => a.addEventListener('click', () => {
  document.querySelectorAll('#sideNav a').forEach((x) => x.classList.remove('active'));
  a.classList.add('active');
  closeSidebar();
}));

/* ---------------- البدء ---------------- */
async function init() {
  try {
    await loadUser();
    showContent();
    await Promise.all([
      loadMyStats().catch((e) => { if (e.status === 401 || e.status === 403) throw e; }),
      loadQuizzes(),
      loadResults(),
    ]);
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      location.href = '/login';
      return;
    }
    showPageError(err.message || 'تعذّر تحميل لوحة التحكم، حاول تحديث الصفحة.');
  }
}
init();
