// Wischen/Ziehen dreht den Asteroiden um die Y-Achse.
const RADIANS_PER_PX = 0.01;

/** @returns {() => void} entfernt die Listener */
export function attachDragRotate(el, onRotate) {
  let lastX = null;
  let pointer = null;
  const down = e => {
    pointer = e.pointerId;
    lastX = e.clientX;
    el.setPointerCapture(e.pointerId);
  };
  const move = e => {
    if (e.pointerId !== pointer || lastX === null) return;
    onRotate((e.clientX - lastX) * RADIANS_PER_PX);
    lastX = e.clientX;
  };
  const up = e => {
    if (e.pointerId === pointer) lastX = pointer = null;
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
}
