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

  // Signed in or out: the links with relatives (relatives.js) are shown again.
  const announce = () => window.dispatchEvent(new Event('dezheimer-account'));

  const call = async (method, path, body) => {
    const res = await fetch(`/api/account/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Language': I18n.lang,
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
      note(tr('Another device had saved newer data. It was loaded here.', 'Un autre appareil avait enregistré des données plus récentes. Elles ont été chargées ici.'));
    } else if (res.status === 401) {
      signedOut(tr('Please sign in again.', 'Reconnectez-vous, s’il vous plaît.'));
    }
    paint();
  };

  // On sign-in and when the app opens: get what is saved, or save what is here.
  const sync = async () => {
    const res = await call('GET', 'data');
    if (res.status === 401) { signedOut(tr('Please sign in again.', 'Reconnectez-vous, s’il vous plaît.')); return; }
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
    announce();
  };

  const enter = async (path, email, password) => {
    note(tr('One moment…', 'Un instant…'));
    paint();
    try {
      const hadLocal = hasItems(SampleData.exportAdded());
      const res = await call('POST', path, { email, password });
      if (!res.ok) { note(res.data.detail || tr('That did not work. Try again.', 'Ça n’a pas marché. Réessayez.'), true); paint(); return; }
      session = { token: res.data.token, email: res.data.email, version: 0 };
      remember();
      const saved = await call('GET', 'data');
      if (saved.ok && saved.data.version > 0) {
        takeServerCopy(saved.data);
        note(hadLocal
          ? tr('You are signed in. The data saved in your account was loaded and replaced what was on this device.',
            'Vous êtes connecté·e. Les données de votre compte ont été chargées et ont remplacé celles de cet appareil.')
          : tr('You are signed in. Your saved data was loaded.', 'Vous êtes connecté·e. Vos données ont été chargées.'));
      } else {
        await save();
        note(tr('You are signed in. What you add is now saved in your account.', 'Vous êtes connecté·e. Ce que vous ajoutez est maintenant enregistré dans votre compte.'));
      }
    } catch {
      note(tr('The Near server is not answering.', 'Le serveur de Near ne répond pas.'), true);
    }
    paint();
    announce();
  };

  // ---- Screen ----

  const view = () => `
    <a class="back" href="#/">← ${tr('Back', 'Retour')}</a>
    <header class="page-head with-back">
      <h1>${tr('Account and backup', 'Compte et sauvegarde')}</h1>
      <p class="sub">${Relatives.role() === 'helper'
        ? tr('Sign in to be linked with the people you help.', 'Connectez-vous pour être lié·e aux personnes que vous aidez.')
        : tr('Sign in to keep a copy of what you add, and to find it again on another device.', 'Connectez-vous pour garder une copie de ce que vous ajoutez, et la retrouver sur un autre appareil.')}</p>
    </header>
    <div id="account"></div>
    ${Relatives.accountView()}`;

  const paint = () => {
    const box = document.getElementById('account');
    if (!box) return; // another screen is showing
    const status = message ? `<p class="listen-status${isError ? ' error' : ''}" role="status">${esc(message)}</p>` : '';

    box.innerHTML = session ? `
      <section>
        <div class="card">
          <p>${tr('Signed in as', 'Connecté·e en tant que')} <strong>${esc(session.email)}</strong></p>
          <p class="source">${savedAt ? tr(`Last saved on ${esc(Dates.long(savedAt))} at ${esc(Dates.time(savedAt))}`, `Dernière sauvegarde le ${esc(Dates.long(savedAt).toLowerCase())} à ${esc(Dates.time(savedAt))}`) : tr('Not saved yet', 'Pas encore sauvegardé')}</p>
        </div>
        ${status}
        <p class="account-actions page-action">
          <button class="button primary" type="button" data-do="save">${tr('Save now', 'Sauvegarder maintenant')}</button>
          <button class="button" type="button" data-do="signout">${tr('Sign out', 'Me déconnecter')}</button>
        </p>
      </section>` : `
      <form class="account-form" id="account-form">
        <label>${tr('Email', 'E-mail')} <input type="email" name="email" autocomplete="username" required></label>
        <label>${tr('Password (8 characters or more)', 'Mot de passe (8 caractères ou plus)')}
          <input type="password" name="password" autocomplete="current-password" minlength="8" required></label>
        ${status}
        <div class="account-actions">
          <button class="button primary" type="submit" data-do="signin">${tr('Sign in', 'Me connecter')}</button>
          <button class="button" type="submit" data-do="signup">${tr('Create my account', 'Créer mon compte')}</button>
        </div>
      </form>`;
    // A relative's phone shows no data of its own.
    if (Relatives.role() !== 'helper') box.insertAdjacentHTML('beforeend', profileCard());
  };

  // Whose data the app shows: the example user, or the person who uses this device.
  const profileCard = () => {
    const own = SampleData.profile();
    return own ? `
      <section class="profile">
        <h2>${tr('Whose data', 'Les données de qui')}</h2>
        <div class="card">
          <p>${tr(`This app holds the data of <strong>${esc(own.name)}</strong>: only what you add.`, `Cette application contient les données de <strong>${esc(own.name)}</strong> : seulement ce que vous ajoutez.`)}</p>
          <p class="source">${tr('Going back to the example keeps your data on this device. It comes back when you return.', 'Revenir à l’exemple garde vos données sur cet appareil. Elles reviennent quand vous revenez.')}</p>
        </div>
        <p class="account-actions page-action">
          <button class="button" type="button" data-do="example">${tr('See the example (Helen)', 'Voir l’exemple (Hélène)')}</button>
        </p>
      </section>` : `
      <section class="profile">
        <h2>${tr('Whose data', 'Les données de qui')}</h2>
        <div class="card">
          <p>${tr('The app shows an example: Helen, her family and her week.', 'L’application montre un exemple : Hélène, sa famille et sa semaine.')}</p>
          <p class="source">${tr('To use it for yourself, start with your own data. The app is then empty, and holds only what you add.', 'Pour l’utiliser pour vous, commencez avec vos propres données. L’application est alors vide, et ne contient que ce que vous ajoutez.')}</p>
        </div>
        <div class="account-form">
          <label>${tr('Your first name', 'Votre prénom')} <input type="text" id="profile-name" autocomplete="given-name" maxlength="40"></label>
          <div class="account-actions">
            <button class="button primary" type="button" data-do="own">${tr('Start with my own data', 'Commencer avec mes propres données')}</button>
          </div>
        </div>
      </section>`;
  };

  const mount = () => {
    const box = document.getElementById('account');
    box.addEventListener('click', async (e) => {
      const button = e.target.closest('[data-do]');
      if (!button) return;
      const action = button.dataset.do;
      if (action === 'own' || action === 'example') {
        const field = document.getElementById('profile-name');
        const name = action === 'own' ? field.value.trim() : null;
        if (action === 'own' && !name) { field.focus(); return; }
        if (SampleData.setProfile(name)) { location.hash = '#/'; location.reload(); }
        else { note(tr('This browser could not keep the choice.', 'Ce navigateur n’a pas pu garder ce choix.'), true); paint(); }
        return;
      }
      if (action === 'save') { await save(); note(tr('Saved.', 'Sauvegardé.')); paint(); }
      if (action === 'signout') {
        await call('POST', 'signout').catch(() => {});
        session = null;
        remember();
        note(tr('You are signed out. Your data stays on this device.', 'Vous êtes déconnecté·e. Vos données restent sur cet appareil.'));
        paint();
        announce();
      }
      if (action === 'signin' || action === 'signup') {
        e.preventDefault();
        const form = document.getElementById('account-form');
        if (!form.reportValidity()) return;
        enter(action, form.email.value, form.password.value);
      }
    });
    paint();
    Relatives.mount();
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

  // `path` under /api/account/. Used by relatives.js for the links.
  const api = (method, path, body) => call(method, path, body);

  return { view, mount, start, api, signedIn: () => !!session };
})();
