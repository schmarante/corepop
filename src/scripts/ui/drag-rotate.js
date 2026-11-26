// Wischen/Ziehen dreht die Figur in alle Richtungen (waagerecht um die Hochachse, senkrecht um die Querachse – wie ein
// Trackball). `accept(e)`: nur Gesten, die dort beginnen, wo gedreht werden darf (nicht auf dem Förderband).
// Anfassen meldet onHold(true): die Figur bleibt stehen (kein Taumeln, keine Eigendrehung). Beim Loslassen meldet
// onFling die Wischgeschwindigkeit (rad/s je Achse, über die letzten Bewegungen geglättet) – die Darstellung dreht damit
// weiter, lässt sie auslaufen und fängt danach wieder an zu taumeln (onHold(false)).
const RADIANS_PER_PX = 0.01;
const SMOOTHING = 0.06;   // s – Zeitkonstante der Geschwindigkeits-Glättung
const STALE = 0.1;        // s – liegt die letzte Bewegung länger zurück, hat der Finger angehalten: kein Schwung

/**
 * @param {(x: number, y: number) => void} onRotate  während des Ziehens: Drehwinkel um die Hochachse (x, nach rechts
 *   positiv) und die Querachse (y, nach unten positiv)
 * @param {{ accept?: (e: PointerEvent) => boolean, onFling?: (x: number, y: number) => void,
 *           onHold?: (held: boolean) => void }} [options]
 * @returns {() => void} entfernt die Listener
 */
export function attachDragRotate(el, onRotate, { accept = () => true, onFling = () => {}, onHold = () => {} } = {}) {
  let last = null;
  let lastTime = 0;
  const velocity = { x: 0, y: 0 };
  let pointer = null;
  const down = e => {
    if (pointer !== null || !accept(e)) return;
    pointer = e.pointerId;
    last = { x: e.clientX, y: e.clientY };
    lastTime = e.timeStamp;
    velocity.x = velocity.y = 0;
    onFling(0, 0);   // anfassen hält die Figur an
    onHold(true);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* Zeiger schon weg – egal */
    }
  };
  const move = e => {
    if (e.pointerId !== pointer || !last) return;
    const x = (e.clientX - last.x) * RADIANS_PER_PX;
    const y = (e.clientY - last.y) * RADIANS_PER_PX;
    const dt = Math.max(0.001, (e.timeStamp - lastTime) / 1000);
    const k = 1 - Math.exp(-dt / SMOOTHING);
    velocity.x += (x / dt - velocity.x) * k;
    velocity.y += (y / dt - velocity.y) * k;
    onRotate(x, y);
    last = { x: e.clientX, y: e.clientY };
    lastTime = e.timeStamp;
  };
  const up = e => {
    if (e.pointerId !== pointer) return;
    const held = (e.timeStamp - lastTime) / 1000 > STALE;
    onFling(held ? 0 : velocity.x, held ? 0 : velocity.y);
    onHold(false);
    last = pointer = null;
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
