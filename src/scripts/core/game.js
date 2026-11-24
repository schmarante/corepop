// Spielablauf als reine Logik (ohne Grafik, ohne DOM, deterministisch per Seed).
//
//   const game = createGame(LEVELS[0]);
//   game.launch(column)            → vorderstes Schiff der Spalte auf die Plattform direkt darüber (Slot = Spalte)
//   game.slide(dir)                → vorderste Reihe um einen Platz schieben (-1 links, +1 rechts), siehe unten
//   game.step(dt, camera, origin)  → Zeit vorspulen; liefert Ereignisse für Darstellung, UI und später das Netzwerk
//   game.special(id, …)            → Special einsetzen (je Versuch einmal): 'pad' | 'recolor' | 'nova', siehe unten
//   game.stars()                   → 0 … 3 Sterne (nach dem Sieg), aus game.stats
//
// Spalte = Plattform: Jede Spalte der Warteschlange steht unter genau einer Plattform, ihr vorderstes Schiff fliegt nur
// dorthin. Ist die Plattform belegt, muss man warten – oder die vorderste Reihe seitlich schieben: Alle vordersten
// Schiffe rücken einen Platz weiter, das am Rand hinausgeschobene ist aussortiert und weg (bei einem Spreng-Flieger wird
// einer seiner Kristalle zum normalen Block, siehe defuse). In die freie Stelle am anderen Rand rückt das nächste
// Schiff dieser Spalte nach. Die Flotte hat etwas Reserve-Munition (fleet.js). Sortiert man ein Schiff aus, ohne das
// seine Farbe nicht mehr reicht (`essential` – die Darstellung warnt mit roter Zahl), ist das Spiel verloren: Man kann
// sich bewusst ins Aus manövrieren.
//
// Ist eine Farbe fertig, bleiben ihre übrigen Schiffe (Reserve, Bruchstücke) in der Warteschlange stehen – eine Falle:
// Gestartet finden sie nie ein Ziel und blockieren ihre Plattform für immer (`doomed`). Man muss sie hinausschieben
// (das kostet nichts, sie werden nicht mehr gebraucht). Schiffe, die schon auf der Plattform stehen, wenn ihre Farbe
// fertig wird, fliegen dagegen ab.
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
//   { type: 'launch', ship, slot }        Schiff fliegt in Slot `slot` (= Spalte)
//   { type: 'slide', dir, out }          vorderste Reihe geschoben; `out`: aussortiertes (weggeflogenes) Schiff oder null
//   { type: 'defuse', crystal, ship }      Kristall entschärft (Spreng-Flieger aussortiert): jetzt ein normaler Block,
//                                         `ship` trägt den Schuss dafür (Munition +1)
//   { type: 'fire', ship, slot, shot }     Schuss auf shot.voxel
//   { type: 'hit', shot, voxel }          Voxel zerstört
//   { type: 'fizzle', shot }              Ziel war schon weg (mit einem Bruchstück abgesprengt) – Schuss verpufft
//   { type: 'break', crystal, voxels, energy, mass }  Sprengsatz: `voxels` fliegen weg; je Voxel Restenergie und
//                                         Masse (innen schwerer) → Tempo √(2E/m)
//   { type: 'leave', ship, slot }         Munition leer (oder Farbe weg), Schiff fliegt ab
//   { type: 'free', slot }                Slot wieder frei
//   { type: 'pad', slot }                 Special: Zusatz-Plattform `slot` (hinter den Spalten-Plattformen)
//   { type: 'recolor', ship, voxels, color }  Special Farbwechsel: `voxels` haben jetzt `color`, `ship` +Munition
//   { type: 'won' }
//   { type: 'lost', reason, color? }      reason 'jam': alle Plattformen mit blockierten Schiffen belegt;
//                                         'ammo': für `color` reicht die Munition nicht mehr (zu viel aussortiert)

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
/** Sterne: Anteil der Reserve, der höchstens aussortiert sein darf (★★ bzw. ★★★) */
export const STAR_TWO = 0.5;
export const STAR_THREE = 0.15;
/** Specials: so viele Blöcke färbt der Farbwechsel höchstens um; so viel stärker als ein Kristall ist die Supernova */
const RECOLOR_MAX = 60;
const NOVA_POWER = 1.9;
/** s ohne Ziel, ab denen ein Schiff als blockiert gilt (Darstellung: Plattform warnt, Schiff dimmt) */
export const BLOCKED_AFTER = 0.6;

/**
 * @param {object} level  Eintrag aus LEVELS
 * @param {{ seed?: string | number }} [options]  Seed überschreibt level.seed (Battle: gemeinsamer Seed)
 */
export function createGame(level, { seed = level.seed } = {}) {
  const rng = createRng(seed);
  const asteroid = createAsteroid(level, rng);
  const columns = createFleet(asteroid, level, rng);
  const aimRng = createRng(`${seed}:aim`);   // eigener Strom: Zielwahl verändert die Level-Erzeugung nicht

  /** @type {(null | { ship, phase: 'arriving' | 'ready' | 'leaving', t: number, cooldown: number, inFlight: number,
   *                    idle: number })[]}  idle: s seit dem letzten Schuss (≥ BLOCKED_AFTER → blockiert) */
  const slots = new Array(level.slots).fill(null);
  /** Zusatz-Plattform (Special 'pad'): Index in `slots` oder -1 – jedes vordere Schiff darf dorthin, wenn seine
   *  eigene Plattform belegt ist */
  let extraSlot = -1;
  const used = new Set();   // eingesetzte Specials (je Versuch einmal)
  /** für die Sterne: aussortierte Munition normaler Schiffe, verschenkte Spreng-Flieger, Reserve am Anfang */
  const stats = { discarded: 0, bombersLost: 0, reserve: 0 };
  {
    const ammo = new Map();
    for (const column of columns) for (const ship of column) if (!ship.special) ammo.set(ship.color, (ammo.get(ship.color) ?? 0) + ship.ammo);
    for (const [color, n] of ammo) stats.reserve += n - (asteroid.aliveByColor.get(color) ?? 0);
  }
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
    for (const column of columns) for (const ship of column) if (ship.color === color) n += ship.ammo;
    for (const e of slots) if (e && e.phase !== 'leaving' && e.ship.color === color) n += e.ship.ammo;
    return n;
  }
  /** So viele Schüsse braucht eine Farbe noch (lebende Voxel ohne die, auf die schon ein Schuss fliegt) */
  function needOf(color) {
    let n = asteroid.aliveByColor.get(color) ?? 0;
    for (const shot of shots) if (shot.voxel.alive && shot.voxel.color === color) n--;
    return n;
  }
  /** Munition übrig über den Bedarf hinaus (Spreng-Farbe: Kristalle entschärfen sich beim Aussortieren, nie knapp) */
  const spare = color => (color === BLAST ? Infinity : ammoOf(color) - needOf(color));

  /** Ein Spreng-Flieger wurde aussortiert: Einer seiner Kristalle (bevorzugt einer, der noch nicht freiliegt) wird zum
   *  normalen Block seiner Schichtfarbe – sonst bliebe er unzerstörbar. Den Schuss dafür bekommt das hinterste Schiff
   *  dieser Farbe (Munition = Voxelzahl bleibt exakt). Gibt es keins mehr, zerfällt der Kristall einfach. */
  function defuse(events) {
    const left = asteroid.crystals.filter(c => c.alive && c.crystal && !c.reserved);
    const crystal = left.find(c => !hittable(asteroid, c)) ?? left[0];
    if (!crystal) return;
    const color = crystal.baseColor;
    let carrier = null;
    for (const column of columns) for (const ship of column) if (ship.color === color) carrier = ship;
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
    columns,
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

    /** Wird dieses Schiff noch gebraucht (ohne es hätte seine Farbe zu wenig Munition)? Aussortieren = verloren. */
    essential(ship) {
      return !!ship && spare(ship.color) < ship.ammo;
    },
    /** Munition einer Farbe über den Bedarf hinaus (Reserve, die man noch aussortieren darf) */
    spare,

    /** Kann das vorderste Schiff dieser Spalte gestartet werden? 'ok' | 'full' (Plattform darüber belegt) | 'empty' | 'over' */
    canLaunch(column) {
      if (state !== 'play') return 'over';
      if (!columns[column]?.length) return 'empty';
      return !slots[column] || (extraSlot >= 0 && !slots[extraSlot]) ? 'ok' : 'full';
    },

    /** Startet das vorderste Schiff einer Spalte auf die Plattform darüber. @returns {object[]} Ereignisse (leer, wenn nicht möglich) */
    launch(column) {
      if (this.canLaunch(column) !== 'ok') return [];
      const slot = slots[column] ? extraSlot : column;   // eigene Plattform belegt → Zusatz-Plattform
      const ship = columns[column].shift();
      // doomed: seine Farbe ist schon fertig – es findet nie ein Ziel und blockiert die Plattform für immer
      slots[slot] = { ship, phase: 'arriving', t: 0, cooldown: 0, inFlight: 0, idle: 0, doomed: colorGone(ship.color) };
      return [{ type: 'launch', ship, slot, column }];
    },

    /**
     * Schiebt die vorderste Reihe um einen Platz (dir -1 = nach links, +1 = nach rechts). Das am Rand hinausgeschobene
     * Schiff ist aussortiert, am anderen Rand rückt das nächste Schiff der Spalte nach. @returns {object[]} Ereignisse
     */
    slide(dir) {
      const events = [];
      if (state !== 'play' || (dir !== -1 && dir !== 1) || columns.every(c => !c.length)) return events;
      const edge = dir < 0 ? 0 : columns.length - 1;
      const fronts = columns.map(c => c.shift() ?? null);
      const out = fronts[edge];
      const moved = dir < 0 ? [...fronts.slice(1), null] : [null, ...fronts.slice(0, -1)];
      moved.forEach((ship, i) => ship && columns[i].unshift(ship));
      events.push({ type: 'slide', dir, out });
      if (out?.special === 'bomber') stats.bombersLost++;
      else if (out) stats.discarded += out.ammo;
      if (out?.special === 'bomber') defuse(events);
      // zu viel aussortiert: reicht die Munition einer Farbe nicht mehr, ist das Spiel nicht mehr zu gewinnen
      for (const [color, alive] of asteroid.aliveByColor)
        if (alive && spare(color) < 0) {
          state = 'lost';
          events.push({ type: 'lost', reason: 'ammo', color });
          break;
        }
      return events;
    },

    /** Auswertung (für Sterne und Anzeige) */
    get stats() {
      return stats;
    },
    /**
     * Sterne nach dem Sieg (sonst 0): ★ geschafft · ★★ höchstens die Hälfte der Reserve aussortiert ·
     * ★★★ höchstens STAR_THREE der Reserve aussortiert und kein Spreng-Flieger verschenkt
     */
    stars() {
      if (state !== 'won') return 0;
      const share = stats.reserve > 0 ? stats.discarded / stats.reserve : 0;
      if (share <= STAR_THREE && stats.bombersLost === 0) return 3;
      return share <= STAR_TWO ? 2 : 1;
    },
    /** Specials, die in diesem Versuch schon eingesetzt wurden */
    get usedSpecials() {
      return used;
    },
    /**
     * Special einsetzen (je Versuch einmal; ob es freigeschaltet ist, prüft der Modus):
     *   'pad'                      Zusatz-Plattform
     *   'recolor', column          die äußersten Blöcke anderer Farben werden zur Farbe des vorderen Schiffs dieser
     *                              Spalte – so viele, wie es Munition hat (es bekommt die Schüsse dazu)
     *   'nova', camera             Riesen-Explosion am Punkt der Figur, der am weitesten zur Kamera zeigt
     * @returns {object[]} Ereignisse (leer, wenn nicht möglich)
     */
    special(id, arg) {
      const events = [];
      if (state !== 'play' || used.has(id)) return events;
      if (id === 'pad') {
        extraSlot = slots.length;
        slots.push(null);
        events.push({ type: 'pad', slot: extraSlot });
      } else if (id === 'recolor') {
        const ship = columns[arg]?.[0];
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

      slots.forEach((entry, slot) => {
        if (!entry) return;
        entry.t += dt;
        if (entry.phase === 'arriving') {
          if (entry.t >= TIMING.arrive) Object.assign(entry, { phase: 'ready', t: 0 });
        } else if (entry.phase === 'ready') {
          entry.cooldown -= dt;
          entry.idle += dt;   // seit dem letzten Schuss (wird beim Schießen zurückgesetzt)
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
        if (slots[shot.slot]) slots[shot.slot].inFlight--;
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
