// Spiel-Simulation ohne Grafik – zum Austarieren des Schwierigkeitsgrads (scripts/balance.mjs) und für Tests.
// Bildet die Geometrie des Spiels nach (Körper geneigt und drehend, Kamera davor, Hangar darunter), damit Sichtbarkeit
// und Schussbahn wie im echten Spiel wirken. Das Taumeln (nur Optik) bleibt weg.
// Drehen: Die Schiffe treffen nur, was sie sehen (game.js → findTarget) – die Bots drehen die Figur deshalb wie ein
// Spieler mit dem Finger (frei in alle Richtungen, höchstens AIM_RATE); solange sie drehen, ruht die Eigendrehung.
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
//           Zielen: Steht ein Schiff ohne Ziel da, dreht er die Figur so, dass eine Fläche seiner Farbe (ganz außen)
//           zu ihm zeigt – vorstehende Blöcke zuerst (solche Flächen zeigen auch zur Kamera; auf die Winkelhalbierende
//           zwischen Schiff und Kamera zu zielen war deutlich schlechter).
//   random  dreht dazu ab und zu ziellos (Wischen in eine zufällige Richtung).
import { createGame, BELT_LENGTH } from './game.js';
import { createRng } from './rng.js';
import { hittable, openNormals, clearRay, BLAST } from './asteroid.js';

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
/** rad/s – so schnell drehen die Bots die Figur höchstens (ein zügiges Wischen) */
const AIM_RATE = 3;
/** s – so lange ruht die Eigendrehung nach dem letzten Drehen (im Spiel: Schwung + weiches Wiedereinsetzen) */
const AIM_HOLD = 1.2;
/** s ohne Schuss, ab denen der schlaue Bot einem Schiff etwas zudreht */
const AIM_IDLE = 0.2;
/** Zufalls-Bot: alle so viele s ein Wisch von WILD_TIME s in eine zufällige Richtung */
const WILD_EVERY = 2.5;
const WILD_TIME = 0.5;

// 3×3-Drehmatrizen als Zeilen-Arrays [[a,b,c],[d,e,f],[g,h,i]]
const apply = (m, [x, y, z]) => [m[0][0] * x + m[0][1] * y + m[0][2] * z, m[1][0] * x + m[1][1] * y + m[1][2] * z, m[2][0] * x + m[2][1] * y + m[2][2] * z];
const applyT = (m, [x, y, z]) => [m[0][0] * x + m[1][0] * y + m[2][0] * z, m[0][1] * x + m[1][1] * y + m[2][1] * z, m[0][2] * x + m[1][2] * y + m[2][2] * z];
const multiply = (a, b) => a.map(row => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** Drehung um die (normierte) Achse um den Winkel (Rodrigues) */
function axisAngle([x, y, z], a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}
const normalize = v => {
  const l = Math.hypot(...v) || 1;
  return v.map(c => c / l);
};
const cross = ([a, b, c], [x, y, z]) => [b * z - c * y, c * x - a * z, a * y - b * x];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Neigung (um x, wie asteroid-view TILT) */
const TILT_M = axisAngle([1, 0, 0], TILT);
const spinM = angle => axisAngle([0, 1, 0], angle);

/** Weltpunkt relativ zum Körpermittelpunkt → Voxel-Raster: Neigung, Ziehen (grab) und Eigendrehung zurückrechnen –
 *  derselbe Aufbau wie asteroid-view (tilt → grab → spin) */
function toGrid(world, grab, angle, size) {
  const [x, y, z] = applyT(spinM(angle), applyT(grab, applyT(TILT_M, world)));
  return { x: x / size, y: y / size, z: z / size };
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
  let grab = IDENTITY;   // Drehung durch Ziehen
  let angle = 0;         // Eigendrehung
  let turned = -Infinity;   // Zeit des letzten Drehens (Eigendrehung ruht danach AIM_HOLD)
  let wild = null;       // Zufalls-Bot: { axis, until }
  let nextWild = WILD_EVERY;
  const radius = Math.max(1, ...game.asteroid.voxels.map(v => Math.hypot(v.x, v.y, v.z)));
  const shipWorld = slot => [(slot - (level.slots - 1) / 2) * spacing, HANGAR_Y - BODY_Y, SLOT_Z];

  /** um eine Achse (Welt, in tilt-lokal gerechnet) drehen */
  const turn = (axisTiltLocal, a) => {
    grab = multiply(axisAngle(axisTiltLocal, a), grab);
    turned = time;
  };

  /** Schlauer Bot: steht ein Schiff ohne Ziel, die Figur so drehen, dass eine Fläche seiner Farbe zu ihm zeigt */
  function aim(dt) {
    let best = null;
    for (let slot = 0; slot < game.slots.length; slot++) {
      const e = game.slots[slot];
      if (!e || e.phase !== 'ready' || e.blocked || e.idle < AIM_IDLE || e.ship.ammo === 0) continue;
      const ship = applyT(TILT_M, shipWorld(slot));   // Schiff, tilt-lokal (Welteinheiten)
      const toCenter = normalize(ship);
      for (const v of game.asteroid.targets.get(e.ship.color) ?? []) {
        if (!v.alive || v.reserved) continue;
        // vorn liegende Blöcke bevorzugen (ragen zum Schiff hin vor – nichts verdeckt sie), Fläche möglichst zum Schiff
        const pos = apply(grab, apply(spinM(angle), [v.x * size, v.y * size, v.z * size]));
        const out = dot3(pos, toCenter) / (radius * size);
        const toShip = normalize(ship.map((c, i) => c - pos[i]));
        for (const n of openNormals(game.asteroid, v)) {
          const now = apply(grab, apply(spinM(angle), n));
          const d = dot3(now, toShip);
          const score = d + 1.5 * out;
          if ((!best || score > best.score) && clearRay(game.asteroid, v, n)) best = { score, d, now, toShip };
        }
      }
    }
    if (!best) return;
    const axis = cross(best.now, best.toShip);
    const sin = Math.hypot(...axis);
    const a = Math.atan2(sin, best.d);
    if (a < 0.05) return;
    turn(sin > 1e-6 ? axis.map(c => c / sin) : [1, 0, 0], Math.min(a, AIM_RATE * dt));
  }

  /** Zufalls-Bot: ab und zu ein Wisch in eine zufällige Richtung */
  function wildTurn(dt) {
    if (!wild && time >= nextWild) {
      wild = { axis: normalize([rng() * 2 - 1, rng() * 2 - 1, (rng() * 2 - 1) * 0.3]), until: time + WILD_TIME };
      nextWild = time + WILD_EVERY * (0.5 + rng());
    }
    if (!wild) return;
    turn(wild.axis, AIM_RATE * dt);
    if (time >= wild.until) wild = null;
  }

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
    if (bot === 'random') wildTurn(dt);
    else aim(dt);
    if (time - turned > AIM_HOLD) angle += game.spin * dt;   // wie im Spiel: je weniger übrig, desto langsamer
    const camera = toGrid([0, -BODY_Y, CAMERA_DISTANCE], grab, angle, size);
    const origin = slot => toGrid(shipWorld(slot), grab, angle, size);
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
