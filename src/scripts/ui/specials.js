// Special-Leiste im Spiel (components/SoloGame.astro): runde Candy-Knöpfe rechts unter der Kopfzeile. Immer sichtbar:
// gesperrte sind abgesoftet und füllen sich von unten mit dem Fortschritt bis zur Freischaltung (`progress` 0 … 1, siehe
// modes/solo.js – geschaffte Level plus Anteil am laufenden); erreicht die Füllung 100 %, glüht der Knopf kurz auf.
// Antippen eines gesperrten Knopfs → onLocked (Hinweis „ab Level n“). Freigeschaltet: je Versuch einmal einsetzbar
// (danach blass). Der Farbwechsel und das Zurückziehen brauchen noch ein Ziel: Knopf pulsiert, bis ein Flieger (Band
// bzw. Deck) angetippt wird (nochmal tippen bricht ab).
/**
 * @param {HTMLElement} root
 * @param {{ onUse: (id: string) => void, onLocked?: (id: string) => void }} handlers
 */
export function createSpecials(root, { onUse, onLocked = () => {} }) {
  const buttons = new Map([...root.querySelectorAll('[data-special]')].map(b => [b.dataset.special, b]));
  const filled = new Map();   // id → zuletzt gezeigte Füllung (Aufglühen nur beim Übergang auf 100 %)
  for (const [id, button] of buttons)
    button.addEventListener('click', () => {
      if (button.classList.contains('is-locked')) onLocked(id);
      else if (button.getAttribute('aria-disabled') !== 'true') onUse(id);
    });
  return {
    /** Stand setzen: welche freigeschaltet, welche schon eingesetzt, Fortschritt bis zur Freischaltung (0 … 1) */
    update({ unlocked, used, progress = id => (unlocked(id) ? 1 : 0) }) {
      for (const [id, button] of buttons) {
        const open = unlocked(id);
        const fill = open ? 1 : Math.min(1, Math.max(0, progress(id)));
        button.style.setProperty('--fill', String(fill));
        button.classList.toggle('is-locked', !open && fill < 1);
        const before = filled.get(id);
        if (before !== undefined && before < 1 && fill >= 1) {
          button.classList.remove('is-ready');
          void button.offsetWidth;   // Animation neu starten
          button.classList.add('is-ready');
        }
        filled.set(id, fill);
        if (!open || used(id)) button.setAttribute('aria-disabled', 'true');
        else button.removeAttribute('aria-disabled');
      }
    },
    /** Knopf pulsiert, solange auf ein Ziel gewartet wird (null = keiner) */
    picking(id) {
      for (const [key, button] of buttons) button.classList.toggle('is-picking', key === id);
    },
  };
}
