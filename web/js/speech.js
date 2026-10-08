// The voice of the app. Uses the voices installed on the device, so nothing is
// sent over the internet.
const Speech = (() => {
  const supported = 'speechSynthesis' in window;
  let voice = null;

  const pickVoice = () => {
    const english = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
    // A voice that runs on the device is preferred to one that runs online.
    voice = english.find((v) => v.localService) || english[0] || null;
  };

  if (supported) {
    pickVoice();
    speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }

  // Says the text aloud. The promise ends when the voice has finished.
  const say = (text) => new Promise((resolve) => {
    if (!supported || !text) { resolve(); return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice ? voice.lang : 'en-GB';
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

  return { say, stop, time, supported };
})();
