// Gemeinsame Render-Schleife für alle Animationen: auf eine feste Bildrate begrenzt (Akku – auch 120-Hz-Displays
// bekommen nicht mehr), pausiert von selbst, wenn der Tab im Hintergrund ist (requestAnimationFrame läuft dann nicht).
//   GAME_FPS       das Spiel (3D-Bühne) – flüssig, das ist der Hauptteil
//   BACKGROUND_FPS Sternenflug – bewegt sich langsam, 30 fps sieht man nicht; spart vor allem auf der Startseite
export const GAME_FPS = 60;
export const BACKGROUND_FPS = 30;
const MAX_DT = 0.067;   // s – nach einem Hänger höchstens zwei Bilder nachholen, nie große Sprünge

const SLACK = 4;   // ms Toleranz gegen Messrauschen: 30 fps = bei 60 Hz jedes 2. Bild, bei 120 Hz jedes 4.

/** Bildabstand in ms, den die Schleife bei `fps` auf einem Display mit Bildabstand `refresh` ms erreicht
 *  (z. B. 90 Hz: jedes 2. Bild → 45 fps) */
export const loopInterval = (fps, refresh) => Math.max(1, Math.ceil((1000 / fps - SLACK) / refresh)) * refresh;

/** @param {(dt: number) => void} update  @param {{ fps: number, onTick?: (now: number) => void }} options
 *  onTick: bei jedem Bild des Displays, auch übersprungenen (misst die Bildwiederholrate)
 *  @returns {{ stop: () => void }} */
export function startFrameLoop(update, { fps, onTick }) {
  const interval = 1000 / fps;
  let last = performance.now();
  let frame = requestAnimationFrame(function loop(now) {
    frame = requestAnimationFrame(loop);
    onTick?.(now);
    if (now - last < interval - SLACK) return;
    const dt = Math.min(MAX_DT, (now - last) / 1000);
    last = now;
    update(dt);
  });
  return { stop: () => cancelAnimationFrame(frame) };
}
