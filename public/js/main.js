/* ============================================================
   منصة دستور — سلوكيات الصفحة الرئيسية (main.js)
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
  try { data = await res.json(); } catch (_) { /* استجابة بدون JSON */ }
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || 'حدث خطأ غير متوقع، حاول مرة أخرى.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function pickNumber(obj, keys, fallback = 0) {
  if (!obj || typeof obj !== 'object') return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '' && !isNaN(Number(v))) return Number(v);
  }
  return fallback;
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

/* تحويل بيانات التوزيع (مصفوفة أو كائن) إلى قائمة مدخلات */
function toEntries(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item, i) => {
      if (typeof item === 'object' && item !== null) {
        const key = item.grade_group ?? item.group ?? item.key ?? item.grade ?? item.label ?? item.name ?? i;
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

function orderEntries(entries, order) {
  if (!order) return entries;
  const idx = (k) => {
    const i = order.findIndex((o) => String(o) === String(k));
    return i === -1 ? 999 : i;
  };
  return [...entries].sort((a, b) => idx(a.key) - idx(b.key));
}

/* ---------------- Navbar: شفاف → أبيض عند التمرير ---------------- */
const siteNav = document.getElementById('siteNav');
function onNavScroll() {
  if (!siteNav) return;
  siteNav.classList.toggle('scrolled', window.scrollY > 24);
}
window.addEventListener('scroll', onNavScroll, { passive: true });
onNavScroll();

const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');
if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => navMenu.classList.toggle('open'));
  navMenu.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => navMenu.classList.remove('open'))
  );
}

/* ---------------- تمرير سلس للروابط الداخلية ---------------- */
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href');
    if (!id || id === '#') return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', id);
  });
});

/* ---------------- Fade-in عند التمرير ---------------- */
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  revealEls.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`;
    io.observe(el);
  });
} else {
  revealEls.forEach((el) => el.classList.add('visible'));
}

/* ---------------- عدّادات متحركة ---------------- */
function animateCounter(el, target, suffix = '', duration = 1600) {
  const decimals = Number.isInteger(target) ? 0 : 1;
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const current = target * eased;
    el.textContent = current.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, '٬') + suffix;
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = target.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, '٬') + suffix;
  }
  requestAnimationFrame(tick);
}

function runCounter(el, value) {
  const suffix = el.dataset.suffix || '';
  animateCounter(el, value, suffix);
}

/* ---------------- جلب الإحصائيات العامة ---------------- */
async function loadPublicStats() {
  try {
    const data = (await api('/api/stats/public')) || {};

    const students = pickNumber(data, ['students', 'totalStudents', 'users', 'studentCount', 'usersCount']);
    const quizzes = pickNumber(data, ['quizzes', 'totalQuizzes', 'quizCount']);
    const results = pickNumber(data, ['results', 'totalResults', 'resultCount', 'attempts']);
    const average = pickNumber(data, ['average', 'avg', 'averageScore', 'averageRate', 'avgScore', 'mean']);

    runCounter(document.getElementById('statStudents'), students);
    runCounter(document.getElementById('statQuizzes'), quizzes);
    runCounter(document.getElementById('statResults'), results);
    runCounter(document.getElementById('statAverage'), average);

    /* توزيع الطلاب على المستويات */
    const studentsRaw =
      deepGet(data, [
        'studentsByGrade', 'students_by_grade', 'studentsByGroup', 'gradeDistribution',
        'byGrade', 'byGroup', 'distribution.students', 'charts.studentsByGrade',
      ]) ?? deepGet(data, ['distribution', 'students']);

    /* توزيع الاختبارات */
    const quizzesRaw =
      deepGet(data, [
        'quizzesByGrade', 'quizzes_by_grade', 'quizzesByGroup', 'quizDistribution',
        'byQuizGroup', 'byQuizzes', 'distribution.quizzes', 'charts.quizzesByGrade',
      ]) ?? deepGet(data, ['quizzesDistribution']);

    renderLevelsChart(orderEntries(toEntries(studentsRaw), GRADE_ORDER));
    renderQuizzesChart(orderEntries(toEntries(quizzesRaw), GRADE_ORDER));
  } catch (err) {
    console.error('تعذّر جلب الإحصائيات:', err.message);
    const fallback = [
      { key: 'students', value: '—' }, { key: 'quizzes', value: '—' },
      { key: 'results', value: '—' }, { key: 'average', value: '—' },
    ];
    fallback.forEach((f) => {
      const el = document.getElementById(`stat${f.key[0].toUpperCase()}${f.key.slice(1)}`);
      if (el) el.textContent = '—';
    });
  }
}

/* ---------------- الرسوم البيانية للرئيسية ---------------- */
const CHART_FONT = { family: 'Tajawal', size: 13 };
const AXIS = { grid: { color: '#EEF1F8' }, ticks: { color: '#6B7280', font: CHART_FONT } };

function showChartEmpty(canvasId, emptyId, show) {
  const canvas = document.getElementById(canvasId);
  const empty = document.getElementById(emptyId);
  if (canvas) canvas.style.display = show ? 'none' : 'block';
  if (empty) empty.style.display = show ? 'flex' : 'none';
}

let levelsChartInstance = null;
function renderLevelsChart(entries) {
  const hasData = entries.length > 0 && entries.some((e) => e.count > 0);
  showChartEmpty('levelsChart', 'levelsChartEmpty', !hasData);
  if (!hasData || typeof Chart === 'undefined') return;

  const ctx = document.getElementById('levelsChart');
  levelsChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map((e) => GRADE_LABELS[e.key] || e.key),
      datasets: [{
        label: 'عدد الطلاب',
        data: entries.map((e) => e.count),
        backgroundColor: (c) => {
          const g = c.chart.ctx.createLinearGradient(0, 0, 0, 300);
          g.addColorStop(0, '#4C6EF5');
          g.addColorStop(1, '#3B5BDB');
          return g;
        },
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 52,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { rtl: true, textDirection: 'rtl', titleFont: CHART_FONT, bodyFont: CHART_FONT },
      },
      scales: { y: { ...AXIS, beginAtZero: true, ticks: { ...AXIS.ticks, precision: 0 } }, x: AXIS },
      animation: { duration: 1200, easing: 'easeOutQuart' },
    },
  });
}

let quizzesChartInstance = null;
function renderQuizzesChart(entries) {
  const hasData = entries.length > 0 && entries.some((e) => e.count > 0);
  showChartEmpty('quizzesChart', 'quizzesChartEmpty', !hasData);
  if (!hasData || typeof Chart === 'undefined') return;

  const ctx = document.getElementById('quizzesChart');
  const palette = ['#3B5BDB', '#4C6EF5', '#F59E0B', '#10B981', '#845EF7', '#0EA5E9'];
  quizzesChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map((e) => GRADE_LABELS[e.key] || e.key),
      datasets: [{
        data: entries.map((e) => e.count),
        backgroundColor: entries.map((_, i) => palette[i % palette.length]),
        borderColor: '#FFFFFF',
        borderWidth: 3,
        hoverOffset: 10,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', rtl: true, labels: { color: '#1F2937', font: CHART_FONT, usePointStyle: true, padding: 16 } },
        tooltip: { rtl: true, textDirection: 'rtl', titleFont: CHART_FONT, bodyFont: CHART_FONT },
      },
      animation: { duration: 1200, easing: 'easeOutQuart' },
    },
  });
}

/* ---------------- نموذج التواصل ---------------- */
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  const alertBox = document.getElementById('contactAlert');
  const submitBtn = document.getElementById('contactSubmit');

  function showContactAlert(type, msg) {
    if (!alertBox) return;
    alertBox.className = `alert alert-${type} show`;
    alertBox.textContent = msg;
  }

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    const message = document.getElementById('contactMessage').value.trim();

    if (!name || !email || !message) {
      showContactAlert('error', 'يرجى تعبئة جميع الحقول قبل الإرسال.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showContactAlert('error', 'يرجى إدخال بريد إلكتروني صحيح.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'جارٍ الإرسال...';
    try {
      await api('/api/contact', { method: 'POST', body: { name, email, message } });
      showContactAlert('success', 'تم إرسال رسالتك بنجاح، سنردّ عليك قريباً. شكراً لتواصلك مع دستور!');
      contactForm.reset();
    } catch (err) {
      showContactAlert('error', err.message || 'تعذّر إرسال الرسالة، حاول مرة أخرى.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'إرسال الرسالة';
    }
  });
}

/* ---------------- تذييل: سنة جارية ---------------- */
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------------- بدء التحميل ---------------- */
let statsLoaded = false;
function initHome() {
  if (statsLoaded) return;
  statsLoaded = true;
  loadPublicStats();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHome);
} else {
  initHome();
}
