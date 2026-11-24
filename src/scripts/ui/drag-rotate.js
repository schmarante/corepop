// Wischen/Ziehen dreht den Asteroiden um die Y-Achse. `accept(e)`: nur Gesten, die dort beginnen, wo gedreht werden
// darf (nicht auf der Warteschlange – die schiebt man seitlich, ui/queue-input.js).
// Schwung: Beim Loslassen meldet onFling die Wischgeschwindigkeit (rad/s, über die letzten Bewegungen geglättet) –
// die Darstellung dreht damit weiter und lässt sie auslaufen. Anfassen meldet onFling(0): die Figur bleibt stehen.
const RADIANS_PER_PX = 0.01;
const SMOOTHING = 0.06;   // s – Zeitkonstante der Geschwindigkeits-Glättung
const STALE = 0.1;        // s – liegt die letzte Bewegung länger zurück, hat der Finger angehalten: kein Schwung

/**
 * @param {(radians: number) => void} onRotate  während des Ziehens
 * @param {{ accept?: (e: PointerEvent) => boolean, onFling?: (radiansPerSecond: number) => void }} [options]
 * @returns {() => void} entfernt die Listener
 */
export function attachDragRotate(el, onRotate, { accept = () => true, onFling = () => {} } = {}) {
  let lastX = null;
  let lastTime = 0;
  let velocity = 0;
  let pointer = null;
  const down = e => {
    if (pointer !== null || !accept(e)) return;
    pointer = e.pointerId;
    lastX = e.clientX;
    lastTime = e.timeStamp;
    velocity = 0;
    onFling(0);   // anfassen hält die Figur an
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* Zeiger schon weg – egal */
    }
  };
  const move = e => {
    if (e.pointerId !== pointer || lastX === null) return;
    const radians = (e.clientX - lastX) * RADIANS_PER_PX;
    const dt = Math.max(0.001, (e.timeStamp - lastTime) / 1000);
    const k = 1 - Math.exp(-dt / SMOOTHING);
    velocity += (radians / dt - velocity) * k;
    onRotate(radians);
    lastX = e.clientX;
    lastTime = e.timeStamp;
  };
  const up = e => {
    if (e.pointerId !== pointer) return;
    const held = (e.timeStamp - lastTime) / 1000 > STALE;
    onFling(held ? 0 : velocity);
    lastX = pointer = null;
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
