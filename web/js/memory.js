// What to remember from a conversation, on the Listen screen.
//
// The whole transcript is sent to the server, where a small language model
// writes a summary for the diary and memos about people and things. Each one is
// a proposal: nothing is kept until the user accepts it.
const Memory = (() => {
  let getText = () => '';
  let busy = false;
  let message = '';
  let isError = false;
  let proposals = [];           // { kind: 'summary' | 'memo', state: 'pending' | 'added', ... }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const find = async () => {
    const text = getText().trim();
    if (!text) {
      message = 'There is no text yet. Switch on the microphone and speak, or type a conversation.';
      isError = true;
      render();
      return;
    }

    busy = true;
    isError = false;
    message = 'Reading the conversation… This takes up to a minute, and longer the first time.';
    render();

    try {
      const res = await fetch('/api/understand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          user: SampleData.user.name,
          people: SampleData.people.map(({ id, name, relationship }) => ({ id, name, relationship })),
        }),
      });
      if (!res.ok) {
        const detail = await res.json().then((b) => b.detail, () => '');
        throw new Error(detail || `the server answered ${res.status}`);
      }
      const result = await res.json();

      proposals = [];
      if (result.summary) {
        proposals.push({ kind: 'summary', state: 'pending', text: result.summary });
      }
      for (const memo of result.memos) proposals.push({ kind: 'memo', state: 'pending', ...memo });

      message = `Read in ${result.seconds} seconds.`
        + (result.memos.length ? '' : ' No lasting news was found in this conversation.')
        + (result.rejected ? ` ${result.rejected} memo(s) were set aside because their words were not in the text.` : '');
    } catch (err) {
      isError = true;
      message = err instanceof TypeError
        ? 'The Dezheimer server is not answering.'
        : `The conversation could not be read: ${err.message}`;
    }
    busy = false;
    render();
  };

  const accept = (p) => {
    const date = new Date();
    if (p.kind === 'summary') {
      // No people listed: the model cannot tell who was there from who was only talked about.
      SampleData.add('diary', { date, text: p.text, personIds: [] });
      p.link = `#/diary/${Dates.key(date)}`;
      p.where = 'the diary';
    } else if (p.personId) {
      SampleData.add('memos', { personId: p.personId, date, text: p.news, quote: p.quote });
      p.link = `#/people/${p.personId}`;
      p.where = `${p.about}'s page`;
    } else {
      // A thing, or someone who is not in People yet.
      SampleData.add('notes', { date, subject: p.about, text: p.news, quote: p.quote });
      p.link = `#/diary/${Dates.key(date)}`;
      p.where = 'the notes of the day';
    }
    p.state = 'added';
  };

  // ---- Screen ----

  const card = (p, index) => {
    const body = p.kind === 'summary'
      ? `<p class="proposal-heard">Summary for today's diary</p>
         <p class="proposal-text">${esc(p.text)}</p>`
      : `<p class="proposal-heard">${p.personId ? 'Memo about' : 'Note about'} <strong>${esc(p.about)}</strong></p>
         <p class="proposal-text">${esc(p.news)}</p>
         <p class="source">Heard: “${esc(p.quote)}”</p>`;

    const target = p.kind === 'summary' ? 'Add to the diary'
      : p.personId ? `Add to ${esc(p.about)}'s memos` : 'Add to the notes';

    const actions = p.state === 'added'
      ? `<p class="proposal-done">Added. <a href="${esc(p.link)}">See it in ${esc(p.where)}</a></p>`
      : `<div class="proposal-actions">
           <button class="button primary" type="button" data-memory="${index}" data-action="add">${target}</button>
           <button class="button" type="button" data-memory="${index}" data-action="ignore">Ignore</button>
         </div>`;

    return `<article class="card proposal${p.state === 'added' ? ' added' : ''}">${body}${actions}</article>`;
  };

  const view = () => `
    <section>
      <h2>Understood for the memory</h2>
      <div id="memory"></div>
    </section>`;

  const render = () => {
    const box = document.getElementById('memory');
    if (!box) return; // another screen is showing
    box.innerHTML = `
      <button class="button primary" type="button" data-action="find"${busy ? ' disabled' : ''}>
        ${busy ? 'Reading…' : 'Find what to remember'}
      </button>
      <p class="listen-status${isError ? ' error' : ''}" role="status">${esc(message)}</p>
      ${proposals.map(card).join('')}`;
  };

  const mount = (transcriptText) => {
    getText = transcriptText;
    document.getElementById('memory').addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'find') { find(); return; }
      const index = Number(button.dataset.memory);
      if (button.dataset.action === 'add') accept(proposals[index]);
      else proposals.splice(index, 1);
      render();
    });
    render();
  };

  return { view, mount };
})();
