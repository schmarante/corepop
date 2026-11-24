// Hintergrund: Sternenflug über den ganzen Bildschirm (2D-Canvas, kein three.js – läuft auch auf der Startseite).
//
// - Viele Sterne mit unterschiedlicher Größe und Helligkeit, ein paar etwas größere, besonders helle.
// - Sterne kommen aus der Tiefe auf uns zu und fließen am Bildrand an der Kamera vorbei – nichts poppt: neue Sterne
//   blenden in der Tiefe ein, und ersetzt wird ein Stern erst, wenn er das Bild verlassen hat. Damit jeder Stern das
//   Bild wirklich verlässt, entsteht keiner genau in der Mitte (sonst bliebe er dort hängen und würde nur größer).
// - Weiße Sterne ohne Farbversatz (chromatische Aberration zum Rand hin wieder entfernt – Wunsch des Users).
// - Bei „Bewegung reduzieren“ ein stehender Sternenhimmel.
// - Boss-Stimmung (`<html data-boss="1">`, gesetzt vom Spielmodus in Boss-Levels): langsam wabernder Plasma-Nebel in
//   Magenta, Violett und Türkis hinter den Sternen, die Sterne glühen farbig, ziehen Leuchtspuren und fliegen etwas
//   schneller. Blendet in ~1,5 s weich ein und aus (`mood` 0 … 1). Dabei blendet jeder zweite Stern aus – im Boss nur
//   halb so viele Sterne (Leuchtspuren + Schein kosten je Stern deutlich mehr).
import { startFrameLoop, BACKGROUND_FPS } from './frame-loop.js';

const COUNT = 800;
const SPEED = 0.06;          // Annäherung pro Sekunde (Tiefe 1 → 0)
const FADE_IN = 0.12;        // Tiefenbereich, in dem ein neuer Stern einblendet
const MIN_OFFSET = 0.06;     // kein Stern startet näher an der Bildmitte (Anteil der halben Bildbreite bei Tiefe 1)
const SPREAD = 0.25;         // wie weit die Sterne bei Tiefe 1 auseinanderliegen
const BRIGHT_SHARE = 0.04;   // Anteil besonders heller, etwas größerer Sterne
const MAX_DPR = 1.5;         // Sterne sind weiche Punkte – volle Retina-Auflösung kostet nur Akku
// Boss-Stimmung
const MOOD_RATE = 0.7;       // 1/s – Ein- und Ausblenden
const NEBULA = [             // Wolken: Farbe, Größe (Anteil der Bildgröße), Bahn (Frequenzen, Phase)
  { color: [255, 43, 214], size: 0.75, fx: 0.031, fy: 0.023, phase: 0 },
  { color: [122, 60, 255], size: 0.9, fx: 0.019, fy: 0.029, phase: 2.1 },
  { color: [43, 214, 255], size: 0.6, fx: 0.027, fy: 0.017, phase: 4.2 },
  { color: [255, 77, 140], size: 0.55, fx: 0.023, fy: 0.035, phase: 5.3 },
];
const NEBULA_ALPHA = 0.32;
const GLOW = ['#ff6be8', '#9b7bff', '#6be4ff', '#ffd36b'];   // Sternfarben im Boss-Level
const BOSS_SPEED = 0.7;      // so viel schneller fliegen die Sterne bei voller Stimmung
const TRAIL = 0.9;           // Länge der Leuchtspur (Anteil der Bewegung über diese Zeit in s)

export function startStarfield(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let mood = 0;   // Boss-Stimmung 0 … 1
  let time = Math.random() * 100;
  const bossWanted = () => document.documentElement.dataset.boss === '1';
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
      glow: GLOW[Math.floor(Math.random() * GLOW.length)],
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

  /** Länge der Leuchtspur (Tiefe) eines Sterns – 0 ohne Boss-Stimmung */
  const trailOf = s => Math.min(0.45, SPEED * TRAIL * (1.6 - Math.min(1, Math.max(0, s.z)))) * mood;

  /** Plasma-Nebel: weiche, langsam wandernde Farbwolken (additiv) */
  function drawNebula() {
    const base = Math.max(w, h);
    for (const n of NEBULA) {
      const x = w * (0.5 + 0.38 * Math.sin(time * n.fx * 6.283 + n.phase));
      const y = h * (0.45 + 0.32 * Math.sin(time * n.fy * 6.283 + n.phase * 1.7));
      const r = base * n.size * (0.85 + 0.15 * Math.sin(time * 0.37 + n.phase));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const [cr, cg, cb] = n.color;
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${NEBULA_ALPHA * mood})`);
      g.addColorStop(0.45, `rgba(${cr},${cg},${cb},${NEBULA_ALPHA * 0.45 * mood})`);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';   // Licht addiert sich (Nebel, Leuchtspuren, Sterne)
    if (mood > 0.01) drawNebula();
    const scale = Math.max(w, h) * 0.5;
    for (let k = 0; k < stars.length; k++) {
      const s = stars[k];
      // Boss: jeder zweite Stern blendet mit der Stimmung aus (und wird dann gar nicht gezeichnet)
      const thin = k & 1 ? 1 - mood : 1;
      if (thin <= 0.01) continue;
      const [px, py] = project(s, scale);
      const near = 1 - Math.min(1, Math.max(0, s.z));   // 0 hinten … 1 ganz nah (dahinter: Spur läuft noch aus)
      const fadeIn = Math.min(1, (s.born - s.z) / FADE_IN);
      const alpha = Math.min(1, (0.2 + near * 0.8) * s.light * fadeIn) * thin;
      if (alpha <= 0.01) continue;
      const size = s.size * (0.7 + near * 1.5);
      ctx.globalAlpha = alpha;
      // Boss: Stern glüht farbig und zieht eine Leuchtspur zur Mitte hin (dorthin, wo er herkommt)
      if (mood > 0.01) {
        const back = { x: s.x, y: s.y, z: s.z + trailOf(s) };
        const [bx, by] = project(back, scale);
        ctx.globalAlpha = alpha * mood;
        ctx.strokeStyle = s.glow;
        ctx.lineWidth = size * (1 + mood * 0.8);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.fillStyle = s.glow;
        const halo = size * (2.2 + near * 2) * mood;
        ctx.globalAlpha = alpha * mood * 0.35;
        ctx.fillRect(px - halo / 2, py - halo / 2, halo, halo);
        ctx.globalAlpha = alpha;
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  new ResizeObserver(resize).observe(canvas);
  resize();
  canvas.classList.add('is-ready');   // weich einblenden (CSS)
  if (reduced) {
    for (const s of stars) s.born = 2;   // stehend: alle sofort voll sichtbar
    // Boss-Stimmung ohne Bewegung: Nebel steht, wird beim Wechsel neu gezeichnet
    new MutationObserver(() => {
      mood = bossWanted() ? 1 : 0;
      draw();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-boss'] });
    mood = bossWanted() ? 1 : 0;
    draw();
    return;
  }
  startFrameLoop(dt => {
    time += dt;
    mood += ((bossWanted() ? 1 : 0) - mood) * (1 - Math.exp(-MOOD_RATE * dt));
    const scale = Math.max(w, h) * 0.5;
    const margin = 20;   // px außerhalb des Bildes, bevor ein Stern ersetzt wird
    const outside = ([px, py]) => px < -margin || px > w + margin || py < -margin || py > h + margin;
    const tail = { x: 0, y: 0, z: 0 };
    for (const s of stars) {
      s.z -= SPEED * dt * (0.6 + (1 - Math.min(1, s.z))) * (1 + BOSS_SPEED * mood);   // nahe Sterne etwas schneller
      // ersetzt wird erst, wenn auch das Ende der Leuchtspur draußen ist – sonst risse die Spur mitten im Bild ab
      // (der Kopf bleibt dafür nah an der Kamera stehen: project begrenzt die Tiefe)
      tail.x = s.x;
      tail.y = s.y;
      tail.z = s.z + trailOf(s);
      const gone = outside(project(s, scale)) && outside(project(tail, scale));
      if (gone || s.z < -1) Object.assign(s, spawn());
    }
    draw();
  }, { fps: BACKGROUND_FPS });
}
