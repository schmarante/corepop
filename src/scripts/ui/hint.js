// Bedienhinweis über der Bühne: nur, bis zum ersten Mal ein Schiff gestartet wurde (auf diesem Gerät gemerkt),
// dann blendet er aus (CSS .reveal).
const KEY = 'corepop:hinted';

export function createHint(el) {
  let seen = false;
  try {
    seen = localStorage.getItem(KEY) === '1';
  } catch {
    /* ohne Speicher: Hinweis zeigen */
  }
  if (!seen) el.classList.add('is-ready');
  return {
    done() {
      if (seen) return;
      seen = true;
      el.classList.remove('is-ready');
      try {
        localStorage.setItem(KEY, '1');
      } catch {
        /* nicht gemerkt – kommt beim nächsten Mal wieder */
      }
    },
  };
}
