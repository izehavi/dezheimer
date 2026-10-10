// The voice of the app. Uses the voices installed on the device, so nothing is
// sent over the internet.
const Speech = (() => {
  const supported = 'speechSynthesis' in window;
  let voice = null;

  // Voices that are jokes or effects, found on Apple devices among the English ones.
  const NOT_A_VOICE = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe organ|fred|junior|ralph|kathy|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley/i;
  // Voices known to be clear, best first.
  const GOOD = [/natural/i, /samantha|daniel|karen|serena|ava|allison|susan/i, /google (uk|us) english/i, /zira|hazel|aria|jenny|sonia|libby/i];

  // An English voice, never the voice of another language: a French voice reading
  // English is very hard to follow.
  const pickVoice = () => {
    const english = speechSynthesis.getVoices()
      .filter((v) => /^en([-_]|$)/i.test(v.lang) && !NOT_A_VOICE.test(v.name));
    const rank = (v) => {
      const known = GOOD.findIndex((names) => names.test(v.name));
      return (known < 0 ? GOOD.length : known) * 4
        + (/^en[-_](GB|US)/i.test(v.lang) ? 0 : 2)   // the accents most people are used to
        + (v.localService ? 0 : 1);                   // on the device rather than online
    };
    voice = english.sort((a, b) => rank(a) - rank(b))[0] || null;
  };

  // True when the device has voices, and none of them is English.
  const noEnglish = () => supported && !voice && speechSynthesis.getVoices().length > 0;

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
    utterance.lang = voice ? voice.lang : 'en-US';
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
  const time = (date) => {
    const h = date.getHours();
    const m = date.getMinutes();
    if (h === 12 && m === 0) return '12 noon';
    if (h === 0 && m === 0) return 'midnight';
    const hour = h % 12 || 12;
    return `${hour}${m ? ` ${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'in the morning' : h < 18 ? 'in the afternoon' : 'in the evening'}`;
  };

  return { say, stop, time, supported, noEnglish };
})();
