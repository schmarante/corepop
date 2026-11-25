// Spielablauf als reine Logik (ohne Grafik, ohne DOM, deterministisch per Seed).
//
//   const game = createGame(LEVELS[0]);
//   game.launch(shipId, prefer)    → Schiff vom Förderband auf eine freie Plattform (bevorzugt Slot `prefer`)
//   game.step(dt, camera, origin)  → Zeit vorspulen (Band läuft, Schiffe schießen); liefert Ereignisse für Darstellung,
//                                    UI und später das Netzwerk
//   game.special(id, …)            → Special einsetzen (je Versuch einmal): 'pad' | 'recolor' | 'nova' | 'recall'
//   game.stars()                   → 0 … 3 Sterne (nach dem Sieg), aus game.stats
//
// Förderband: Unter dem Deck läuft ein Band mit BELT_LENGTH sichtbaren Plätzen nach links (Platz 0 = Bandende links,
// BELT_LENGTH − 1 = Einfahrt rechts; Tempo `level.belt` Plätze/s). Neue Schiffe kommen rechts aus der Luke (`queue`),
// je ein Platz Abstand; nimmt man eines heraus, rutschen die dahinter schnell auf (BELT_CATCHUP – Stauband: der vorderste
// fährt im normalen Tempo weiter, Lücken schließen sich, Nachschub kommt sofort). Jedes Schiff auf dem Band ist antippbar und fliegt
// auf irgendeine freie Plattform. Was links ankommt, fällt herunter und ist weg (Ereignis 'drop'). Die Flotte hat
// etwas Reserve-Munition (fleet.js); fällt ein Schiff, ohne das seine Farbe nicht mehr reicht (`essential` – die
// Darstellung warnt), ist das Spiel verloren. Ein heruntergefallener Spreng-Flieger entschärft einen Kristall (defuse).
//
// Ist eine Farbe fertig, bleiben ihre übrigen Schiffe (Reserve, Bruchstücke) auf dem Band – eine Falle: Gestartet
// finden sie nie ein Ziel und blockieren ihre Plattform für immer (`doomed`); man lässt sie besser herunterfallen.
// Schiffe, die schon auf der Plattform stehen, wenn ihre Farbe fertig wird, fliegen dagegen ab.
//
// Knobel-Regel „Hangar = Engpass“: Ein Schiff bleibt auf seiner Plattform, bis seine Munition leer ist. Findet es kein
// Ziel ganz außen, steht es blockiert herum (BLOCKED_AFTER, für die Darstellung) und belegt die Plattform, bis seine
// Farbe wieder außen auftaucht. Sind alle Plattformen mit blockierten Schiffen belegt → verloren. Wer ein Schiff
// startet, dessen Farbe gerade kaum außen liegt, verschenkt also eine Plattform – man muss hinschauen und planen.
//
// `camera`: Kameraposition im Asteroiden-Raster (lokale Koordinaten, 1 = ein Voxel), siehe asteroid.js → facing().
// `origin(slot)`: Position des Schiffs in diesem Slot, ebenfalls im Raster.
//
// Zielregel „ganz außen“: Ein Block ist treffbar, wenn vor einer seiner freien Flächen in gerader Linie nichts mehr bis
// nach draußen liegt (asteroid.js → clearRay) – wie der erste Pixel einer Reihe. Die Wände eines Lochs zählen nicht,
// man trägt Schicht für Schicht ab. Geschossen wird mit Lenkgeschossen, die außen herum fliegen und durch genau diese
// Fläche eintreten (shot.normal) – nie durch den Körper. Flächen, die zur Kamera (die Spieler sehen sie) oder zum
// Schiff zeigen, kommen zuerst dran; so spielt die Drehung für die Reihenfolge eine Rolle.
//
// Ereignisse (game.step / game.launch):
//   { type: 'launch', ship, slot }        Schiff fliegt vom Band in Slot `slot`
//   { type: 'drop', ship }                Schiff ist am Bandende heruntergefallen (weg)
//   { type: 'defuse', crystal, ship }      Kristall entschärft (Spreng-Flieger heruntergefallen): jetzt normaler Block,
//                                         `ship` trägt den Schuss dafür (Munition +1)
//   { type: 'fire', ship, slot, shot }     Schuss auf shot.voxel
//   { type: 'hit', shot, voxel }          Voxel zerstört
//   { type: 'fizzle', shot }              Ziel war schon weg (mit einem Bruchstück abgesprengt) – Schuss verpufft
//   { type: 'break', crystal, voxels, energy, mass }  Sprengsatz: `voxels` fliegen weg; je Voxel Restenergie und
//                                         Masse (innen schwerer) → Tempo √(2E/m)
//   { type: 'leave', ship, slot }         Munition leer (oder Farbe weg), Schiff fliegt ab
//   { type: 'free', slot }                Slot wieder frei
//   { type: 'pad', slot }                 Special: Zusatz-Plattform `slot`
//   { type: 'recolor', ship, voxels, color }  Special Farbwechsel: `voxels` haben jetzt `color`, `ship` +Munition
//   { type: 'recall', ship, slot }        Special Zurückziehen: Schiff verlässt Slot `slot`, kommt als nächstes aus
//                                         der Luke wieder aufs Band (Restmunition bleibt)
//   { type: 'won' }
//   { type: 'lost', reason, color? }      reason 'jam': alle Plattformen mit blockierten Schiffen belegt;
//                                         'ammo': für `color` reicht die Munition nicht mehr (Schiff heruntergefallen)

import { createRng } from './rng.js';
import { createAsteroid, removeVoxel, openNormals, clearRay, hittable, blastReach, blastPower, BLAST } from './asteroid.js';
import { createFleet } from './fleet.js';

export const TIMING = {
  arrive: 0.45,    // s vom Antippen bis schussbereit
  fireEvery: 0.06, // s zwischen zwei Schüssen eines Schiffs
  shot: 0.28,      // s Flugzeit eines Schusses
  leave: 0.7,      // s bis ein leeres Schiff den Slot freigibt
  stuck: 0.8,      // s mit lauter blockierten Schiffen im vollen Hangar, bis das Spiel verloren ist
  search: 0.15,    // s bis ein Schiff ohne Ziel erneut sucht (spart Rechenzeit)
};
/** Mindest-Skalarprodukt Flächennormale · Richtung zur Kamera, damit ein Voxel als „sichtbar“ gilt */
export const FACING = 0.2;
const AIM_JITTER = 0.3;   // etwas Zufall bei der Zielwahl, damit nicht alle Schiffe dasselbe Muster schießen
const CRYSTAL_PRIORITY = 1;   // ein sichtbarer Kristall wird vor allen anderen Zielen beschossen
/** Förderband: sichtbare Plätze, Standard-Tempo (Plätze/s, Level: `belt`), Abstand des ersten Schiffs zum Ende */
export const BELT_LENGTH = 8;
export const DEFAULT_BELT_SPEED = 0.2;
/** Plätze/s, mit denen Schiffe hinter einer Lücke aufrutschen (bis ein Platz Abstand zum Vordermann). Vorher blieben
 *  Lücken stehen – neue Schiffe kamen nur im Bandtempo nach (Tempo 0,25: alle 4 s eins), man wartete auf Nachschub. */
export const BELT_CATCHUP = 2.5;
/** nur aufrutschen, solange weniger Schiffe auf dem Band liegen UND eine Plattform frei ist (man also wartet) – immer
 *  aufrutschen hielt das Band voll, am Ende fiel im Bandtempo ständig eins herunter (gemessen: schlauer Bot gewann den
 *  Boss nur noch 17–67 % statt 100 %, weil wichtige Schiffe fielen, während die Plattformen besetzt waren) */
export const BELT_MIN = 4;
const BELT_START = 2.5;   // erstes Schiff startet so weit vom Bandende – etwas Zeit zum Umschauen
const DROP_AT = -0.5;     // Position, an der ein Schiff herunterfällt (halb über die Kante)
/** Sterne: höchstens so viele Fehlstarts (gestartete Schiffe, die blockiert stehen blieben) für ★★ bzw. ★★★ */
export const STAR_TWO = 4;
export const STAR_THREE = 1;
/** Specials: so viele Blöcke färbt der Farbwechsel höchstens um; so viel stärker als ein Kristall ist die Supernova */
const RECOLOR_MAX = 60;
const NOVA_POWER = 2.6;   // Level 4: ~50 % der Blöcke, Piratenschiff (Boss): ~31 % (früher 1,9: 27 % / 15 %)
/** Eigendrehung, wenn fast nichts mehr übrig ist (Anteil von level.spin) – game.spin */
export const SPIN_MIN = 0.35;
/** s ohne Ziel, ab denen ein Schiff als blockiert gilt (Darstellung: Plattform warnt, Schiff dimmt) */
export const BLOCKED_AFTER = 0.6;

/**
 * @param {object} level  Eintrag aus LEVELS
 * @param {{ seed?: string | number }} [options]  Seed überschreibt level.seed (Battle: gemeinsamer Seed)
 */
export function createGame(level, { seed = level.seed } = {}) {
  const rng = createRng(seed);
  const asteroid = createAsteroid(level, rng);
  const queue = createFleet(asteroid, level, rng);   // Luke: Schiffe, die noch aufs Band kommen
  /** @type {{ ship: object, pos: number }[]} Band, nach Position (0 = Bandende links) */
  const belt = [];
  const beltSpeed = level.belt ?? DEFAULT_BELT_SPEED;
  for (let pos = BELT_START; pos < BELT_LENGTH && queue.length; pos++) belt.push({ ship: queue.shift(), pos });
  const aimRng = createRng(`${seed}:aim`);   // eigener Strom: Zielwahl verändert die Level-Erzeugung nicht

  /** @type {(null | { ship, phase: 'arriving' | 'ready' | 'leaving', t: number, cooldown: number, inFlight: number,
   *                    idle: number })[]}  idle: s seit dem letzten Schuss (≥ BLOCKED_AFTER → blockiert) */
  const slots = new Array(level.slots).fill(null);
  const used = new Set();   // eingesetzte Specials (je Versuch einmal)
  /** Auswertung: Fehlstarts (gestartet, dann blockiert), heruntergefallene Munition, verlorene Spreng-Flieger */
  const stats = { misfires: 0, dropped: 0, bombersLost: 0 };
  const shooter = new WeakMap();   // Schuss → Slot-Eintrag des Schiffs (der Slot kann inzwischen frei sein: Zurückziehen)
  /** alle wartenden Schiffe: auf dem Band, dann in der Luke (hinterstes zuletzt) */
  const waiting = () => [...belt.map(item => item.ship), ...queue];
  let shots = [];
  let nextShot = 0;
  let stuckFor = 0;
  let state = 'play';   // 'play' | 'won' | 'lost'

  /** Bestes Ziel samt Eintrittsfläche, oder null: freiliegend, und vor der Fläche liegt in gerader Linie nichts mehr
   *  (clearRay – „ganz außen“). Flächen zur Kamera oder zum Schiff kommen zuerst dran (Wertung), die anderen
   *  erreicht das Lenkgeschoss außen herum. Die Linie wird nur geprüft, wenn der Kandidat besser wäre. */
  function findTarget(color, camera, from) {
    let best = null;
    let bestScore = -Infinity;
    const points = from ? [camera, from] : [camera];
    for (const v of asteroid.targets.get(color) ?? []) {
      if (!v.alive || v.reserved) continue;
      const bonus = aimRng() * AIM_JITTER + (v.crystal ? CRYSTAL_PRIORITY : 0);
      for (const n of openNormals(asteroid, v))
        for (const p of points) {
          const dx = p.x - v.x;
          const dy = p.y - v.y;
          const dz = p.z - v.z;
          const dot = (n[0] * dx + n[1] * dy + n[2] * dz) / (Math.hypot(dx, dy, dz) || 1);
          // zur Kamera/zum Schiff gewandt: Vorrang; sonst hinten anstellen
          const score = (dot >= FACING ? dot : dot - 2) + bonus;
          if (score <= bestScore || !clearRay(asteroid, v, n)) continue;
          bestScore = score;
          best = { voxel: v, normal: n };
        }
    }
    return best;
  }

  const hasAnyTarget = color => {
    for (const v of asteroid.targets.get(color) ?? []) if (v.alive && !v.reserved && hittable(asteroid, v)) return true;
    return false;
  };
  const colorGone = color => asteroid.aliveByColor.get(color) === 0;

  /** Kristall getroffen: Sprengsatz – alle Voxel, bei denen noch Energie ankommt (asteroid.js → blastReach), fliegen
   *  weg. Erreicht die Druckwelle einen weiteren Kristall, geht der auch hoch. */
  function breakOff(crystal, events) {
    const hits = blastReach(asteroid, crystal, blastPower(level));
    for (const { voxel } of hits) removeVoxel(asteroid, voxel);
    events.push({ type: 'break', crystal, voxels: hits.map(h => h.voxel), energy: hits.map(h => h.energy), mass: hits.map(h => h.mass) });
    for (const { voxel } of hits) if (voxel.crystal) breakOff(voxel, events);
  }

  /** Munition aller Schiffe einer Farbe (Warteschlange + Hangar) */
  function ammoOf(color) {
    let n = 0;
    for (const ship of waiting()) if (ship.color === color) n += ship.ammo;
    for (const e of slots) if (e && e.phase !== 'leaving' && e.ship.color === color) n += e.ship.ammo;
    return n;
  }
  /** So viele Schüsse braucht eine Farbe noch (lebende Voxel ohne die, auf die schon ein Schuss fliegt) */
  function needOf(color) {
    let n = asteroid.aliveByColor.get(color) ?? 0;
    for (const shot of shots) if (shot.voxel.alive && shot.voxel.color === color) n--;
    return n;
  }
  /** Munition übrig über den Bedarf hinaus (Spreng-Farbe: Kristalle entschärfen sich beim Herunterfallen, nie knapp) */
  const spare = color => (color === BLAST ? Infinity : ammoOf(color) - needOf(color));

  /** Ein Spreng-Flieger ist heruntergefallen: Einer seiner Kristalle (bevorzugt einer, der noch nicht freiliegt) wird zum
   *  normalen Block seiner Schichtfarbe – sonst bliebe er unzerstörbar. Den Schuss dafür bekommt das hinterste Schiff
   *  dieser Farbe (Munition = Voxelzahl bleibt exakt). Gibt es keins mehr, zerfällt der Kristall einfach. */
  function defuse(events) {
    const left = asteroid.crystals.filter(c => c.alive && c.crystal && !c.reserved);
    const crystal = left.find(c => !hittable(asteroid, c)) ?? left[0];
    if (!crystal) return;
    const color = crystal.baseColor;
    let carrier = null;
    for (const ship of waiting()) if (ship.color === color) carrier = ship;   // das hinterste
    carrier ??= slots.find(e => e && e.phase !== 'leaving' && e.ship.color === color)?.ship ?? null;
    if (!carrier) {
      removeVoxel(asteroid, crystal);
      events.push({ type: 'hit', shot: null, voxel: crystal });
      return;
    }
    asteroid.aliveByColor.set(BLAST, asteroid.aliveByColor.get(BLAST) - 1);
    asteroid.aliveByColor.set(color, (asteroid.aliveByColor.get(color) ?? 0) + 1);
    asteroid.targets.get(BLAST).delete(crystal);
    if (crystal.exposed) asteroid.targets.get(color).add(crystal);
    Object.assign(crystal, { color, crystal: false });
    carrier.ammo++;
    events.push({ type: 'defuse', crystal, ship: carrier });
  }

  return {
    level,
    asteroid,
    /** Förderband ({ ship, pos }, nach Position) und Luke (Schiffe, die noch kommen) – nur lesen */
    belt,
    queue,
    beltSpeed,
    slots,
    get state() {
      return state;
    },
    get shots() {
      return shots;
    },
    get destroyed() {
      return asteroid.total - asteroid.alive;
    },
    /** Eigendrehung jetzt (rad/s): je weniger Würfel übrig, desto langsamer (sie verliert Masse) – bis SPIN_MIN */
    get spin() {
      return level.spin * (SPIN_MIN + (1 - SPIN_MIN) * (asteroid.alive / asteroid.total));
    },

    /** Wird dieses Schiff noch gebraucht (ohne es hätte seine Farbe zu wenig Munition)? Herunterfallen = verloren. */
    essential(ship) {
      return !!ship && spare(ship.color) < ship.ammo;
    },
    /** Munition einer Farbe über den Bedarf hinaus (Reserve, die noch herunterfallen darf) */
    spare,

    /** Kann dieses Schiff vom Band starten? 'ok' | 'full' (keine Plattform frei) | 'gone' (nicht auf dem Band) | 'over' */
    canLaunch(shipId) {
      if (state !== 'play') return 'over';
      if (!belt.some(item => item.ship.id === shipId && item.pos <= BELT_LENGTH - 0.5)) return 'gone';
      return slots.includes(null) ? 'ok' : 'full';
    },

    /**
     * Startet ein Schiff vom Band auf eine freie Plattform – `prefer` (z. B. die darüber), sonst die nächste freie.
     * @returns {object[]} Ereignisse (leer, wenn nicht möglich)
     */
    launch(shipId, prefer = 0) {
      if (this.canLaunch(shipId) !== 'ok') return [];
      let slot = -1;
      for (let d = 0; d < slots.length * 2 && slot < 0; d++) {
        const i = prefer + (d % 2 ? -(d + 1) / 2 : d / 2);   // prefer, prefer−1, prefer+1, prefer−2, …
        if (i >= 0 && i < slots.length && !slots[i]) slot = i;
      }
      if (slot < 0) slot = slots.indexOf(null);
      const index = belt.findIndex(item => item.ship.id === shipId);
      const [{ ship }] = belt.splice(index, 1);
      // doomed: seine Farbe ist schon fertig – es findet nie ein Ziel und blockiert die Plattform für immer
      slots[slot] = { ship, phase: 'arriving', t: 0, cooldown: 0, inFlight: 0, idle: 0, doomed: colorGone(ship.color), misfire: false };
      return [{ type: 'launch', ship, slot }];
    },

    /** Auswertung (für Sterne und Anzeige) */
    get stats() {
      return stats;
    },
    /**
     * Sterne nach dem Sieg (sonst 0): ★ geschafft · ★★ höchstens STAR_TWO Fehlstarts ·
     * ★★★ höchstens STAR_THREE Fehlstarts und kein Spreng-Flieger heruntergefallen
     */
    stars() {
      if (state !== 'won') return 0;
      if (stats.misfires <= STAR_THREE && stats.bombersLost === 0) return 3;
      return stats.misfires <= STAR_TWO ? 2 : 1;
    },
    /** Specials, die in diesem Versuch schon eingesetzt wurden */
    get usedSpecials() {
      return used;
    },
    /**
     * Special einsetzen (je Versuch einmal; ob es freigeschaltet ist, prüft der Modus):
     *   'pad'                      Zusatz-Plattform
     *   'recolor', shipId          die äußersten Blöcke anderer Farben werden zur Farbe dieses Schiffs auf dem Band –
     *                              so viele, wie es Munition hat (höchstens RECOLOR_MAX; es bekommt die Schüsse dazu)
     *   'nova', camera             Riesen-Explosion am Punkt der Figur, der am weitesten zur Kamera zeigt
     *   'recall', slot             Schiff auf dieser Plattform zurückziehen (z. B. blockiert): fliegt zur Luke und
     *                              kommt als nächstes wieder aufs Band – nur schussbereit (nicht beim Landen/Abflug)
     * @returns {object[]} Ereignisse (leer, wenn nicht möglich)
     */
    special(id, arg) {
      const events = [];
      if (state !== 'play' || used.has(id)) return events;
      if (id === 'pad') {
        slots.push(null);
        events.push({ type: 'pad', slot: slots.length - 1 });
      } else if (id === 'recolor') {
        const ship = belt.find(item => item.ship.id === arg)?.ship;
        if (!ship || ship.special) return events;
        // die äußersten Blöcke (treffbar), Hülle zuerst – keine Kristalle, nicht die eigene Farbe
        const candidates = [];
        for (const [color, list] of asteroid.targets)
          if (color !== ship.color && color !== BLAST)
            for (const v of list) if (v.alive && !v.reserved && hittable(asteroid, v)) candidates.push(v);
        candidates.sort((a, b) => a.layer - b.layer || a.i - b.i);
        const voxels = candidates.slice(0, Math.min(ship.ammo, RECOLOR_MAX));
        if (!voxels.length) return events;
        for (const v of voxels) {
          asteroid.aliveByColor.set(v.color, asteroid.aliveByColor.get(v.color) - 1);
          asteroid.targets.get(v.color).delete(v);
          v.color = ship.color;
          asteroid.aliveByColor.set(v.color, (asteroid.aliveByColor.get(v.color) ?? 0) + 1);
          asteroid.targets.get(v.color).add(v);
        }
        ship.ammo += voxels.length;
        events.push({ type: 'recolor', ship, voxels, color: ship.color });
      } else if (id === 'nova') {
        // Mittelpunkt: der lebende Voxel, der am weitesten zur Kamera hin liegt
        const len = Math.hypot(arg.x, arg.y, arg.z) || 1;
        let center = null;
        let best = -Infinity;
        for (const v of asteroid.voxels) {
          if (!v.alive) continue;
          const d = (v.x * arg.x + v.y * arg.y + v.z * arg.z) / len;
          if (d > best) {
            best = d;
            center = v;
          }
        }
        if (!center) return events;
        removeVoxel(asteroid, center);
        events.push({ type: 'hit', shot: null, voxel: center });
        const hits = blastReach(asteroid, center, blastPower(level) * NOVA_POWER);
        for (const { voxel } of hits) removeVoxel(asteroid, voxel);
        events.push({ type: 'break', crystal: center, voxels: hits.map(h => h.voxel), energy: hits.map(h => h.energy), mass: hits.map(h => h.mass), nova: true });
        for (const { voxel } of hits) if (voxel.crystal) breakOff(voxel, events);
      } else if (id === 'recall') {
        const entry = slots[arg];
        if (!entry || entry.phase !== 'ready') return events;   // Schüsse in der Luft fliegen weiter
        slots[arg] = null;
        queue.unshift(entry.ship);   // nächster aus der Luke
        events.push({ type: 'recall', ship: entry.ship, slot: arg });
      } else return events;
      used.add(id);
      return events;
    },

    /** Test-Hilfe (Taste W): räumt alle Voxel ab – das nächste step meldet 'won'. Keine Ereignisse je Voxel (die
     *  Darstellung lässt den ganzen Körper wegschrumpfen). @returns {boolean} ob etwas passiert ist */
    clearAll() {
      if (state !== 'play') return false;
      for (const v of asteroid.voxels) if (v.alive) removeVoxel(asteroid, v);
      return true;
    },

    /**
     * Zündet einen Kristall sofort (ohne Schiff) – für Test-Hilfen (Taste B) und später Booster wie eine Bombe.
     * @returns {object[]} Ereignisse (hit, break …)
     */
    detonate(crystal) {
      const events = [];
      if (state !== 'play' || !crystal?.alive) return events;
      removeVoxel(asteroid, crystal);
      events.push({ type: 'hit', shot: null, voxel: crystal });
      breakOff(crystal, events);
      return events;
    },

    /** Spielzeit vorspulen. @returns {object[]} Ereignisse in dieser Reihenfolge */
    step(dt, camera, origin) {
      const events = [];
      if (state !== 'play') return events;

      // Förderband: läuft nach links; rechts kommen neue Schiffe aus der Luke (je ein Platz Abstand), links fallen sie
      const sparse = belt.filter(item => item.pos <= BELT_LENGTH - 0.5).length < BELT_MIN && slots.some(e => !e);
      for (let k = 0; k < belt.length; k++) {
        const item = belt[k];
        item.pos -= beltSpeed * dt;
        // Stauband (nur wenn wenig auf dem Band liegt): hinter einer Lücke schnell aufrutschen, nie näher als ein Platz
        // an den Vordermann; der vorderste fährt im Bandtempo
        if (k === 0 || !sparse) continue;
        const close = belt[k - 1].pos + 1;
        if (item.pos > close) item.pos = Math.max(close, item.pos - BELT_CATCHUP * dt);
      }
      while (queue.length && (!belt.length || belt.at(-1).pos + 1 <= BELT_LENGTH))
        belt.push({ ship: queue.shift(), pos: Math.max(BELT_LENGTH, (belt.at(-1)?.pos ?? 0) + 1) });
      while (belt.length && belt[0].pos < DROP_AT) {
        const { ship } = belt.shift();
        events.push({ type: 'drop', ship });
        if (ship.special === 'bomber') {
          stats.bombersLost++;
          defuse(events);
        } else {
          stats.dropped += ship.ammo;
          // reicht die Munition seiner Farbe nicht mehr, ist das Spiel nicht mehr zu gewinnen
          if ((asteroid.aliveByColor.get(ship.color) ?? 0) > 0 && spare(ship.color) < 0) {
            state = 'lost';
            events.push({ type: 'lost', reason: 'ammo', color: ship.color });
            return events;
          }
        }
      }

      slots.forEach((entry, slot) => {
        if (!entry) return;
        entry.t += dt;
        if (entry.phase === 'arriving') {
          if (entry.t >= TIMING.arrive) Object.assign(entry, { phase: 'ready', t: 0 });
        } else if (entry.phase === 'ready') {
          entry.cooldown -= dt;
          entry.idle += dt;   // seit dem letzten Schuss (wird beim Schießen zurückgesetzt)
          // Fehlstart (für die Sterne): steht mit Munition blockiert da – einmal je Schiff gezählt
          if (!entry.misfire && entry.idle >= BLOCKED_AFTER && entry.ship.ammo > 0) {
            entry.misfire = true;
            stats.misfires++;
            events.push({ type: 'blocked', ship: entry.ship, slot });
          }
          if (entry.ship.ammo > 0 && entry.cooldown <= 0) {
            const target = findTarget(entry.ship.color, camera, origin?.(slot));
            if (!target) entry.cooldown = TIMING.search;
            else {
              const { voxel, normal } = target;
              voxel.reserved = true;
              entry.ship.ammo--;
              entry.inFlight++;
              entry.cooldown = TIMING.fireEvery;
              entry.idle = 0;
              const shot = { id: nextShot++, slot, voxel, normal, t: 0 };   // normal: Eintrittsfläche (Raster)
              shooter.set(shot, entry);
              shots.push(shot);
              events.push({ type: 'fire', ship: entry.ship, slot, shot });
            }
          }
          // leer – oder seine Farbe wurde fertig, während es hier stand (Reserve, Bruchstücke): dann fliegt es ab
          if ((entry.ship.ammo === 0 || (colorGone(entry.ship.color) && !entry.doomed)) && entry.inFlight === 0) {
            Object.assign(entry, { phase: 'leaving', t: 0 });
            events.push({ type: 'leave', ship: entry.ship, slot });
          }
        } else if (entry.t >= TIMING.leave) {
          slots[slot] = null;
          events.push({ type: 'free', slot });
        }
      });

      shots = shots.filter(shot => {
        shot.t += dt / TIMING.shot;
        if (shot.t < 1) return true;
        shooter.get(shot).inFlight--;
        if (!shot.voxel.alive) {
          events.push({ type: 'fizzle', shot });
          return false;
        }
        removeVoxel(asteroid, shot.voxel);
        events.push({ type: 'hit', shot, voxel: shot.voxel });
        if (shot.voxel.crystal) breakOff(shot.voxel, events);
        return false;
      });

      if (asteroid.alive === 0) {
        state = 'won';
        events.push({ type: 'won' });
        return events;
      }

      // Verloren: alle Plattformen mit schussbereiten Schiffen belegt, und keines hat ein Ziel ganz außen
      const jammed = shots.length === 0 && slots.every(e => e && e.phase === 'ready' && e.ship.ammo > 0 && !hasAnyTarget(e.ship.color));
      stuckFor = jammed ? stuckFor + dt : 0;
      if (stuckFor > TIMING.stuck) {
        state = 'lost';
        events.push({ type: 'lost', reason: 'jam' });
      }
      return events;
    },
  };
}
