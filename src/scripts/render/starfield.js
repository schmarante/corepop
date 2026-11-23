// Hintergrund: Sternenflug über den ganzen Bildschirm (2D-Canvas, kein three.js – läuft auch auf der Startseite).
//
// - Viele Sterne mit unterschiedlicher Größe und Helligkeit, ein paar etwas größere, besonders helle.
// - Sterne kommen aus der Tiefe auf uns zu und fließen am Bildrand an der Kamera vorbei – nichts poppt: neue Sterne
//   blenden in der Tiefe ein, und ersetzt wird ein Stern erst, wenn er das Bild verlassen hat. Damit jeder Stern das
//   Bild wirklich verlässt, entsteht keiner genau in der Mitte (sonst bliebe er dort hängen und würde nur größer).
// - Chromatische Aberration zum Rand hin: Rot-, Grün- und Blauanteil werden radial gegeneinander versetzt
//   (Rot nach außen, Blau nach innen), je weiter außen, desto stärker – wie bei einer echten Linse.
// - Bei „Bewegung reduzieren“ ein stehender Sternenhimmel.
import { startFrameLoop, BACKGROUND_FPS } from './frame-loop.js';

const COUNT = 800;
const SPEED = 0.06;          // Annäherung pro Sekunde (Tiefe 1 → 0)
const FADE_IN = 0.12;        // Tiefenbereich, in dem ein neuer Stern einblendet
const MIN_OFFSET = 0.06;     // kein Stern startet näher an der Bildmitte (Anteil der halben Bildbreite bei Tiefe 1)
const SPREAD = 0.25;         // wie weit die Sterne bei Tiefe 1 auseinanderliegen
const ABERRATION = 3.2;      // px Versatz der Farbanteile ganz am Rand (bei großen Sternen etwas mehr)
const BRIGHT_SHARE = 0.04;   // Anteil besonders heller, etwas größerer Sterne
const MAX_DPR = 1.5;         // Sterne sind weiche Punkte – volle Retina-Auflösung kostet nur Akku

export function startStarfield(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0;
  let h = 0;
  let dpr = 1;
  const stars = Array.from({ length: COUNT }, () => spawn(0.05 + Math.random() * 0.95));

  /** neuer Stern in Tiefe z: Richtung von der Mitte (nie genau mittig), eigene Größe und Helligkeit */
  function spawn(z = 1) {
    let x;
    let y;
    do {
      x = (Math.random() * 2 - 1) * 1.2;
      y = (Math.random() * 2 - 1) * 1.2;
    } while (Math.hypot(x, y) < MIN_OFFSET);
    const bright = Math.random() < BRIGHT_SHARE;
    return {
      x, y, z, born: z,
      size: bright ? 0.9 + Math.random() * 0.4 : 0.45 + Math.random() ** 2 * 0.8,   // viele kleine, wenige größere
      light: bright ? 1 : 0.3 + Math.random() * 0.6,
      bright,
    };
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, MAX_DPR);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduced) draw();
  }

  /** Bildschirmposition eines Sterns (kann außerhalb liegen) */
  const project = (s, scale) => {
    const depth = Math.max(0.005, s.z);
    return [w / 2 + (s.x / depth) * scale * SPREAD, h / 2 + (s.y / depth) * scale * SPREAD];
  };

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';   // Farbanteile addieren sich wieder zu Weiß, wo sie sich decken
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.max(w, h) * 0.5;
    const edge = Math.hypot(cx, cy);
    for (const s of stars) {
      const [px, py] = project(s, scale);
      const near = 1 - Math.min(1, s.z);   // 0 hinten … 1 ganz nah
      const fadeIn = Math.min(1, (s.born - s.z) / FADE_IN);
      const alpha = Math.min(1, (0.2 + near * 0.8) * s.light * fadeIn);
      if (alpha <= 0.01) continue;
      const size = s.size * (0.7 + near * 1.5);
      // chromatische Aberration: radialer Versatz, quadratisch zum Rand hin – höchstens knapp die halbe Sterngröße,
      // damit der Kern weiß bleibt und nur die Ränder farbig werden (statt in drei bunte Punkte zu zerfallen)
      const dx = px - cx;
      const dy = py - cy;
      const r = Math.min(1.4, Math.hypot(dx, dy) / edge);
      const offset = Math.min(size * 0.45, ABERRATION * r * r);
      ctx.globalAlpha = alpha;
      if (offset < 0.35) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
        continue;
      }
      const len = Math.hypot(dx, dy) || 1;
      const ox = (dx / len) * offset;
      const oy = (dy / len) * offset;
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(px + ox - size / 2, py + oy - size / 2, size, size);
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(px - size / 2, py - size / 2, size, size);
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(px - ox - size / 2, py - oy - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  new ResizeObserver(resize).observe(canvas);
  resize();
  canvas.classList.add('is-ready');   // weich einblenden (CSS)
  if (reduced) {
    for (const s of stars) s.born = 2;   // stehend: alle sofort voll sichtbar
    draw();
    return;
  }
  startFrameLoop(dt => {
    const scale = Math.max(w, h) * 0.5;
    const margin = 20;   // px außerhalb des Bildes, bevor ein Stern ersetzt wird (inkl. Farbversatz)
    for (const s of stars) {
      s.z -= SPEED * dt * (0.6 + (1 - Math.min(1, s.z)));   // nahe Sterne etwas schneller
      const [px, py] = project(s, scale);
      const gone = px < -margin || px > w + margin || py < -margin || py > h + margin;
      if (gone || s.z <= 0.005) Object.assign(s, spawn());
    }
    draw();
  }, { fps: BACKGROUND_FPS });
}
