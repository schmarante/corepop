// Bedienung des Förderbands (3D, render/belt-view.js): Antippen eines Fliegers startet ihn auf eine freie Plattform
// (bevorzugt die darüber). Tastatur: 1 … 9 startet den n-ten sichtbaren Flieger von links.
// Welcher Flieger unter dem Finger liegt, weiß nur die Darstellung: `pick(clientX, clientY)` → { id, slot } | null
// (null = nicht über dem Band – dann gehört die Geste dem Drehen, ui/drag-rotate.js).
const TAP_SLOP = 12;   // px – mehr Bewegung ist kein Antippen mehr

/**
 * @param {HTMLElement} el  Fläche, die die Gesten bekommt (Canvas)
 * @param {{ pick: (x: number, y: number) => ({ id: number, slot: number } | null),
 *           onLaunch: (id: number, slot: number) => void, visibleIds: () => number[] }} handlers
 * @returns {() => void} entfernt die Listener
 */
export function attachBeltInput(el, { pick, onLaunch, visibleIds }) {
  let gesture = null;   // { pointer, x, y, moved }

  const down = e => {
    if (gesture || !pick(e.clientX, e.clientY)) return;
    gesture = { pointer: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  };
  const move = e => {
    if (gesture?.pointer === e.pointerId && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > TAP_SLOP) gesture.moved = true;
  };
  const up = e => {
    if (gesture?.pointer !== e.pointerId) return;
    const { moved } = gesture;
    gesture = null;
    if (moved || e.type !== 'pointerup') return;
    // erst beim Loslassen auswählen: das Band ist inzwischen weitergelaufen
    const hit = pick(e.clientX, e.clientY);
    if (hit) onLaunch(hit.id, hit.slot);
  };
  const key = e => {
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, dialog')) return;
    if (!/^[1-9]$/.test(e.key)) return;
    const id = visibleIds()[Number(e.key) - 1];
    if (id !== undefined) onLaunch(id, null);
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    removeEventListener('keydown', key);
  };
}
