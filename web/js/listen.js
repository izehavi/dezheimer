// Listen screen: switch the microphone on and see a whole conversation written down.
// Agenda commands (commands.js) and things to remember (memory.js) are found in that text.
// The microphone itself is in mic.js.
const Listen = (() => {
  // What was written down. Kept when moving between screens, lost on reload.
  const lines = [];               // { time: Date, text: string }
  let liveText = '';

  let status = '';
  let isError = false;
  let statusIsHtml = false;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const listening = () => Mic.isListening('listen');

  // ---- Screen ----

  const view = () => `
    <header class="page-head">
      <h1>Listen</h1>
      <p class="sub">Leave the microphone on during a conversation: what is said is written down here.</p>
    </header>

    <div class="listen-controls">
      <button id="mic-button" class="button mic" type="button"></button>
      <button id="clear-button" class="button" type="button">Clear the text</button>
    </div>

    <div class="level" aria-hidden="true"><div id="level-bar"></div></div>
    <p id="listen-status" class="listen-status" role="status"></p>
    <p id="listen-details" class="listen-details"></p>

    ${Commands.view()}

    <section>
      <h2>What was said</h2>
      <div id="transcript" class="card transcript" aria-live="polite"></div>
      <form id="type-form" class="type-form">
        <label for="type-box">Or type a conversation, to test without speaking</label>
        <textarea id="type-box" rows="3"></textarea>
        <button class="button" type="submit">Add to the text</button>
      </form>
    </section>

    ${Memory.view()}`;

  const $ = (id) => document.getElementById(id);

  const paint = () => {
    const button = $('mic-button');
    if (!button) return; // another screen is showing

    const on = listening();
    const stats = Mic.stats;
    button.textContent = on ? '■  Switch off the microphone' : '🎤  Switch on the microphone';
    button.classList.toggle('on', on);
    button.disabled = !Mic.usable();
    if (statusIsHtml) $('listen-status').innerHTML = status;
    else $('listen-status').textContent = status;
    $('listen-status').classList.toggle('error', isError);
    $('listen-details').textContent = stats.mic
      ? `Microphone: ${stats.mic} · loudest sound heard: ${stats.peak.toFixed(3)} · room noise: ${stats.noise.toFixed(3)} · `
        + `phrases sent: ${stats.sent}, answered: ${stats.answered}`
        + (stats.lastMs ? ` · last answer in ${stats.lastMs} ms` : '')
      : '';

    const done = lines.map((l) => `
      <p><span class="line-time">${esc(Dates.time(l.time))}</span>${esc(l.text)}</p>`).join('');
    const live = liveText ? `<p class="live"><span class="line-time">…</span>${esc(liveText)}</p>` : '';
    $('transcript').innerHTML = done + live
      || '<p class="placeholder">Nothing yet. Switch on the microphone and speak.</p>';
  };

  const setStatus = (text, error = false, html = false) => {
    status = text; isError = error; statusIsHtml = html; paint();
  };

  const mount = () => {
    $('mic-button').addEventListener('click', () => (listening() ? stop() : start()));
    $('clear-button').addEventListener('click', () => { lines.length = 0; liveText = ''; paint(); });
    $('type-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = $('type-box').value.trim();
      if (!text) return;
      $('type-box').value = '';
      addLine(new Date(), text);
      paint();
    });
    Commands.mount();
    Memory.mount(() => lines.map((l) => l.text).join(' '));
    paint();
    if (!listening()) checkServer();
  };

  const checkServer = async () => {
    if (location.protocol === 'file:') {
      // Opened by double-clicking index.html: the microphone only works through the server.
      setStatus('The microphone does not work when the page is opened as a file. '
        + `Double-click start.bat in the project folder, then use <a href="${Mic.APP_URL}/#/listen">${Mic.APP_URL}</a>.`, true, true);
      return;
    }
    try {
      const health = await (await fetch('/api/health')).json();
      if (health.error) setStatus(`The speech model could not be loaded: ${health.error}`, true);
      else if (!health.ready) {
        setStatus('The speech model is loading. The first start downloads it and can take a minute.');
        setTimeout(() => { if ($('mic-button') && !listening()) checkServer(); }, 2000);
      } else setStatus(`Ready. Model: ${health.model}, running on ${health.device === 'cuda' ? 'the graphics card' : 'the processor'}.`);
    } catch {
      setStatus('The Dezheimer server is not answering. Double-click start.bat in the project folder.', true);
    }
  };

  // A phrase that was said (or typed) is written down, then checked for an agenda command.
  const addLine = (time, text) => {
    lines.push({ time, text });
    Commands.heard(text).catch((err) => setStatus(`Could not look for a command: ${err.message}`, true));
  };

  // ---- Microphone ----

  const start = async () => {
    const on = await Mic.start({
      owner: 'listen',
      onPhrase: (text, time) => {
        liveText = '';
        if (text) addLine(time, text);
        if (isError && listening()) setStatus('Listening…'); else paint();
      },
      onPartial: (text) => { liveText = text; paint(); },
      onLevel: (level) => {
        const bar = $('level-bar');
        if (bar) bar.style.width = `${Math.min(100, level * 600)}%`;
      },
      onTick: paint, // refreshes the details line
      onError: (message) => setStatus(message, true),
      onStop: () => setStatus('The microphone is off.'),
    });
    if (on) setStatus('Listening…');
  };

  const stop = () => {
    if (listening()) Mic.stop();
  };

  return { view, mount, stop };
})();
