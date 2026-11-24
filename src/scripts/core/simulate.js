// Spiel-Simulation ohne Grafik – zum Austarieren des Schwierigkeitsgrads (scripts/balance.mjs) und für Tests.
// Bildet die Geometrie des Spiels nach (Körper geneigt und drehend, Kamera davor, Hangar darunter), damit Sichtbarkeit
// und Schussbahn wie im echten Spiel wirken. Das Taumeln (nur Optik) bleibt weg.
//
// Regel „Förderband“ (game.js): Die Schiffe fahren auf einem Band von rechts nach links; jedes sichtbare ist antippbar
// und fliegt auf irgendeine freie Plattform. Was links ankommt, fällt herunter – dank Reserve-Munition (fleet.js) meist
// verschmerzbar; fällt ein Schiff, ohne das seine Farbe nicht mehr reicht (`essential`), ist das Spiel verloren.
//
// Bots (beide tippen im Takt `tapEvery`):
//   random  tippt ohne nachzudenken ein zufälliges Schiff auf dem Band an – ein Spieler, der nicht hinschaut
//   smart   schätzt je Schiff, wie viel seiner Munition es gerade loswird (Blöcke seiner Farbe ganz außen, minus was
//           Schiffe derselben Farbe im Hangar schon abräumen; +1, wenn es dabei leer wird). Startet das nützlichste,
//           sobald eine Plattform frei ist – ein nicht ganz nützliches nur, wenn im Hangar gerade nichts mehr läuft
//           oder es wenigstens die Hälfte loswird und noch eine Plattform frei bleibt.
//           Startet nie Schiffe fertiger Farben (sie blockierten für immer). Rettet ein unverzichtbares Schiff kurz vor
//           dem Bandende auch ohne Ziel (Herunterfallen = verloren) – lässt dabei, wenn es geht, eine Plattform frei.
//           Geht länger gar nichts, schaufelt er frei: Er startet das Schiff, dessen Farbe am ehesten auftaucht.
import { createGame, BELT_LENGTH } from './game.js';
import { createRng } from './rng.js';
import { hittable, BLAST } from './asteroid.js';

// Geometrie wie in render/stage.js + asteroid-view.js + hangar-view.js (Hochformat-Handy, ungefähr)
const TILT = 0.35;
const CAMERA_DISTANCE = 30;
const HALF_HEIGHT = CAMERA_DISTANCE * Math.tan((25 * Math.PI) / 180);
const BODY_Y = HALF_HEIGHT * 0.2;
const HANGAR_Y = -HALF_HEIGHT * 0.6;
const SLOT_Z = 2;

/** Schlauer Bot: Ein unverzichtbares Schiff unter dieser Bandposition wird gerettet (gestartet), ab RESCUE_EARLY schon,
 *  wenn danach noch eine Plattform frei bleibt */
const RESCUE_AT = 1.2;
const RESCUE_EARLY = 2.5;
/** Schlauer Bot: Ist ein unverzichtbares Schiff näher als so viele Plätze am Bandende, hält er ihm eine Plattform frei */
const RESCUE_AHEAD = 4.5;
/** Schlauer Bot: so viele Taps in Folge ohne Fortschritt (Hangar ruhig, nichts Nützliches), bis er freischaufelt */
const STUCK_TAPS = 5;
/** Schlauer Bot: Wird ein Schiff mindestens diesen Anteil seiner Munition los, startet er es auch, während im Hangar
 *  noch geschossen wird – sofern danach eine Plattform frei bleibt */
const HALF_USEFUL = 0.5;
/** Schlauer Bot: Anteil der Reserve einer Farbe, ab dem ihm das Herunterfallen eines Schiffs zu teuer ist */
const COSTLY = 0.5;

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
 * @param {{ bot?: 'random' | 'smart', seed?: string, tapEvery?: number, dt?: number, maxTime?: number,
 *           onGame?: (game: object) => void }} [options]  onGame: bekommt das Spiel vorab – für Analysen (Endzustand ansehen)
 * @returns {{ won: boolean, reason: string | null, time: number, launches: number, drops: number, left: number,
 *             misfires: number, stars: number }}
 *   reason: warum verloren ('jam' | 'ammo' | 'time'), drops: heruntergefallene Schiffe, left: übrige Voxel
 */
export function simulate(level, { bot = 'smart', seed = level.seed, tapEvery = 0.6, dt = 0.1, maxTime = 3000, onGame } = {}) {
  const game = createGame(level, { seed });
  onGame?.(game);
  const rng = createRng(`${seed}:${bot}`);
  const size = Math.min(1, 4 / level.radius);
  const spacing = Math.min(2.4, 10.5 / level.slots);
  let time = 0;
  let nextTap = 0;
  let launches = 0;
  let drops = 0;
  let reason = null;
  let stuck = 0;   // Taps in Folge, in denen nichts ging (Hangar ruhig, nichts Nützliches)

  /** Schiffe auf dem sichtbaren Band (antippbar), links zuerst */
  const visible = () => game.belt.filter(item => item.pos <= BELT_LENGTH - 0.5);
  const launch = (ship, prefer = 0) => {
    if (game.launch(ship.id, prefer).length) launches++;
  };

  function randomTap() {
    const items = visible();
    if (!items.length) return;
    launch(items[Math.floor(rng() * items.length)].ship, Math.floor(rng() * game.slots.length));
  }

  /** Farbe fertig: das Schiff findet nie mehr ein Ziel (gestartet blockiert es für immer) */
  const finished = ship => !game.asteroid.aliveByColor.get(ship.color);
  /** Teuer: Fällt es herunter, ist mehr als die Hälfte der übrigen Reserve seiner Farbe weg */
  const costly = ship => ship.ammo > game.spare(ship.color) * COSTLY;

  function smartTap() {
    const free = game.slots.filter(e => !e).length;
    if (!free) return;
    const items = visible().filter(item => !finished(item.ship));
    if (!items.length) return;
    // „im Hangar läuft noch etwas“: Schüsse unterwegs, ein Schiff im Anflug oder eins, das gerade noch geschossen hat
    // (blockierte Schiffe zählen nicht)
    const busy = game.shots.length > 0 || game.slots.some(e => e && (e.phase !== 'ready' || e.idle < 1));
    const inHangar = color => game.slots.reduce((n, e) => n + (e && e.phase !== 'leaving' && e.ship.color === color ? e.ship.ammo : 0), 0);
    const availCache = new Map();
    const avail = color => {
      if (!availCache.has(color)) {
        let n = 0;
        for (const v of game.asteroid.targets.get(color) ?? []) if (v.alive && !v.reserved && hittable(game.asteroid, v)) n++;
        availCache.set(color, Math.max(0, n - inHangar(color)));
      }
      return availCache.get(color);
    };
    /** Nutzen eines Schiffs jetzt: Anteil der Munition, den es loswird, +1 wenn es dabei leer wird (0 = nutzlos) */
    const value = ship => {
      const used = Math.min(avail(ship.color), ship.ammo);
      return used ? used / ship.ammo + (used === ship.ammo ? 1 : 0) : 0;
    };

    // 1. Rettung: ein unverzichtbares Schiff fällt gleich herunter (= verloren) – starten, auch ohne Ziel
    const rescue = items.find(item => game.essential(item.ship) && (item.pos < RESCUE_AT || (item.pos < RESCUE_EARLY && free >= 2)));
    if (rescue) {
      stuck = 0;
      return launch(rescue.ship);
    }

    // 2. das nützlichste Schiff – unverzichtbare zuerst, dann teure (ihr Herunterfallen kostet viel Reserve), bei
    // Gleichstand das, das zuerst herunterfiele. Kommt ein unverzichtbares bald ans Bandende, bleibt für es eine
    // Plattform frei; ein teures Schiff kurz vor dem Ende startet er auch, wenn es nur wenig loswird.
    const urgent = items.some(item => game.essential(item.ship) && item.pos < RESCUE_AHEAD);
    let best = null;
    let bestScore = 0;
    let pressing = false;
    for (const item of items) {
      const v = value(item.ship);
      const essential = game.essential(item.ship);
      if (!v || (urgent && free < 2 && !essential)) continue;
      const weight = essential ? 0.5 : costly(item.ship) ? 0.25 : 0;
      const score = v + weight + (BELT_LENGTH - item.pos) * 0.001;
      if (score > bestScore) {
        bestScore = score;
        best = item;
        pressing = weight > 0 && item.pos < RESCUE_AHEAD;
      }
    }
    if (best || busy) stuck = 0;
    if (best && (value(best.ship) >= 1 || !busy || (free >= 2 && (pressing || value(best.ship) >= HALF_USEFUL)))) return launch(best.ship);
    if (best || busy) return;   // abwarten: im Hangar wird noch freigelegt

    // 3. Freischaufeln: Nichts auf dem Band hat ein Ziel, und im Hangar läuft nichts mehr. Meist bringt das Band bald
    // Passendes – erst nach STUCK_TAPS Taps opfert er eine Plattform (nie die letzte) für das Schiff, dessen Farbe am
    // ehesten auftaucht: viele freiliegende (aber noch verdeckte) Blöcke, sonst die flachste Schicht. Spreng-Flieger
    // nicht (die warten nur auf ihren Kristall).
    if (++stuck < STUCK_TAPS || free < 2) return;
    const minLayer = new Map();
    for (const v of game.asteroid.voxels)
      if (v.alive && !(minLayer.get(v.color) <= v.layer)) minLayer.set(v.color, v.layer);
    const closeness = color => (game.asteroid.targets.get(color)?.size ?? 0) - inHangar(color) - minLayer.get(color) * 1000;
    let dig = null;
    for (const item of items) {
      if (item.ship.color === BLAST) continue;
      if (!dig || closeness(item.ship.color) > closeness(dig.ship.color)) dig = item;
    }
    if (dig) {
      stuck = 0;
      launch(dig.ship);
    }
  }

  while (game.state === 'play' && time < maxTime) {
    if (time >= nextTap) {
      (bot === 'random' ? randomTap : smartTap)();
      nextTap = time + tapEvery;
    }
    const angle = level.spin * time;
    const camera = toGrid([0, -BODY_Y, CAMERA_DISTANCE], angle, size);
    const origin = slot => toGrid([(slot - (level.slots - 1) / 2) * spacing, HANGAR_Y - BODY_Y, SLOT_Z], angle, size);
    for (const e of game.step(dt, camera, origin)) {
      if (e.type === 'drop') drops++;
      else if (e.type === 'lost') reason = e.reason;
    }
    time += dt;
  }
  if (game.state === 'play') reason = 'time';
  return {
    won: game.state === 'won',
    reason,
    time: Math.round(time),
    launches,
    drops,
    left: game.asteroid.alive,
    misfires: game.stats.misfires,
    stars: game.stars(),
  };
}
