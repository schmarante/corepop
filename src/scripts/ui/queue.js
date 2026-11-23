// Warteschlange unten: Spalten mit Schiffen, nur das vorderste jeder Spalte ist antippbar.
//
// Nichts poppt: Jedes Schiff behält sein Element (Schlüssel = ship.id). Beim Neuzeichnen
//   - gleiten Schiffe, die nachrücken, von ihrer alten an die neue Stelle (FLIP über die CSS-Eigenschaft `translate`,
//     damit sie sich nicht mit `scale` der wartenden Schiffe und `transform` beim Drücken beißt),
//   - blenden neue Schiffe ein (aus der Tiefe der Spalte),
//   - heben gestartete bzw. übersprungene Schiffe ab und blenden aus (danach entfernt).
// Größe/Helligkeit zwischen „wartend“ und „vorne“ gehen per CSS-Transition über (global.css .ship).
import { cssColor } from '../core/colors.js';
import { BOMB_ICON, SHIP_ICON, SHIP_ICON_SIZE } from './icons.js';

const VISIBLE = 4;   // sichtbare Schiffe pro Spalte, der Rest als „+n“
const MOVE_MS = 240;
const ENTER_MS = 260;
const LEAVE_MS = 220;
const EASE = 'cubic-bezier(.2,.8,.2,1)';

/** @param {HTMLElement} el  @param {(key: string, params?: object) => string} t  @param {{ onLaunch: (column: number) => void }} handlers */
export function createQueue(el, t, { onLaunch }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** ship.id → <button> */
  const items = new Map();
  /** Spalte → { li, more } */
  const columnEls = [];

  el.addEventListener('pointerdown', e => {
    const button = e.target.closest('[data-column]');
    if (!button || button.disabled) return;
    e.preventDefault();   // kein Fokus-/Klick-Verzug auf Touch – Antippen startet sofort
    onLaunch(Number(button.dataset.column));
  });
  // Tastatur: Enter/Leertaste lösen click aus (pointerdown kommt dann nicht)
  el.addEventListener('click', e => {
    const button = e.target.closest('[data-column]');
    if (button && !button.disabled && e.detail === 0) onLaunch(Number(button.dataset.column));
  });

  const shipLabel = (key, ship) =>
    ship.special === 'bomber' ? t(key === 'game.ship' ? 'game.bomber' : 'game.bomberWaiting') : t(key, { color: t(`colors.${ship.color}`), count: ship.ammo });

  function column(ci) {
    if (!columnEls[ci]) {
      const li = document.createElement('li');
      li.className = 'flex w-16 flex-col items-center gap-1.5';
      const more = document.createElement('div');
      more.className = 'text-xs text-muted transition-opacity duration-200';
      li.append(more);
      el.append(li);
      columnEls[ci] = { li, more };
    }
    return columnEls[ci];
  }

  function createItem(ship) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ship candy';
    button.style.setProperty('--c', cssColor(ship.color));
    // Klasse sichtbar: größeres Schiff → größeres Symbol; Spreng-Flieger mit Bombe
    const icon = ship.special === 'bomber' ? BOMB_ICON : SHIP_ICON.replace('class="h-7 w-7"', `class="${SHIP_ICON_SIZE[ship.capacity] ?? 'h-6 w-6'}"`);
    button.innerHTML = `${icon}<span>${ship.ammo}</span>`;
    return button;
  }

  /** Element aus dem Fluss nehmen (absolut an seiner jetzigen Stelle) und abheben lassen */
  function leave(item) {
    const box = el.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    Object.assign(item.style, { position: 'absolute', left: `${rect.left - box.left}px`, top: `${rect.top - box.top}px`, margin: '0' });
    item.disabled = true;
    item.removeAttribute('data-column');
    el.append(item);
    if (reduced) return item.remove();
    item
      .animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -36px' }], { duration: LEAVE_MS, easing: 'ease-in', fill: 'forwards' })
      .finished.then(() => item.remove(), () => item.remove());
  }

  return {
    render(columns) {
      // FIRST: alte Positionen
      const before = new Map([...items].map(([id, item]) => [id, item.getBoundingClientRect()]));
      const shown = new Set();

      columns.forEach((ships, ci) => {
        const { li, more } = column(ci);
        ships.slice(0, VISIBLE).forEach((ship, k) => {
          shown.add(ship.id);
          let item = items.get(ship.id);
          if (!item) items.set(ship.id, (item = createItem(ship)));
          const front = k === 0;
          item.disabled = !front;
          item.classList.toggle('is-waiting', !front);
          if (front) item.dataset.column = String(ci);
          else item.removeAttribute('data-column');
          item.setAttribute('aria-label', shipLabel(front ? 'game.ship' : 'game.waiting', ship));
          if (li.children[k] !== item) li.insertBefore(item, li.children[k] ?? more);
        });
        const rest = ships.length - VISIBLE;
        if (rest > 0) more.textContent = t('game.more', { count: rest });
        more.style.opacity = rest > 0 ? '1' : '0';
      });

      for (const [id, item] of items) {
        if (shown.has(id)) continue;
        items.delete(id);
        leave(item);
      }

      if (reduced) return;
      // LAST + INVERT + PLAY
      for (const [id, item] of items) {
        const old = before.get(id);
        if (!old) {
          item.animate([{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }], { duration: ENTER_MS, easing: EASE });
          continue;
        }
        const now = item.getBoundingClientRect();
        const dx = old.left + old.width / 2 - (now.left + now.width / 2);
        const dy = old.top + old.height / 2 - (now.top + now.height / 2);
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        item.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: MOVE_MS, easing: EASE });
      }
    },
    /** kurzes Wackeln: Start nicht möglich (Hangar voll) */
    shake(columnIndex) {
      const button = el.querySelector(`[data-column="${columnIndex}"]`);
      if (!button) return;
      button.classList.remove('shake');
      void button.offsetWidth;
      button.classList.add('shake');
    },
    /** alles weg (Levelwechsel): alle Schiffe heben ab */
    clear() {
      for (const item of items.values()) leave(item);
      items.clear();
    },
  };
}
