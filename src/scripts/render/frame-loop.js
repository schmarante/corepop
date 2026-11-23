// Gemeinsame Render-Schleife für alle Animationen: auf eine feste Bildrate begrenzt (Akku – auch 120-Hz-Displays
// bekommen nicht mehr), pausiert von selbst, wenn der Tab im Hintergrund ist (requestAnimationFrame läuft dann nicht).
//   GAME_FPS       das Spiel (3D-Bühne) – flüssig, das ist der Hauptteil
//   BACKGROUND_FPS Sternenflug – bewegt sich langsam, 30 fps sieht man nicht; spart vor allem auf der Startseite
export const GAME_FPS = 60;
export const BACKGROUND_FPS = 30;
const MAX_DT = 0.067;   // s – nach einem Hänger höchstens zwei Bilder nachholen, nie große Sprünge

/** @param {(dt: number) => void} update  @returns {{ stop: () => void }} */
export function startFrameLoop(update, { fps }) {
  const interval = 1000 / fps;
  const slack = 4;   // ms Toleranz gegen Messrauschen: 30 fps = bei 60 Hz jedes 2. Bild, bei 120 Hz jedes 4.
  let last = performance.now();
  let frame = requestAnimationFrame(function loop(now) {
    frame = requestAnimationFrame(loop);
    if (now - last < interval - slack) return;
    const dt = Math.min(MAX_DT, (now - last) / 1000);
    last = now;
    update(dt);
  });
  return { stop: () => cancelAnimationFrame(frame) };
}
