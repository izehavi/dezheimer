// Hash router: every screen has its own address, so all navigation is plain links.
//   #/                  home
//   #/agenda[/DAY]      agenda, DAY as YYYY-MM-DD
//   #/people[/ID]       gallery, or one person's memo
//   #/people/connections  map of who knows whom
//   #/diary[/DAY]       diary
//   #/listen            record a conversation
//   #/day[/steps]       what to do today, before leaving home, good to know; something step by step
//   #/day/now/TASK      one thing to do now, opened from a reminder
//   #/account           sign in, backup
//   #/read              read a long text aloud, to teach the app the user's voice
//   #/walk[/EVENT]      the way to the place of an event, watched while walking
(() => {
  const screen = document.getElementById('screen');
  const tabs = document.querySelectorAll('.tabs a');

  // The icons of the tabs (icons.js).
  const TAB_ICONS = { home: 'home', agenda: 'calendar', people: 'people', diary: 'book', listen: 'mic' };
  const TAB_NAMES = {
    home: tr('Today', 'Aujourd’hui'), agenda: tr('Agenda', 'Agenda'), people: tr('People', 'Proches'),
    diary: tr('Diary', 'Journal'), listen: tr('Listen', 'Écouter'),
  };
  tabs.forEach((a) => {
    a.querySelector('.tab-icon').innerHTML = Icons.icon(TAB_ICONS[a.dataset.tab]);
    a.lastChild.textContent = TAB_NAMES[a.dataset.tab];
  });
  // The buttons of the reminder, in the language of the app.
  document.getElementById('reminder-go').textContent = tr('Take me there', 'Y aller');
  document.getElementById('reminder-done').textContent = tr('Done', 'Fait');

  const role = Relatives.role();
  // A relative's phone has its own small app, without the tabs of the person's app.
  document.querySelector('.tabs').hidden = role !== 'person';

  const render = () => {
    const [tab = '', arg = '', more = ''] = location.hash.replace(/^#\/?/, '').split('/');

    // The first time: who uses this phone (relatives.js).
    if (!role) { screen.innerHTML = Relatives.chooseView(); return 'choose'; }
    if (role === 'helper') {
      screen.innerHTML = tab === 'account' ? Account.view() : Relatives.helperHome();
      if (tab === 'account') Account.mount(); else Relatives.mount();
      return 'helper';
    }

    const now = new Date();
    let active = 'home';
    let html;

    if (tab === 'agenda') {
      active = 'agenda';
      html = Views.agenda({ now, day: Dates.fromKey(arg) });
    } else if (tab === 'people') {
      active = 'people';
      if (arg === 'connections') { active = 'connections'; html = Graph.view(); }
      else html = arg ? Views.person({ now, id: arg }) : Views.peopleList();
    } else if (tab === 'diary') {
      active = 'diary';
      html = Views.diary({ now, day: Dates.fromKey(arg) });
    } else if (tab === 'account') {
      active = 'account';
      html = Account.view();
    } else if (tab === 'day') {
      active = 'day';
      html = Day.view({ now, arg, more });
    } else if (tab === 'read') {
      active = 'read';
      html = Reading.view();
    } else if (tab === 'walk') {
      active = 'walk';
      html = Walk.view();
    } else if (tab === 'listen') {
      active = 'listen';
      html = Listen.view();
    } else {
      html = Views.home({ now });
    }

    // The microphone only stays on while the screen that uses it is showing.
    if (active !== 'listen') Listen.stop();
    if (active !== 'home') Assistant.stop();
    if (active !== 'read') Reading.stop();

    screen.innerHTML = html;
    if (active === 'account') { Account.mount(); }
    if (active === 'listen') Listen.mount();
    if (active === 'home') Assistant.mount(render);
    if (active === 'connections') { Graph.mount(); active = 'people'; }
    if (active === 'read') { Reading.mount(); active = 'home'; }
    if (active === 'walk') { Walk.mount(arg); active = 'agenda'; }
    if (active === 'day') Routine.mount();
    if (active === 'account' || active === 'day') active = 'home';
    tabs.forEach((a) => {
      if (a.dataset.tab === active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    return active;
  };

  screen.addEventListener('click', (e) => {
    // "Remove" on something that was added from the Listen screen.
    const button = e.target.closest('[data-remove]');
    if (!button) return;
    const [kind, id] = button.dataset.remove.split(':');
    SampleData.remove(kind, id);
    if (kind === 'people') location.hash = '#/people'; else render();
  });

  window.addEventListener('hashchange', () => {
    render();
    window.scrollTo(0, 0);
  });

  render();
  if (!role) { Relatives.mountChoose(); return; }
  if (role === 'helper') { Alerts.start(); return; }

  // Keep the clock and "coming next" on the home screen up to date.
  setInterval(() => {
    const onHome = !location.hash.replace(/^#\/?/, '');
    // Not while the assistant is in use: redrawing would interrupt it.
    if (onHome && Assistant.idle()) render();
  }, 60000);

  Day.start(render);
  Reminders.start();
  Walk.start();
  Routine.start();
  Alerts.start();
  // The backup may bring data from another device: show it when it arrives.
  Account.start(render);
})();
