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
      message = tr('There is no text yet. Switch on the microphone and speak, or type a conversation.', 'Il n’y a pas encore de texte. Allumez le micro et parlez, ou tapez une conversation.');
      isError = true;
      render();
      return;
    }

    busy = true;
    isError = false;
    message = tr('Reading the conversation… This takes up to a minute, and longer the first time.', 'Je lis la conversation… Cela prend jusqu’à une minute, et plus la première fois.');
    render();

    try {
      const res = await fetch('/api/understand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          user: SampleData.user.name,
          lang: I18n.lang,
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

      message = tr(`Read in ${result.seconds} seconds.`, `Lu en ${result.seconds} secondes.`)
        + (result.memos.length ? '' : tr(' No lasting news was found in this conversation.', ' Aucune nouvelle durable dans cette conversation.'))
        + (result.rejected ? tr(` ${result.rejected} memo(s) were set aside because their words were not in the text.`,
          ` ${result.rejected} note(s) mise(s) de côté : leurs mots n’étaient pas dans le texte.`) : '');
    } catch (err) {
      isError = true;
      message = err instanceof TypeError
        ? tr('The Near server is not answering.', 'Le serveur de Near ne répond pas.')
        : tr(`The conversation could not be read: ${err.message}`, `La conversation n’a pas pu être lue : ${err.message}`);
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
      p.where = tr('the diary', 'le journal');
    } else if (p.personId) {
      SampleData.add('memos', { personId: p.personId, date, text: p.news, quote: p.quote });
      p.link = `#/people/${p.personId}`;
      p.where = tr(`${p.about}'s page`, `la page de ${p.about}`);
    } else {
      // A thing, or someone who is not in People yet.
      SampleData.add('notes', { date, subject: p.about, text: p.news, quote: p.quote });
      p.link = `#/diary/${Dates.key(date)}`;
      p.where = tr('the notes of the day', 'les notes du jour');
    }
    p.state = 'added';
  };

  // ---- Screen ----

  const card = (p, index) => {
    const body = p.kind === 'summary'
      ? `<p class="proposal-heard">${tr('Summary for today\'s diary', 'Résumé pour le journal du jour')}</p>
         <p class="proposal-text">${esc(p.text)}</p>`
      : `<p class="proposal-heard">${p.personId ? tr('Memo about', 'Note sur') : tr('Note about', 'Note sur')} <strong>${esc(p.about)}</strong></p>
         <p class="proposal-text">${esc(p.news)}</p>
         <p class="source">${tr('Heard:', 'Entendu :')} “${esc(p.quote)}”</p>`;

    const target = p.kind === 'summary' ? tr('Add to the diary', 'Ajouter au journal')
      : p.personId ? tr(`Add to ${esc(p.about)}'s memos`, `Ajouter aux notes de ${esc(p.about)}`) : tr('Add to the notes', 'Ajouter aux notes');

    const actions = p.state === 'added'
      ? `<p class="proposal-done">${tr('Added.', 'Ajouté.')} <a href="${esc(p.link)}">${tr('See it in', 'Le voir dans')} ${esc(p.where)}</a></p>`
      : `<div class="proposal-actions">
           <button class="button primary" type="button" data-memory="${index}" data-action="add">${target}</button>
           <button class="button" type="button" data-memory="${index}" data-action="ignore">${tr('Ignore', 'Ignorer')}</button>
         </div>`;

    return `<article class="card proposal${p.state === 'added' ? ' added' : ''}">${body}${actions}</article>`;
  };

  const view = () => `
    <section>
      <h2>${tr('Understood for the memory', 'Compris pour la mémoire')}</h2>
      <div id="memory"></div>
    </section>`;

  const render = () => {
    const box = document.getElementById('memory');
    if (!box) return; // another screen is showing
    box.innerHTML = `
      <button class="button primary" type="button" data-action="find"${busy ? ' disabled' : ''}>
        ${busy ? tr('Reading…', 'Je lis…') : tr('Find what to remember', 'Trouver ce qu’il faut retenir')}
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
