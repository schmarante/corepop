// Bedienung der Warteschlange (3D, render/queue-view.js): Antippen startet das vorderste Schiff einer Spalte, seitliches
// Wischen schiebt die vorderste Reihe – je Spaltenbreite Fingerweg ein Platz, so folgt die Reihe dem Finger.
// Tastatur: ← / → schieben, 1 … 9 startet die Spalte.
// Welche Spalte unter dem Finger liegt, weiß nur die Darstellung: `pick(clientX, clientY)` → { column, stepPx } | null
// (null = nicht über der Warteschlange – dann gehört die Geste dem Drehen, ui/drag-rotate.js).
const TAP_SLOP = 10;        // px – mehr Bewegung ist kein Antippen mehr
const FIRST_STEP = 0.45;    // Anteil einer Spaltenbreite bis zum ersten Schieben (danach je volle Breite)

/**
 * @param {HTMLElement} el  Fläche, die die Gesten bekommt (Canvas)
 * @param {{ pick: (x: number, y: number) => ({ column: number, stepPx: number } | null),
 *           onLaunch: (column: number) => void, onSlide: (dir: -1 | 1) => void }} handlers
 * @returns {() => void} entfernt die Listener
 */
export function attachQueueInput(el, { pick, onLaunch, onSlide }) {
  let gesture = null;   // { pointer, column, startX, anchorX, stepPx, steps, moved }

  const down = e => {
    if (gesture) return;
    const hit = pick(e.clientX, e.clientY);
    if (!hit) return;
    gesture = { pointer: e.pointerId, column: hit.column, startX: e.clientX, startY: e.clientY, anchorX: e.clientX, stepPx: Math.max(24, hit.stepPx), steps: 0, moved: false };
    el.setPointerCapture(e.pointerId);
  };
  const move = e => {
    if (!gesture || e.pointerId !== gesture.pointer) return;
    if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > TAP_SLOP) gesture.moved = true;
    // je Spaltenbreite ein Platz; der erste schon nach knapp der halben Breite
    for (;;) {
      const need = gesture.steps === 0 ? gesture.stepPx * FIRST_STEP : gesture.stepPx;
      const dx = e.clientX - gesture.anchorX;
      if (Math.abs(dx) < need) break;
      const dir = dx < 0 ? -1 : 1;
      gesture.anchorX += dir * need;
      gesture.steps++;
      onSlide(dir);
    }
  };
  const up = e => {
    if (!gesture || e.pointerId !== gesture.pointer) return;
    const { moved, column } = gesture;
    gesture = null;
    if (!moved && e.type === 'pointerup') onLaunch(column);
  };
  const key = e => {
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, dialog')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      onSlide(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (/^[1-9]$/.test(e.key)) onLaunch(Number(e.key) - 1);
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
