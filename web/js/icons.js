// Simple line icons, drawn in the colour of the text around them: calmer than emoji,
// and the same on every phone. Each one is an inline SVG, hidden from screen readers
// (the words next to it say what it is).
const Icons = (() => {
  const PATHS = {
    home: '<path d="M3.5 11.5 12 4.5l8.5 7"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5v-5h4v5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.4 2.8-5.3 5.5-5.3s4.9 1.9 5.5 5.3"/>'
      + '<circle cx="16.6" cy="9" r="2.6"/><path d="M15.6 14.3c2.6-.3 4.5 1.4 4.9 4.7"/>',
    book: '<path d="M4 5.5c2.7-1 5.3-1 8 .8 2.7-1.8 5.3-1.8 8-.8v13c-2.7-1-5.3-1-8 .8-2.7-1.8-5.3-1.8-8-.8z"/><path d="M12 6.3v13.5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
    speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    person: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20.5c.8-4.2 3.6-6.5 7-6.5s6.2 2.3 7 6.5"/>',
  };

  const icon = (name, className = 'icon') => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;

  return { icon };
})();
