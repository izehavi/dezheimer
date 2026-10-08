// Account: sign in with an email and a password, to keep a backup of what the
// user added and get it back on another device.
//
// The backup is the whole of what the user added, saved as one document with a
// version number. A device saves after each change. If another device saved in
// the meantime, this device takes that newer document instead.
const Account = (() => {
  const SESSION_KEY = 'dezheimer.session';   // { token, email, version }
  const SAVE_AFTER_MS = 1500;

  let session = null;
  let message = '';
  let isError = false;
  let savedAt = null;
  let saveTimer;
  let refresh = () => {};       // redraws the current screen

  try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { /* not signed in */ }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const remember = () => {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* stays signed in until the page is closed */ }
  };

  const call = async (method, path, body) => {
    const res = await fetch(`/api/account/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  };

  const hasItems = (doc) => !!doc && Object.values(doc).some((list) => Array.isArray(list) && list.length);

  // Take the document another device saved.
  const takeServerCopy = ({ doc, version, updated }) => {
    session.version = version;
    savedAt = updated ? new Date(updated * 1000) : null;
    remember();
    if (doc) { SampleData.importAdded(doc); refresh(); }
  };

  const save = async () => {
    if (!session) return;
    const res = await call('PUT', 'data', { doc: SampleData.exportAdded(), base_version: session.version || 0 });
    if (res.ok) {
      session.version = res.data.version;
      savedAt = new Date(res.data.updated * 1000);
      remember();
    } else if (res.status === 409) {
      takeServerCopy(res.data);
      note('Another device had saved newer data. It was loaded here.');
    } else if (res.status === 401) {
      signedOut('Please sign in again.');
    }
    paint();
  };

  // On sign-in and when the app opens: get what is saved, or save what is here.
  const sync = async () => {
    const res = await call('GET', 'data');
    if (res.status === 401) { signedOut('Please sign in again.'); return; }
    if (!res.ok) return;
    if (res.data.version === (session.version || 0)) { savedAt = res.data.updated ? new Date(res.data.updated * 1000) : null; return; }
    if (hasItems(res.data.doc) || res.data.version > 0) takeServerCopy(res.data);
    else await save();
  };

  const note = (text, error = false) => { message = text; isError = error; };

  const signedOut = (text) => {
    session = null;
    remember();
    note(text, true);
    paint();
  };

  const enter = async (path, email, password) => {
    note('One moment…');
    paint();
    try {
      const hadLocal = hasItems(SampleData.exportAdded());
      const res = await call('POST', path, { email, password });
      if (!res.ok) { note(res.data.detail || 'That did not work. Try again.', true); paint(); return; }
      session = { token: res.data.token, email: res.data.email, version: 0 };
      remember();
      const saved = await call('GET', 'data');
      if (saved.ok && saved.data.version > 0) {
        takeServerCopy(saved.data);
        note(hadLocal
          ? 'You are signed in. The data saved in your account was loaded and replaced what was on this device.'
          : 'You are signed in. Your saved data was loaded.');
      } else {
        await save();
        note('You are signed in. What you add is now saved in your account.');
      }
    } catch {
      note('The Dezheimer server is not answering.', true);
    }
    paint();
  };

  // ---- Screen ----

  const view = () => `
    <a class="back" href="#/">← Back</a>
    <header class="page-head with-back">
      <h1>Account and backup</h1>
      <p class="sub">Sign in to keep a copy of what you add, and to find it again on another device.</p>
    </header>
    <div id="account"></div>`;

  const paint = () => {
    const box = document.getElementById('account');
    if (!box) return; // another screen is showing
    const status = message ? `<p class="listen-status${isError ? ' error' : ''}" role="status">${esc(message)}</p>` : '';

    box.innerHTML = session ? `
      <section>
        <div class="card">
          <p>Signed in as <strong>${esc(session.email)}</strong></p>
          <p class="source">${savedAt ? `Last saved on ${esc(Dates.long(savedAt))} at ${esc(Dates.time(savedAt))}` : 'Not saved yet'}</p>
        </div>
        ${status}
        <p class="account-actions page-action">
          <button class="button primary" type="button" data-do="save">Save now</button>
          <button class="button" type="button" data-do="signout">Sign out</button>
        </p>
      </section>` : `
      <form class="account-form" id="account-form">
        <label>Email <input type="email" name="email" autocomplete="username" required></label>
        <label>Password (8 characters or more)
          <input type="password" name="password" autocomplete="current-password" minlength="8" required></label>
        ${status}
        <div class="account-actions">
          <button class="button primary" type="submit" data-do="signin">Sign in</button>
          <button class="button" type="submit" data-do="signup">Create my account</button>
        </div>
      </form>`;
  };

  const mount = () => {
    const box = document.getElementById('account');
    box.addEventListener('click', async (e) => {
      const button = e.target.closest('[data-do]');
      if (!button) return;
      const action = button.dataset.do;
      if (action === 'save') { await save(); note('Saved.'); paint(); }
      if (action === 'signout') {
        await call('POST', 'signout').catch(() => {});
        session = null;
        remember();
        note('You are signed out. Your data stays on this device.');
        paint();
      }
      if (action === 'signin' || action === 'signup') {
        e.preventDefault();
        const form = document.getElementById('account-form');
        if (!form.reportValidity()) return;
        enter(action, form.email.value, form.password.value);
      }
    });
    paint();
  };

  // Called once when the app opens.
  const start = (redraw) => {
    refresh = redraw;
    SampleData.onChange(() => {
      if (!session) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => save().catch(() => {}), SAVE_AFTER_MS);
    });
    if (session && location.protocol !== 'file:') sync().then(paint).catch(() => {});
  };

  return { view, mount, start, signedIn: () => !!session };
})();
