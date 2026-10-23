// Who uses this phone, and the links between the person and their relatives.
//
// The first time the app opens, it asks who uses this phone: the person with memory
// loss, or a relative who helps them. A relative's app is a different, small app:
// the people they help, and the alerts when one of them seems lost (alerts.js).
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
  let alerts = [];           // on a relative's phone: the alerts of the last day, the latest first
  let days = [];             // on a relative's phone: the things of today of each person (server/routine.py)
  let notifications = null;  // on a relative's phone: 'on', 'off', 'denied', 'unsupported' or 'error'
  const CHECK_EVERY_MS = 30000;
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
  const NO_SERVER = () => tr('The Near server is not answering.', 'Le serveur de Near ne répond pas.');
  const status = () => (message ? `<p class="listen-status${isError ? ' error' : ''}" role="status">${esc(message)}</p>` : '');

  const load = async () => {
    if (!Account.signedIn()) { links = null; return; }
    const res = await Account.api('GET', 'links');
    if (res.ok) links = res.data;
    if (role === 'helper') {
      alerts = (await Alerts.latest()) || alerts;
      const routines = await Account.api('GET', 'routines');
      if (routines.ok) days = routines.data;
      if (notifications !== 'error') notifications = await Alerts.state();
    }
  };

  // ---- The first screen: who uses this phone ----

  const chooseView = () => `
    <header class="welcome">
      <img class="welcome-logo" src="near-logo.png" alt="Near">
      ${languages()}
      <h1>${tr('Welcome', 'Bienvenue')}</h1>
      <p class="sub">${tr('Who will use this phone?', 'Qui va utiliser ce téléphone ?')}</p>
    </header>
    <div class="roles">
      <button class="role-choice" type="button" data-role="person">
        ${Icons.icon('person', 'role-icon')}
        <span class="role-title">${tr('Me', 'Moi')}</span>
        <span class="role-text">${tr('I want help with my memory.', 'Je veux de l’aide pour ma mémoire.')}</span>
      </button>
      <button class="role-choice" type="button" data-role="helper">
        ${Icons.icon('people', 'role-icon')}
        <span class="role-title">${tr('A relative', 'Un proche')}</span>
        <span class="role-text">${tr('I help someone who has memory loss.', 'J’aide une personne qui perd la mémoire.')}</span>
      </button>
    </div>
    <p class="source">${tr('This can be changed later, under Account.', 'Vous pourrez le changer plus tard, dans Compte.')}</p>`;

  // English or French: each language written in itself, so that anyone finds theirs.
  const languages = () => `
    <div class="langs" role="group" aria-label="Language / Langue">
      <button class="lang${I18n.lang === 'en' ? ' chosen' : ''}" type="button" data-lang="en" aria-pressed="${I18n.lang === 'en'}">English</button>
      <button class="lang${I18n.lang === 'fr' ? ' chosen' : ''}" type="button" data-lang="fr" aria-pressed="${I18n.lang === 'fr'}">Français</button>
    </div>`;

  const mountChoose = () => {
    document.getElementById('screen').addEventListener('click', (e) => {
      const lang = e.target.closest('[data-lang]');
      if (lang) { if (lang.dataset.lang !== I18n.lang) I18n.set(lang.dataset.lang); return; }
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
      <p class="brand"><img src="near-mark.png" alt=""><span>Near</span><span class="brand-for">${tr('for relatives', 'pour les proches')}</span></p>
      <h1>${tr('The people you help', 'Les personnes que vous aidez')}</h1>
    </header>
    <div id="relatives"></div>
    <p class="page-action account-link"><a href="#/account">${tr('Account, language, and who uses this phone', 'Compte, langue, et qui utilise ce téléphone')}</a></p>`;

  const mapLink = (a) => `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lon}`;

  // The latest alert about a person: when, where they were going, where they were.
  const alertCard = (a) => {
    const now = new Date();
    const when = new Date(a.created * 1000);
    const going = a.title ? `${a.title}${a.place ? `, ${a.place.replace(/^At\s+/i, 'at ').replace(/^(À|Au|Aux|Chez)\b/, (w) => w.toLowerCase())}` : ''}${a.start ? `, ${tr('at', 'à')} ${Dates.time(new Date(a.start))}` : ''}` : '';
    return `
      <div class="alert-box">
        <p class="alert-title">${tr(`${esc(a.name)} may be lost`, `${esc(a.name)} est peut-être perdu·e`)}</p>
        <p>${tr(`${esc(Dates.relative(when, now))} at ${esc(Dates.time(when))}, lost ${a.times || 1} ${a.times === 1 ? 'time' : 'times'} on the way${going ? ` to: ${esc(going)}` : ''}.`,
          `${esc(Dates.relative(when, now))} à ${esc(Dates.time(when))}, perdu·e ${a.times || 1} fois en chemin${going ? ` vers : ${esc(going)}` : ''}.`)}</p>
        ${a.street ? `<p>${tr('On', 'Dans la rue :')} ${esc(a.street)}.</p>` : ''}
        <p class="page-action"><a class="button primary" href="${mapLink(a)}" target="_blank" rel="noopener">${tr('See where on the map', 'Voir où sur la carte')}</a></p>
        ${a.accuracy ? `<p class="source">${tr(`Position within about ${Math.round(a.accuracy)} metres.`, `Position à environ ${Math.round(a.accuracy)} mètres près.`)}</p>` : ''}
      </div>`;
  };

  const HOW = { box: tr('the pill box was empty', 'la case du pilulier était vide'), voice: tr('said', 'dit'), button: tr('noted', 'noté') };

  // The things of today of a person: done, not yet, or late.
  const dayList = (day) => {
    if (!day || !day.tasks.length) return '';
    return `
      <ul class="helped-day">
        ${day.tasks.map((t) => {
          const state = t.done ? `✓ ${Dates.time(new Date(t.done.at))}${t.done.how === 'box' ? `, ${HOW.box}` : ''}`
            : t.late ? tr('Not noted', 'Pas noté') : tr('Not yet', 'Pas encore');
          return `<li class="${t.done ? 'yes' : t.late ? 'late' : ''}">
            <span>${t.time ? `${esc(t.time)} · ` : ''}${esc(t.text)}</span><strong>${esc(state)}</strong></li>`;
        }).join('')}
      </ul>`;
  };

  const peopleList = () => {
    if (!links) return `<p class="empty">${tr('Loading…', 'Chargement…')}</p>`;
    if (!links.people.length) return `<p class="empty">${tr('You are not linked to anyone yet.', 'Vous n’êtes encore lié·e à personne.')}</p>`;
    return links.people.map((p) => {
      const last = alerts.find((a) => a.person_id === p.id);
      return `
      <article class="card helped${last ? ' alerted' : ''}">
        <h3>${esc(p.name)}</h3>
        ${last ? alertCard(last) : `<p class="source">${tr(`No alert in the last day. You will be told if ${esc(p.name)} seems lost on the way somewhere.`,
          `Aucune alerte depuis hier. Vous serez prévenu·e si ${esc(p.name)} semble perdu·e en chemin.`)}</p>`}
        ${dayList(days.find((d) => d.person_id === p.id))}
        <button class="link-button" type="button" data-unlink="${p.id}" data-name="${esc(p.name)}">${tr('Remove this link', 'Retirer ce lien')}</button>
      </article>`;
    }).join('');
  };

  const NOTIFY = {
    on: tr('Notifications are on: this phone is told at once, even when the app is closed.',
      'Les notifications sont activées : ce téléphone est prévenu tout de suite, même quand l’application est fermée.'),
    off: tr('Notifications are off: you only see an alert when you open the app.',
      'Les notifications sont désactivées : vous ne voyez une alerte qu’en ouvrant l’application.'),
    denied: tr('Notifications are refused for Near on this phone. Allow them in the settings of the phone, then come back.',
      'Les notifications sont refusées pour Near sur ce téléphone. Autorisez-les dans les réglages du téléphone, puis revenez.'),
    unsupported: tr('This browser cannot get notifications. On an iPhone: in Safari, tap Share, then "Add to Home Screen", and open Near from its icon.',
      'Ce navigateur ne peut pas recevoir de notifications. Sur un iPhone : dans Safari, touchez Partager, puis « Sur l’écran d’accueil », et ouvrez Near depuis son icône.'),
    error: tr('Notifications could not be switched on. The Near server may not be reachable.',
      'Les notifications n’ont pas pu être activées. Le serveur de Near est peut-être injoignable.'),
  };

  const notifyCard = () => (notifications ? `
    <section>
      <h2>${tr('Notifications', 'Notifications')}</h2>
      <div class="card"><p>${esc(NOTIFY[notifications])}</p></div>
      ${notifications === 'on' || notifications === 'unsupported' ? ''
        : `<p class="page-action"><button class="button primary" type="button" data-rel="notify">${tr('Turn on notifications', 'Activer les notifications')}</button></p>`}
    </section>` : '');

  const joinForm = () => `
    <section>
      <h2>${tr('Link with someone', 'Se lier à quelqu’un')}</h2>
      <p>${tr('On their phone, open <strong>Account</strong> and press <strong>Link a relative</strong>. A code of 6 digits appears. Type it here.',
        'Sur son téléphone, ouvrez <strong>Compte</strong> et touchez <strong>Lier un proche</strong>. Un code de 6 chiffres apparaît. Tapez-le ici.')}</p>
      <form class="account-form" id="join-form">
        <label>${tr('The code on their phone', 'Le code affiché sur son téléphone')}
          <input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required></label>
        <label>${tr('Your name, as they know you', 'Votre prénom, tel qu’elle ou il vous connaît')}
          <input name="name" autocomplete="given-name" maxlength="40" required></label>
        ${status()}
        <div class="account-actions"><button class="button primary" type="submit">${tr('Link', 'Lier')}</button></div>
      </form>
    </section>`;

  const paintHelper = () => {
    const box = document.getElementById('relatives');
    if (!box) return;
    box.innerHTML = Account.signedIn() ? `<section>${peopleList()}</section>${notifyCard()}${joinForm()}` : `
      <section>
        <div class="card">
          <p>${tr('To be linked with someone, you need an account.', 'Pour être lié·e à quelqu’un, il vous faut un compte.')}</p>
        </div>
        <p class="page-action"><a class="button primary" href="#/account">${tr('Sign in or create my account', 'Me connecter ou créer mon compte')}</a></p>
      </section>`;
  };

  // ---- On the Account screen ----

  const accountView = () => `<div id="relatives"></div>`;

  const helpersList = () => {
    if (!links) return '';
    if (!links.helpers.length) return `<p class="empty">${tr('No relative is linked yet.', 'Aucun proche n’est encore lié.')}</p>`;
    return links.helpers.map((h) => `
      <div class="card helped">
        <p><strong>${esc(h.name)}</strong></p>
        <button class="link-button" type="button" data-unlink="${h.id}" data-name="${esc(h.name)}">${tr('Remove this link', 'Retirer ce lien')}</button>
      </div>`).join('');
  };

  const codeCard = () => (code ? `
    <div class="card invite">
      <p>${tr('On the phone of your relative, in Near, type this code:', 'Sur le téléphone de votre proche, dans Near, tapez ce code :')}</p>
      <p class="invite-code">${esc(code.code.slice(0, 3))} ${esc(code.code.slice(3))}</p>
      <p class="source">${tr('It works once, until', 'Il marche une fois, jusqu’à')} ${esc(Dates.time(new Date(code.expires * 1000)))}.</p>
    </div>` : '');

  const paintAccount = () => {
    const box = document.getElementById('relatives');
    if (!box) return;
    const linked = role === 'person' && Account.signedIn() ? `
      <section>
        <h2>${tr('My relatives', 'Mes proches')}</h2>
        <p class="sub">${tr('They are told if you get lost.', 'Ils sont prévenus si vous vous perdez.')}</p>
        ${helpersList()}
        ${codeCard()}
        ${status()}
        <p class="page-action"><button class="button primary" type="button" data-rel="invite">${tr('Link a relative', 'Lier un proche')}</button></p>
      </section>` : '';
    box.innerHTML = `${linked}
      <section>
        <h2>${tr('Who uses this phone', 'Qui utilise ce téléphone')}</h2>
        <div class="card">
          <p>${role === 'helper' ? tr('A relative, who helps someone with memory loss.', 'Un proche, qui aide une personne qui perd la mémoire.')
            : tr('The person who wants help with their memory.', 'La personne qui veut de l’aide pour sa mémoire.')}</p>
        </div>
        <p class="page-action"><button class="button" type="button" data-rel="role">${tr('Change', 'Changer')}</button></p>
      </section>
      <section>
        <h2>Language · Langue</h2>
        ${languages()}
      </section>`;
  };

  let checking = null;
  let draw = () => {};       // paints the box of the screen showing: the relative's home, or the Account screen

  const refresh = async () => {
    try { await load(); } catch { note(NO_SERVER(), true); }
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
      const lang = e.target.closest('[data-lang]');
      if (lang) { if (lang.dataset.lang !== I18n.lang) I18n.set(lang.dataset.lang); return; }
      const unlink = e.target.closest('[data-unlink]');
      if (unlink) {
        if (!confirm(tr(`Remove the link with ${unlink.dataset.name}?`, `Retirer le lien avec ${unlink.dataset.name} ?`))) return;
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
        else note((res && res.data.detail) || NO_SERVER(), true);
        draw();
      }
      if (button.dataset.rel === 'notify') {
        notifications = await Alerts.enable().catch(() => 'error');
        draw();
      }
      if (button.dataset.rel === 'role') {
        if (!confirm(tr('Change who uses this phone? The app will start again.', 'Changer qui utilise ce téléphone ? L’application va redémarrer.'))) return;
        setRole(null);
        location.hash = '#/';
        location.reload();
      }
    });

    box.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      note(tr('One moment…', 'Un instant…'));
      draw();
      const res = await Account.api('POST', 'links/join', { code: form.code.value, name: form.name.value }).catch(() => null);
      if (res && res.ok) {
        note(tr(`You are now linked with ${res.data.name}.`, `Vous êtes maintenant lié·e à ${res.data.name}.`));
        await load().catch(() => {});
      } else {
        note((res && res.data.detail) || NO_SERVER(), true);
      }
      draw();
      // Keep what was typed when it did not work.
      if (!(res && res.ok)) {
        const again = document.getElementById('join-form');
        if (again) { again.code.value = form.code.value; again.name.value = form.name.value; }
      }
    });

    // On the relative's home screen, look for new alerts while it is showing.
    if (onHome) {
      clearInterval(checking);
      checking = setInterval(() => {
        if (document.getElementById('relatives') && document.visibilityState === 'visible') refresh();
      }, CHECK_EVERY_MS);
    }
    // A code is only shown just after it is asked for: once used, it means nothing.
    code = null;
    note('');
    draw();
    refresh();
  };

  return { role: () => role, chooseView, mountChoose, helperHome, accountView, mount };
})();
