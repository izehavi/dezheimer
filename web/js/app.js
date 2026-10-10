// Hash router: every screen has its own address, so all navigation is plain links.
//   #/                  home
//   #/agenda[/DAY]      agenda, DAY as YYYY-MM-DD
//   #/people[/ID]       gallery, or one person's memo
//   #/people/connections  map of who knows whom
//   #/diary[/DAY]       diary
//   #/listen            record a conversation
//   #/account           sign in, backup
//   #/read              read a long text aloud, to teach the app the user's voice
(() => {
  const screen = document.getElementById('screen');
  const tabs = document.querySelectorAll('.tabs a');

  const render = () => {
    const [tab = '', arg = ''] = location.hash.replace(/^#\/?/, '').split('/');
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
    } else if (tab === 'read') {
      active = 'read';
      html = Reading.view();
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
    if (active === 'account') active = 'home';
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

  // Keep the clock and "coming next" on the home screen up to date.
  setInterval(() => {
    const onHome = !location.hash.replace(/^#\/?/, '');
    // Not while the assistant is in use: redrawing would interrupt it.
    if (onHome && Assistant.idle()) render();
  }, 60000);

  render();
  Reminders.start();
  // The backup may bring data from another device: show it when it arrives.
  Account.start(render);
})();
