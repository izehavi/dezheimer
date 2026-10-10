// The microphone, shared by the assistant and the Listen screen.
//
// The audio is cut into phrases. A phrase starts when someone speaks and ends
// after a short silence. While a phrase is being spoken, it is sent to the
// server every PARTIAL_EVERY_MS for a provisional transcription; when it ends,
// it is transcribed one last time.
//
//   Mic.start({ owner, single, keep, onPhrase, onPartial, onLevel, onTick, onError, onStop })
//
// `keep`: the server keeps the sound of each finished phrase, to measure the speech model.
// onPhrase then also gets the name of the recording.
// `onBlock`: gets the sound as it comes, with its rate, and nothing is cut into phrases
// or written down. Used to record a long reading (reading.js).
//
// Only one screen uses the microphone at a time: starting it stops the previous use.
const Mic = (() => {
  const APP_URL = 'http://localhost:8765';
  const SAMPLE_RATE = 16000;
  const MIN_SPEECH_LEVEL = 0.004; // quietest level that can count as speech (RMS)
  const SPEECH_OVER_NOISE = 3;    // speech must be this many times louder than the room
  const END_SILENCE_S = 1.2;      // silence that ends a phrase: long enough to breathe and think
  const PRE_ROLL_S = 0.3;         // audio kept from just before speech starts
  const MAX_PHRASE_S = 20;        // a phrase is cut after this long without a pause
  const MIN_SPEECH_S = 0.25;      // shorter bursts are treated as noise
  const PARTIAL_EVERY_MS = 1500;

  let listening = false;
  let handlers = {};
  let stream, context, partialTimer;

  // To understand what happens when it does not work.
  const stats = { mic: '', noise: 0.002, peak: 0, sent: 0, answered: 0, lastMs: 0 };

  // Current phrase
  let chunks = [];
  let samples = 0;
  let speechSamples = 0;
  let silenceSamples = 0;
  let phraseId = 0;

  // Requests run one at a time, in order, so phrases never get mixed up.
  let queue = Promise.resolve();
  let pending = 0;

  const usable = () => location.protocol !== 'file:' && !!navigator.mediaDevices;

  // iPhones and iPads record at their own rate whatever is asked; asking for another
  // one can give no sound at all. The audio is brought to 16 kHz below instead.
  const APPLE_TOUCH = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // 48 kHz -> 16 kHz by averaging: three times less to send, and no harsh artefacts.
  // Other rates are left to the server.
  const to16k = (audio, rate) => {
    const step = rate / SAMPLE_RATE;
    if (step < 2 || !Number.isInteger(step)) return { audio, rate };
    const out = new Float32Array(Math.floor(audio.length / step));
    for (let i = 0; i < out.length; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += audio[i * step + j];
      out[i] = sum / step;
    }
    return { audio: out, rate: SAMPLE_RATE };
  };

  // The user's own words, given to the speech model so that it writes them right:
  // the names of their people, and the places in their agenda.
  const vocabulary = () => {
    // Also the names and places the user typed on the "Teach the app my voice" screen (reading.js).
    const mine = typeof Reading === 'undefined' ? { people: [], places: [] } : Reading.myWords();
    const names = [...new Set([...SampleData.people.map((p) => p.name), ...mine.people])];
    const places = [...new Set([...SampleData.events.map((e) => (e.place || '').replace(/^(At|In) /, '')), ...mine.places])]
      .filter((p) => p && p.length < 40 && !/^(home|the )/i.test(p));
    return `${names.join(', ')}. ${places.join(', ')}. Memo, agenda, appointment.`.slice(0, 600);
  };

  // Returns true when the microphone is on.
  const start = async (newHandlers) => {
    stop();
    handlers = newHandlers;
    const h = handlers;

    if (!usable()) {
      h.onError?.(location.protocol === 'http:' && !/^(localhost|127\.)/.test(location.hostname)
        ? 'The microphone only works on the secure address, the one that starts with https.'
        : `The microphone needs the Dezheimer server. Double-click start.bat, then open ${APP_URL}`);
      return false;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stats.mic = stream.getAudioTracks()[0].label || 'unknown';
      stats.peak = stats.sent = stats.answered = stats.lastMs = 0;
      const Context = window.AudioContext || window.webkitAudioContext;
      context = APPLE_TOUCH ? new Context() : new Context({ sampleRate: SAMPLE_RATE });
      await context.resume();
      await context.audioWorklet.addModule('js/recorder-worklet.js');
      const source = context.createMediaStreamSource(stream);
      const recorder = new AudioWorkletNode(context, 'recorder');
      recorder.port.onmessage = (e) => onAudio(e.data);
      // The recorder outputs silence; connecting it keeps the audio graph running.
      source.connect(recorder).connect(context.destination);
    } catch (err) {
      release();
      const reasons = {
        NotAllowedError: 'The browser is not allowed to use the microphone. Click the padlock or microphone icon in the address bar, allow the microphone, and try again. Also check Windows Settings > Privacy & security > Microphone.',
        NotFoundError: 'No microphone was found on this computer.',
        NotReadableError: 'The microphone is being used by another program, or Windows is blocking it.',
      };
      h.onError?.(reasons[err.name] || `The microphone could not be started: ${err.name}: ${err.message}`);
      return false;
    }
    if (handlers !== h) { release(); return false; } // stopped while starting

    resetPhrase();
    listening = true;
    partialTimer = setInterval(sendPartial, PARTIAL_EVERY_MS);
    return true;
  };

  const stop = () => {
    if (!listening) return;
    listening = false;
    clearInterval(partialTimer);
    endPhrase(); // write down what was being said
    release();
    handlers.onLevel?.(0);
    handlers.onStop?.();
  };

  const release = () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (context) context.close();
    stream = context = undefined;
  };

  // ---- Cutting the audio into phrases ----

  const resetPhrase = () => {
    chunks = [];
    samples = speechSamples = silenceSamples = 0;
    phraseId += 1;
  };

  const onAudio = (block) => {
    if (!listening) return;

    let sum = 0;
    for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
    const level = Math.sqrt(sum / block.length);
    handlers.onLevel?.(level);
    if (handlers.onBlock) { handlers.onBlock(block, context.sampleRate); return; }

    chunks.push(block);
    samples += block.length;
    if (level > stats.peak) stats.peak = level;

    // The speech threshold follows the noise of the room, so that quiet and loud
    // microphones both work.
    if (level > Math.max(MIN_SPEECH_LEVEL, stats.noise * SPEECH_OVER_NOISE)) {
      speechSamples += block.length;
      silenceSamples = 0;
    } else {
      silenceSamples += block.length;
      stats.noise += (level - stats.noise) * 0.02;
    }

    const rate = context.sampleRate;
    if (speechSamples === 0) {
      // Nobody is speaking: keep only the last moments.
      while (samples - chunks[0].length > PRE_ROLL_S * rate) samples -= chunks.shift().length;
    } else if (silenceSamples > END_SILENCE_S * rate || samples > MAX_PHRASE_S * rate) {
      // `single`: the microphone switches itself off after one phrase.
      if (handlers.single && hasSpeech()) stop(); else endPhrase();
    }
  };

  const phraseAudio = () => {
    const audio = new Float32Array(samples);
    let offset = 0;
    for (const c of chunks) { audio.set(c, offset); offset += c.length; }
    return audio;
  };

  const hasSpeech = () => context && speechSamples > MIN_SPEECH_S * context.sampleRate;

  const endPhrase = () => {
    if (hasSpeech()) {
      const h = handlers;
      const time = new Date();
      transcribe(phraseAudio(), h, (text, audio) => h.onPhrase?.(text, time, audio), !!h.keep);
    }
    resetPhrase();
  };

  const sendPartial = () => {
    handlers.onTick?.();
    // Skipped when the server is still busy: only the final transcription must not be lost.
    if (!hasSpeech() || pending > 0) return;
    const h = handlers;
    const id = phraseId;
    transcribe(phraseAudio(), h, (text) => { if (id === phraseId) h.onPartial?.(text); });
  };

  // ---- Server ----

  const transcribe = (recorded, h, onText, keep = false) => {
    const { audio, rate } = to16k(recorded, context.sampleRate);
    // Sent as 16-bit numbers: half the size, which matters on a phone network.
    const sound = new Int16Array(audio.length);
    for (let i = 0; i < audio.length; i++) sound[i] = Math.max(-1, Math.min(1, audio[i])) * 32767;
    let sentAt;
    pending += 1;
    queue = queue
      .then(() => {
        sentAt = performance.now();
        stats.sent += 1;
        return fetch('/api/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Sample-Rate': String(rate),
            'X-Sample-Format': 'int16',
            'X-Vocabulary': encodeURIComponent(vocabulary()),
            ...(keep ? { 'X-Keep': '1' } : {}),
          },
          body: sound.buffer,
        });
      })
      .then(async (res) => {
        if (!res.ok) throw new Error(`the server answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return res.json();
      })
      .then(({ text, audio }) => {
        stats.answered += 1;
        stats.lastMs = Math.round(performance.now() - sentAt);
        onText(text, audio);
      })
      .catch((err) => h.onError?.(
        err instanceof TypeError
          ? 'The Dezheimer server stopped answering. Check that its black window is still open on the computer, and that this device can reach it.'
          : `Could not write down the last phrase: ${err.message}`))
      .finally(() => { pending -= 1; });
  };

  return {
    start, stop, stats, usable, to16k, APP_URL,
    isListening: (owner) => listening && (!owner || handlers.owner === owner),
  };
})();
