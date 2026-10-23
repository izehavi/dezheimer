// The voice of the app. Uses the voices installed on the device, so nothing is
// sent over the internet.
const Speech = (() => {
  const supported = 'speechSynthesis' in window;
  let voice = null;

  // Voices that are jokes or effects, found on Apple devices among the English ones.
  const NOT_A_VOICE = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe organ|fred|junior|ralph|kathy|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley/i;
  // Voices known to be clear, best first.
  const GOOD = [/natural/i, /samantha|daniel|karen|serena|ava|allison|susan/i, /google (uk|us) english/i, /zira|hazel|aria|jenny|sonia|libby/i];

  // Voices known to be clear in French, best first.
  const GOOD_FR = [/natural/i, /audrey|thomas|amelie|amélie|marie/i, /google fran/i, /denise|henri|hortense|julie|paul/i];

  // A voice of the language of the app, never the voice of another language: a French
  // voice reading English, or the other way round, is very hard to follow.
  const pickVoice = () => {
    const mine = new RegExp(`^${I18n.lang}([-_]|$)`, 'i');
    const usual = I18n.fr ? /^fr[-_]FR/i : /^en[-_](GB|US)/i;   // the accents most people are used to
    const good = I18n.fr ? GOOD_FR : GOOD;
    const voices = speechSynthesis.getVoices().filter((v) => mine.test(v.lang) && !NOT_A_VOICE.test(v.name));
    const rank = (v) => {
      const known = good.findIndex((names) => names.test(v.name));
      return (known < 0 ? good.length : known) * 4
        + (usual.test(v.lang) ? 0 : 2)
        + (v.localService ? 0 : 1);                   // on the device rather than online
    };
    voice = voices.sort((a, b) => rank(a) - rank(b))[0] || null;
  };

  // True when the device has voices, and none of them in the language of the app.
  const noVoice = () => supported && !voice && speechSynthesis.getVoices().length > 0;

  if (supported) {
    pickVoice();
    speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }

  // Says the text aloud. The promise ends when the voice has finished.
  const say = (text) => new Promise((resolve) => {
    if (!supported || !text) { resolve(); return; }
    speechSynthesis.cancel();
    if (!voice) pickVoice();   // the list of voices often comes after the page
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice ? voice.lang : I18n.locale;
    utterance.rate = 0.9; // a little slower than normal, easier to follow
    // Some browsers never signal the end; do not wait for ever.
    const giveUp = setTimeout(resolve, 3000 + text.length * 90);
    utterance.onend = utterance.onerror = () => { clearTimeout(giveUp); resolve(); };
    speechSynthesis.speak(utterance);
  });

  const stop = () => { if (supported) speechSynthesis.cancel(); };

  // Phones only let a page speak after the user has touched it. The first touch says
  // nothing, aloud: from then on the app can answer and remind by itself.
  if (supported) {
    const unlock = () => {
      const silent = new SpeechSynthesisUtterance(' ');
      silent.volume = 0;
      speechSynthesis.speak(silent);
    };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  }

  // "15:30" -> "3 30 pm", "12:00" -> "12 noon": easier to hear than "fifteen thirty".
  // In French: "15 heures 30", "midi".
  const time = (date) => {
    const h = date.getHours();
    const m = date.getMinutes();
    if (I18n.fr) {
      if (h === 12 && m === 0) return 'midi';
      if (h === 0 && m === 0) return 'minuit';
      return `${h} ${h === 1 ? 'heure' : 'heures'}${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
    }
    if (h === 12 && m === 0) return '12 noon';
    if (h === 0 && m === 0) return 'midnight';
    const hour = h % 12 || 12;
    return `${hour}${m ? ` ${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'in the morning' : h < 18 ? 'in the afternoon' : 'in the evening'}`;
  };

  return { say, stop, time, supported, noVoice };
})();
