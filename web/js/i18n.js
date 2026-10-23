// The language of the app: English or French. It is chosen on the first screen, or under
// Account, and kept on the device. Changing it loads the app again in the other language.
// The first time, the language of the phone is used.
//
// Words are written in both languages where they are used: tr('Done', 'Fait'). In French,
// the app speaks to the person as "vous".
const I18n = (() => {
  const KEY = 'dezheimer.lang';
  let lang = null;
  try { lang = localStorage.getItem(KEY); } catch { /* the language of the phone */ }
  const chosen = lang === 'en' || lang === 'fr';
  if (!chosen) lang = /^fr\b/i.test(navigator.language || '') ? 'fr' : 'en';
  document.documentElement.lang = lang;

  const set = (value) => {
    try { localStorage.setItem(KEY, value); } catch { /* until the page is closed */ }
    location.reload();
  };

  return { lang, fr: lang === 'fr', locale: lang === 'fr' ? 'fr-FR' : 'en-GB', set, chosen: () => chosen };
})();

// The same words in the language of the app.
const tr = (en, fr) => (I18n.fr ? fr : en);
