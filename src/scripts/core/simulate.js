// Spiel-Simulation ohne Grafik – zum Austarieren des Schwierigkeitsgrads (scripts/balance.mjs) und für Tests.
// Bildet die Geometrie des Spiels nach (Körper geneigt und drehend, Kamera davor, Hangar darunter), damit Sichtbarkeit
// und Schussbahn wie im echten Spiel wirken. Das Taumeln (nur Optik) bleibt weg.
//
// Regel „Spalte = Plattform“ (game.js): Das vorderste Schiff einer Spalte fliegt nur auf die Plattform darüber; die
// vorderste Reihe lässt sich seitlich schieben; das Schiff am Rand ist aussortiert und weg (Reserve-Munition, fleet.js –
// reicht sie für eine Farbe nicht mehr, ist das Spiel verloren).
//
// Bots:
//   random  tippt in festem Takt, ohne nachzudenken, eine zufällige Spalte; ist die Plattform darüber belegt (oder die
//           Spalte leer), schiebt er manchmal (SLIDE_CHANCE) blind nach links oder rechts – ohne auf rote Zahlen zu achten
//   smart   schätzt je Schiff, wie viel seiner Munition es gerade loswird (Blöcke seiner Farbe ganz außen, minus was
//           Schiffe derselben Farbe im Hangar schon abräumen). Plant auf Kopien der vordersten Reihe: jetzt starten
//           oder erst 1 … LOOKAHEAD Mal schieben (Abzug je Schub, fürs Aussortieren – je mehr Reserve es verbraucht,
//           desto teurer –, stark für einen Spreng-Flieger, dessen Kristall bald erreichbar ist; nie ein Schiff, ohne
//           das seine Farbe nicht mehr reicht). Startet bevorzugt Schiffe, die leer
//           werden; wartet, solange im Hangar noch geschossen wird; schaufelt sonst frei (schiebt nutzlose Schiffe
//           weg oder opfert eine Plattform, lässt aber immer eine frei)
import { createGame } from './game.js';
import { createRng } from './rng.js';
import { hittable, voxelKey, BLAST } from './asteroid.js';

// Geometrie wie in render/stage.js + asteroid-view.js + hangar-view.js (Hochformat-Handy, ungefähr)
const TILT = 0.35;
const CAMERA_DISTANCE = 30;
const HALF_HEIGHT = CAMERA_DISTANCE * Math.tan((25 * Math.PI) / 180);
const BODY_Y = HALF_HEIGHT * 0.2;
const HANGAR_Y = -HALF_HEIGHT * 0.6;
const SLOT_Z = 2;

/** Zufalls-Bot: Ist die Plattform über der getippten Spalte belegt, schiebt er mit dieser Wahrscheinlichkeit */
const SLIDE_CHANCE = 0.3;
/** Schlauer Bot: so viele Schübe je Richtung plant er voraus, höchstens so viele führt er pro Tap aus */
const LOOKAHEAD = 8;
const SLIDES_PER_TAP = 3;
const SLIDE_COST = 0.08;
const STUCK_TAPS = 5;   // Abzug je Schub (Zeit, Umstand) – verhindert sinnloses Hin- und Herschieben

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

/** Schub wie game.slide, aber auf einer Kopie der Spalten (Schiffe selbst bleiben unverändert).
 *  @returns {{ columns: object[][], out: object | null }}  out: aussortiertes Schiff */
export function slideCopy(columns, dir) {
  const next = columns.map(c => c.slice(1));
  const fronts = columns.map(c => c[0] ?? null);
  const out = fronts[dir < 0 ? 0 : columns.length - 1];
  const moved = dir < 0 ? [...fronts.slice(1), null] : [null, ...fronts.slice(0, -1)];
  moved.forEach((ship, i) => ship && next[i].unshift(ship));
  return { columns: next, out };
}

/**
 * @param {object} level
 * @param {{ bot?: 'random' | 'smart', seed?: string, tapEvery?: number, dt?: number, maxTime?: number,
 *           onGame?: (game: object) => void }} [options]  onGame: bekommt das Spiel vorab – für Analysen (Endzustand ansehen)
 * @returns {{ won: boolean, time: number, launches: number, slides: number, left: number }}  left: übrige Voxel
 */
export function simulate(level, { bot = 'smart', seed = level.seed, tapEvery = 0.6, dt = 0.1, maxTime = 1500, onGame } = {}) {
  const game = createGame(level, { seed });
  onGame?.(game);
  const rng = createRng(`${seed}:${bot}`);
  const size = Math.min(1, 4 / level.radius);
  const spacing = Math.min(2.4, 10.5 / level.slots);
  let time = 0;
  let nextTap = 0;
  let launches = 0;
  let slides = 0;
  let lastDir = 1;
  let stuck = 0;   // Taps in Folge, in denen nichts ging (Hangar ruhig, kein Plan)

  const availableTargets = color => {
    let n = 0;
    for (const v of game.asteroid.targets.get(color) ?? []) if (v.alive && !v.reserved && hittable(game.asteroid, v)) n++;
    return n;
  };

  /** Liegt ein lebender Kristall frei oder höchstens zwei Voxel unter der Oberfläche? */
  function crystalSoon() {
    const { grid } = game.asteroid;
    for (const c of game.asteroid.crystals) {
      if (!c.alive || !c.crystal) continue;
      if (c.exposed) return true;
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = -2; dy <= 2; dy++)
          for (let dz = -2; dz <= 2; dz++) if (grid.get(voxelKey(c.x + dx, c.y + dy, c.z + dz))?.exposed) return true;
    }
    return false;
  }

  function slide(dir) {
    if (game.slide(dir)[0]?.type === 'slide') slides++;
  }

  function randomTap() {
    const column = Math.floor(rng() * game.columns.length);
    const status = game.canLaunch(column);
    if (status === 'ok' && game.launch(column).length) launches++;
    else if (status !== 'ok' && rng() < SLIDE_CHANCE) slide(rng() < 0.5 ? -1 : 1);
  }

  /** Farbe fertig: das Schiff findet nie mehr ein Ziel (gestartet blockiert es für immer) */
  const finished = ship => !!ship && !game.asteroid.aliveByColor.get(ship.color);

  function smartTap() {
    // Aufräumen: Schiffe fertiger Farben am Rand hinausschieben – kostet nichts, sie werden nie mehr gebraucht
    const n = game.columns.length;
    if (finished(game.columns[0][0])) return slide(-1);
    if (finished(game.columns[n - 1][0])) return slide(1);
    if (!game.slots.includes(null)) return;
    // „im Hangar läuft noch etwas“: Schüsse unterwegs, ein Schiff im Anflug oder eins, das gerade noch geschossen hat
    // (blockierte Schiffe zählen nicht)
    const busy = game.shots.length > 0 || game.slots.some(e => e && (e.phase !== 'ready' || e.idle < 1));
    const inHangar = color => game.slots.reduce((n, e) => n + (e && e.ship.color === color ? e.ship.ammo : 0), 0);
    const availCache = new Map();
    const avail = color => {
      if (!availCache.has(color)) availCache.set(color, Math.max(0, availableTargets(color) - inHangar(color)));
      return availCache.get(color);
    };
    /** Nutzen eines Schiffs jetzt: Anteil der Munition, den es loswird, +1 wenn es dabei leer wird (0 = nutzlos) */
    const value = ship => {
      const used = Math.min(avail(ship.color), ship.ammo);
      return used ? used / ship.ammo + (used === ship.ammo ? 1 : 0) : 0;
    };
    /** Bestes startbares Schiff (Plattform darüber frei) in einer Spaltenbelegung */
    const bestLaunch = columns => {
      let best = { column: -1, score: 0 };
      columns.forEach((c, i) => {
        if (!c.length || game.slots[i]) return;
        const score = value(c[0]);
        if (score > best.score) best = { column: i, score };
      });
      return best;
    };
    /** Kosten fürs Aussortieren (das Schiff ist weg): Nutzen + verbrauchte Reserve; ohne genug Reserve unmöglich.
     *  `spent`: in diesem Plan schon aussortierte Munition je Farbe */
    let soon = null;
    const discardCost = (ship, spent) => {
      if (!ship) return 0;
      if (finished(ship)) return -0.1;   // aufräumen
      if (ship.special === 'bomber') return 0.3 + (avail(BLAST) > 0 ? 2.5 : (soon ??= crystalSoon()) ? 1.5 : 0);
      const left = game.spare(ship.color) - (spent.get(ship.color) ?? 0);
      if (left < ship.ammo) return Infinity;
      spent.set(ship.color, (spent.get(ship.color) ?? 0) + ship.ammo);
      return value(ship) * 0.6 + 0.2 + (ship.ammo / Math.max(1, left)) * 0.6;
    };

    // Pläne: jetzt starten oder k-mal in eine Richtung schieben und dann starten
    const now = bestLaunch(game.columns);
    let plan = { dir: 0, k: 0, ...now, total: now.score };
    for (const dir of [-1, 1]) {
      let columns = game.columns;
      let cost = 0;
      const spent = new Map();
      for (let k = 1; k <= LOOKAHEAD; k++) {
        const step = slideCopy(columns, dir);
        columns = step.columns;
        cost += discardCost(step.out, spent) + SLIDE_COST - (dir === lastDir ? 0.01 : 0);
        if (cost === Infinity) break;
        const best = bestLaunch(columns);
        if (best.score > 0 && best.score - cost > plan.total) plan = { dir, k, ...best, total: best.score - cost };
      }
    }

    if (plan.score > 0 || busy) stuck = 0;
    if (plan.score > 0 && (plan.score >= 1 || !busy)) {
      if (plan.k > 0) {
        lastDir = plan.dir;
        const k = Math.min(plan.k, SLIDES_PER_TAP);
        for (let i = 0; i < k; i++) slide(plan.dir);
        if (k < plan.k) return;   // Rest beim nächsten Tap (neu geplant)
      }
      if (game.launch(plan.column).length) launches++;
      return;
    }
    if (plan.score > 0 || busy) return;   // abwarten: im Hangar wird noch freigelegt
    // Nichts in Reichweite hat ein Ziel → freischaufeln: ein nutzloses Schiff auf eine Plattform opfern (es blockiert
    // dort, bis seine Farbe auftaucht) – die Spalte, in der am wenigsten Schiffe vor einem brauchbaren stehen. Schieben
    // hilft hier nicht: Es holt nur am Rand das nächste Schiff nach vorn, tiefer in den mittleren Spalten bleibt alles
    // stehen. Ein Spreng-Flieger vorn ist schlechter (wartet auf seinen Kristall). Mindestens eine Plattform bleibt frei.
    // Geht gar nichts mehr (STUCK_TAPS Taps lang), opfert er auch die letzte Plattform – wie ein Mensch, der feststeckt
    stuck++;
    if (game.slots.filter(e => !e).length < 2 && stuck < STUCK_TAPS) return;
    let dig = -1;
    let depth = Infinity;
    game.columns.forEach((c, i) => {
      if (game.slots[i] || finished(c[0])) return;
      const k = c.findIndex(ship => value(ship) > 0) + (c[0]?.special === 'bomber' ? 0.5 : 0);
      if (k > 0 && k < depth) {
        depth = k;
        dig = i;
      }
    });
    if (dig >= 0) {
      if (game.launch(dig).length) launches++;
      return;
    }
    if (stuck < STUCK_TAPS) return;
    // festgefahren und keine freie Spalte mit Schiffen: irgendein Schiff unter eine freie Plattform bringen
    const free = game.columns.findIndex((c, i) => c.length && !game.slots[i] && !finished(c[0]));
    if (free >= 0) {
      if (game.launch(free).length) launches++;
      return;
    }
    const target = game.slots.indexOf(null);
    const from = game.columns.findIndex(c => c.length);
    if (target >= 0 && from >= 0) slide(target < from ? -1 : 1);
  }

  while (game.state === 'play' && time < maxTime) {
    if (time >= nextTap) {
      if (game.columns.some(c => c.length)) (bot === 'random' ? randomTap : smartTap)();
      nextTap = time + tapEvery;
    }
    const angle = level.spin * time;
    const camera = toGrid([0, -BODY_Y, CAMERA_DISTANCE], angle, size);
    const origin = slot => toGrid([(slot - (level.slots - 1) / 2) * spacing, HANGAR_Y - BODY_Y, SLOT_Z], angle, size);
    game.step(dt, camera, origin);
    time += dt;
  }
  return { won: game.state === 'won', time: Math.round(time), launches, slides, left: game.asteroid.alive };
}
