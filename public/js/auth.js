/* ============================================================
   منصة دستور — سلوكيات تسجيل الدخول / إنشاء الحساب (auth.js)
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
  try { data = await res.json(); } catch (_) { /* استجابة بدون JSON */ }
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || 'تعذّر إتمام العملية، حاول مرة أخرى.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const errorBox = document.getElementById('formError');
const infoBox = document.getElementById('formInfo');
const submitBtn = document.getElementById('submitBtn');

function showError(msg) {
  if (!errorBox) return;
  if (msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('show');
  } else {
    errorBox.textContent = '';
    errorBox.classList.remove('show');
  }
}

function showInfo(msg) {
  if (!infoBox) return;
  if (msg) {
    infoBox.textContent = msg;
    infoBox.classList.add('show');
  } else {
    infoBox.textContent = '';
    infoBox.classList.remove('show');
  }
}

function setBusy(busy, busyText) {
  if (!submitBtn) return;
  submitBtn.disabled = busy;
  if (busy) submitBtn.textContent = busyText;
}

function extractUser(data) {
  if (!data || typeof data !== 'object') return null;
  return data.user || data.data?.user || data.data || (data.role ? data : null);
}

function validEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/* ---------------- تسجيل الدخول ---------------- */
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const cameFromLogout = new URLSearchParams(location.search).get('msg');
  if (cameFromLogout === 'loggedout') showInfo('تم تسجيل خروجك بنجاح.');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
      showError('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }
    if (!validEmail(email)) {
      showError('يرجى إدخال بريد إلكتروني صحيح.');
      return;
    }

    setBusy(true, 'جارٍ تسجيل الدخول...');
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      const user = extractUser(data);
      const role = user && user.role ? user.role : 'student';
      location.href = role === 'admin' ? '/admin' : '/dashboard';
    } catch (err) {
      showError(err.message);
      setBusy(false, 'تسجيل الدخول');
    }
  });
}

/* ---------------- إنشاء حساب ---------------- */
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const grade = document.getElementById('grade').value;

    if (!name || !email || !password || !grade) {
      showError('يرجى تعبئة جميع الحقول المطلوبة.');
      return;
    }
    if (!validEmail(email)) {
      showError('يرجى إدخال بريد إلكتروني صحيح.');
      return;
    }
    if (password.length < 6) {
      showError('يجب أن تكون كلمة المرور ٦ خانات على الأقل.');
      return;
    }

    setBusy(true, 'جارٍ إنشاء الحساب...');
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: { name, email, password, grade: Number(grade) },
      });
      location.href = '/dashboard';
    } catch (err) {
      showError(err.message);
      setBusy(false, 'إنشاء الحساب');
    }
  });
}
