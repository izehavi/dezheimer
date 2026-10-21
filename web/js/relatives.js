// Who uses this phone, and the links between the person and their relatives.
//
// The first time the app opens, it asks who uses this phone: the person with memory
// loss, or a relative who helps them. A relative's app is a different, small app:
// the people they help, and later the alerts when one of them is lost.
//
// To be linked, the person's app shows a code of 6 digits (on the Account screen),
// and the relative types it in their own app. Both need an account. A link says
// who is told when the person needs help.
const Relatives = (() => {
  const ROLE_KEY = 'dezheimer.role';   // 'person' or 'helper'

  let role = null;
  try { role = localStorage.getItem(ROLE_KEY); } catch { /* asked again next time */ }
  if (role !== 'person' && role !== 'helper') role = null;

  let links = null;          // { helpers: [{ id, name }], people: [{ id, name }] }, once loaded
  let code = null;           // { code, expires } shown to the person
  let message = '';
  let isError = false;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const setRole = (value) => {
    try {
      if (value) localStorage.setItem(ROLE_KEY, value); else localStorage.removeItem(ROLE_KEY);
    } catch { /* until the page is closed */ }
    role = value;
  };

  const note = (text, error = false) => { message = text; isError = error; };
  const status = () => (message ? `<p class="listen-status${isError ? ' error' : ''}" role="status">${esc(message)}</p>` : '');

  const load = async () => {
    if (!Account.signedIn()) { links = null; return; }
    const res = await Account.api('GET', 'links');
    if (res.ok) links = res.data;
  };

  // ---- The first screen: who uses this phone ----

  const chooseView = () => `
    <header class="page-head">
      <h1>Welcome to Dezheimer</h1>
      <p class="sub">Who will use this phone?</p>
    </header>
    <div class="roles">
      <button class="role-choice" type="button" data-role="person">
        <span class="role-icon" aria-hidden="true">🧠</span>
        <span class="role-title">Me</span>
        <span class="role-text">I want help with my memory.</span>
      </button>
      <button class="role-choice" type="button" data-role="helper">
        <span class="role-icon" aria-hidden="true">🤝</span>
        <span class="role-title">A relative</span>
        <span class="role-text">I help someone who has memory loss.</span>
      </button>
    </div>
    <p class="source">This can be changed later, under Account.</p>`;

  const mountChoose = () => {
    document.getElementById('screen').addEventListener('click', (e) => {
      const button = e.target.closest('[data-role]');
      if (!button) return;
      setRole(button.dataset.role);
      location.hash = '#/';
      location.reload();
    });
  };

  // ---- The relative's app ----

  const helperHome = () => `
    <header class="hello">
      <p class="hello-date">Dezheimer, for relatives</p>
      <h1>The people you help</h1>
    </header>
    <div id="relatives"></div>
    <p class="page-action account-link"><a href="#/account">Account, and who uses this phone</a></p>`;

  const peopleList = () => {
    if (!links) return '<p class="empty">Loading…</p>';
    if (!links.people.length) return '<p class="empty">You are not linked to anyone yet.</p>';
    return links.people.map((p) => `
      <article class="card helped">
        <h3>${esc(p.name)}</h3>
        <p class="source">Linked. You will be told here if ${esc(p.name)} gets lost.</p>
        <button class="link-button" type="button" data-unlink="${p.id}" data-name="${esc(p.name)}">Remove this link</button>
      </article>`).join('');
  };

  const joinForm = () => `
    <section>
      <h2>Link with someone</h2>
      <p>On their phone, open <strong>Account</strong> and press <strong>Link a relative</strong>. A code of 6 digits appears. Type it here.</p>
      <form class="account-form" id="join-form">
        <label>The code on their phone
          <input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required></label>
        <label>Your name, as they know you
          <input name="name" autocomplete="given-name" maxlength="40" required></label>
        ${status()}
        <div class="account-actions"><button class="button primary" type="submit">Link</button></div>
      </form>
    </section>`;

  const paintHelper = () => {
    const box = document.getElementById('relatives');
    if (!box) return;
    box.innerHTML = Account.signedIn() ? `<section>${peopleList()}</section>${joinForm()}` : `
      <section>
        <div class="card">
          <p>To be linked with someone, you need an account.</p>
        </div>
        <p class="page-action"><a class="button primary" href="#/account">Sign in or create my account</a></p>
      </section>`;
  };

  // ---- On the Account screen ----

  const accountView = () => `<div id="relatives"></div>`;

  const helpersList = () => {
    if (!links) return '';
    if (!links.helpers.length) return '<p class="empty">No relative is linked yet.</p>';
    return links.helpers.map((h) => `
      <div class="card helped">
        <p><strong>${esc(h.name)}</strong></p>
        <button class="link-button" type="button" data-unlink="${h.id}" data-name="${esc(h.name)}">Remove this link</button>
      </div>`).join('');
  };

  const codeCard = () => (code ? `
    <div class="card invite">
      <p>On the phone of your relative, in Dezheimer, type this code:</p>
      <p class="invite-code">${esc(code.code.slice(0, 3))} ${esc(code.code.slice(3))}</p>
      <p class="source">It works once, until ${esc(Dates.time(new Date(code.expires * 1000)))}.</p>
    </div>` : '');

  const paintAccount = () => {
    const box = document.getElementById('relatives');
    if (!box) return;
    const linked = role === 'person' && Account.signedIn() ? `
      <section>
        <h2>My relatives</h2>
        <p class="sub">They are told if you get lost.</p>
        ${helpersList()}
        ${codeCard()}
        ${status()}
        <p class="page-action"><button class="button primary" type="button" data-rel="invite">Link a relative</button></p>
      </section>` : '';
    box.innerHTML = `${linked}
      <section>
        <h2>Who uses this phone</h2>
        <div class="card">
          <p>${role === 'helper' ? 'A relative, who helps someone with memory loss.' : 'The person who wants help with their memory.'}</p>
        </div>
        <p class="page-action"><button class="button" type="button" data-rel="role">Change</button></p>
      </section>`;
  };

  let draw = () => {};       // paints the box of the screen showing: the relative's home, or the Account screen

  const refresh = async () => {
    try { await load(); } catch { note('The Dezheimer server is not answering.', true); }
    draw();
  };

  // Signing in or out on the Account screen changes what is shown here.
  window.addEventListener('dezheimer-account', () => { code = null; refresh(); });

  const mount = () => {
    const box = document.getElementById('relatives');
    if (!box) return;
    // On the relative's home screen the box shows the people; on the Account screen, the links.
    const onHome = !location.hash.replace(/^#\/?/, '');
    draw = onHome ? paintHelper : paintAccount;

    box.addEventListener('click', async (e) => {
      const unlink = e.target.closest('[data-unlink]');
      if (unlink) {
        if (!confirm(`Remove the link with ${unlink.dataset.name}?`)) return;
        await Account.api('DELETE', `links/${unlink.dataset.unlink}`).catch(() => {});
        await load().catch(() => {});
        draw();
        return;
      }
      const button = e.target.closest('[data-rel]');
      if (!button) return;
      if (button.dataset.rel === 'invite') {
        note('');
        const name = SampleData.user.name;
        const res = await Account.api('POST', 'links/invite', { name }).catch(() => null);
        if (res && res.ok) code = res.data;
        else note((res && res.data.detail) || 'The Dezheimer server is not answering.', true);
        draw();
      }
      if (button.dataset.rel === 'role') {
        if (!confirm('Change who uses this phone? The app will start again.')) return;
        setRole(null);
        location.hash = '#/';
        location.reload();
      }
    });

    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      note('One moment…');
      draw();
      const res = await Account.api('POST', 'links/join', { code: form.code.value, name: form.name.value }).catch(() => null);
      if (res && res.ok) {
        note(`You are now linked with ${res.data.name}.`);
        await load().catch(() => {});
      } else {
        note((res && res.data.detail) || 'The Dezheimer server is not answering.', true);
      }
      draw();
      // Keep what was typed when it did not work.
      if (!(res && res.ok)) {
        const again = document.getElementById('join-form');
        if (again) { again.code.value = form.code.value; again.name.value = form.name.value; }
      }
    });

    // A code is only shown just after it is asked for: once used, it means nothing.
    code = null;
    note('');
    draw();
    refresh();
  };

  return { role: () => role, chooseView, mountChoose, helperHome, accountView, mount };
})();
