// Spiel-Simulation ohne Grafik – zum Austarieren des Schwierigkeitsgrads (scripts/balance.mjs) und für Tests.
// Bildet die Geometrie des Spiels nach (Körper geneigt und drehend, Kamera davor, Hangar darunter), damit Sichtbarkeit
// und Schussbahn wie im echten Spiel wirken. Das Taumeln (nur Optik) bleibt weg.
//
// Bots:
//   random  drückt in festem Takt eine zufällige Spalte – wie jemand, der nicht nachdenkt
//   smart   startet nur Schiffe, deren Farbe gerade freiliegende Ziele hat (und lieber Farben, die noch nicht im
//           Hangar sind); sonst wartet er
import { createGame } from './game.js';
import { createRng } from './rng.js';

// Geometrie wie in render/stage.js + asteroid-view.js + hangar-view.js (Hochformat-Handy)
const TILT = 0.35;
const CAMERA_DISTANCE = 30;
const HALF_HEIGHT = CAMERA_DISTANCE * Math.tan((25 * Math.PI) / 180);
const BODY_Y = HALF_HEIGHT * 0.2;
const HANGAR_Y = -HALF_HEIGHT * 0.6;
const SLOT_Z = 2;

/** Weltpunkt relativ zum Körpermittelpunkt → Voxel-Raster (erst Neigung, dann Drehung zurückrechnen) */
function toGrid([x, y, z], angle, size) {
  const c = Math.cos(-TILT);
  const s = Math.sin(-TILT);
  const y1 = y * c - z * s;
  const z1 = y * s + z * c;
  const ca = Math.cos(-angle);
  const sa = Math.sin(-angle);
  return { x: (x * ca + z1 * sa) / size, y: y1 / size, z: (-x * sa + z1 * ca) / size };
}

/**
 * @param {object} level
 * @param {{ bot?: 'random' | 'smart', seed?: string, tapEvery?: number, dt?: number, maxTime?: number }} [options]
 * @returns {{ won: boolean, time: number, launches: number }}
 */
export function simulate(level, { bot = 'smart', seed = level.seed, tapEvery = 0.6, dt = 0.1, maxTime = 900 } = {}) {
  const game = createGame(level, { seed });
  const rng = createRng(`${seed}:${bot}`);
  const size = Math.min(1, 3.6 / level.radius);
  const spacing = Math.min(2.4, 13 / level.slots);
  let time = 0;
  let nextTap = 0;
  let launches = 0;

  const availableTargets = color => {
    let n = 0;
    for (const v of game.asteroid.targets.get(color) ?? []) if (v.alive && !v.reserved) n++;
    return n;
  };

  function tap() {
    const columns = game.columns.map((c, i) => (c.length ? i : -1)).filter(i => i >= 0);
    if (!columns.length) return;
    if (bot === 'random') {
      if (game.launch(rng.pick(columns)).length) launches++;
      return;
    }
    if (!game.slots.includes(null)) return;
    const inHangar = color => game.slots.filter(e => e && e.ship.color === color).length;
    let best = -1;
    let bestScore = 0;
    for (const i of columns) {
      const { color, ammo } = game.columns[i][0];
      const score = Math.min(availableTargets(color), ammo) - inHangar(color) * ammo * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best >= 0 && game.launch(best).length) launches++;
  }

  while (game.state === 'play' && time < maxTime) {
    if (time >= nextTap) {
      tap();
      nextTap = time + tapEvery;
    }
    const angle = level.spin * time;
    const camera = toGrid([0, -BODY_Y, CAMERA_DISTANCE], angle, size);
    const origin = slot => toGrid([(slot - (level.slots - 1) / 2) * spacing, HANGAR_Y - BODY_Y, SLOT_Z], angle, size);
    game.step(dt, camera, origin);
    time += dt;
  }
  return { won: game.state === 'won', time, launches };
}
