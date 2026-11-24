// Special-Leiste im Spiel (components/SoloGame.astro): runde Candy-Knöpfe rechts unter der Kopfzeile. Sichtbar erst,
// wenn freigeschaltet (store/progress.js → SPECIALS), je Versuch einmal einsetzbar (danach blass). Der Farbwechsel
// braucht noch ein Ziel: Knopf pulsiert, bis ein Flieger angetippt wird (nochmal tippen bricht ab).
/**
 * @param {HTMLElement} root
 * @param {{ onUse: (id: string) => void }} handlers
 */
export function createSpecials(root, { onUse }) {
  const buttons = new Map([...root.querySelectorAll('[data-special]')].map(b => [b.dataset.special, b]));
  for (const [id, button] of buttons) button.addEventListener('click', () => button.getAttribute('aria-disabled') !== 'true' && onUse(id));
  return {
    /** Stand setzen: welche freigeschaltet, welche schon eingesetzt */
    update({ unlocked, used }) {
      for (const [id, button] of buttons) {
        button.hidden = !unlocked(id);
        if (used(id)) button.setAttribute('aria-disabled', 'true');
        else button.removeAttribute('aria-disabled');
      }
    },
    /** Knopf pulsiert, solange auf ein Ziel gewartet wird (null = keiner) */
    picking(id) {
      for (const [key, button] of buttons) button.classList.toggle('is-picking', key === id);
    },
  };
}
