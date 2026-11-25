import { describe, expect, it } from 'vitest';
import { LEVELS, levelIndex } from '../src/scripts/core/levels.js';
import { createGame, TIMING, FACING, BLOCKED_AFTER, STAR_TWO, STAR_THREE, BELT_LENGTH, BELT_CATCHUP, BELT_MIN } from '../src/scripts/core/game.js';
import { BLAST, blastPower, blastReach, clearRay, createAsteroid, facing, hittable, removeVoxel, voxelKey } from '../src/scripts/core/asteroid.js';
import { createRng } from '../src/scripts/core/rng.js';
import { MODELS } from '../src/scripts/core/models/index.js';
import { MIN_AMMO, DEFAULT_RESERVE } from '../src/scripts/core/fleet.js';
import { simulate } from '../src/scripts/core/simulate.js';

/** Kamera kreist um den Asteroiden (wie die Eigendrehung), Abstand in Voxeln */
const orbit = (t, distance = 20) => ({ x: Math.sin(t) * distance, y: 4, z: Math.cos(t) * distance });

/** Schiffe auf dem sichtbaren (antippbaren) Band, links zuerst */
const visible = game => game.belt.filter(item => item.pos <= BELT_LENGTH - 0.5).map(item => item.ship);

/** Alle Schiffe, die noch nicht gestartet sind: Band, dann Luke */
const waitingShips = game => [...game.belt.map(item => item.ship), ...game.queue];

/** Startet blind das erste sichtbare Schiff, dessen Farbe noch nicht fertig ist (die blockierten für immer) – auf
 *  irgendeine freie Plattform */
function launchAny(game) {
  const ship = visible(game).find(s => game.asteroid.aliveByColor.get(s.color));
  return ship ? game.launch(ship.id) : [];
}

/** Munition je Farbe (Band + Luke + Hangar) */
function ammoByColor(game) {
  const ammo = {};
  const ships = [...waitingShips(game), ...game.slots.filter(e => e && e.phase !== 'leaving').map(e => e.ship)];
  for (const ship of ships) ammo[ship.color] = (ammo[ship.color] ?? 0) + ship.ammo;
  return ammo;
}

/** Legt ein Schiff vorn aufs Band (Position `pos`, Sortierung bleibt) */
function putOnBelt(game, ship, pos = 1) {
  const index = game.belt.findIndex(item => item.pos > pos);
  game.belt.splice(index < 0 ? game.belt.length : index, 0, { ship, pos });
  return ship;
}

/** Level 1 mit üppiger Reserve und kleinen Schiffen, ohne Kristalle – kein Schiff ist anfangs unverzichtbar */
const roomy = { ...LEVELS[0], crystals: 0, reserve: 1, ships: { 50: 1 } };

/** Schnelles Band und unbegrenzter Hangar: Jedes Schiff wird sofort gestartet, sobald es sichtbar ist – es fällt nie
 *  eins herunter (außer Schiffen fertiger Farben, die niemand mehr braucht) */
const unbounded = level => ({ ...level, slots: 300, belt: 3 });

/** Lebende Voxel je Farbe (nur Farben, die noch vorkommen) */
const aliveByColor = game => Object.fromEntries([...game.asteroid.aliveByColor].filter(([, n]) => n > 0));

/** Spielt automatisch (blind, siehe launchAny). */
function autoplay(game, { seconds = 600, dt = 1 / 30 } = {}) {
  let time = 0;
  while (game.state === 'play' && time < seconds) {
    launchAny(game);
    game.step(dt, orbit(time * 0.4));
    time += dt;
  }
  return time;
}

/** Ein Schiff einer Farbe, die anfangs nirgends frei liegt (tiefste Kernfarbe) */
const deepShip = (game, id, ammo = 5) => {
  const deepest = game.asteroid.voxels.reduce((a, v) => (v.layer > a.layer && v.color !== BLAST ? v : a));
  return { id, color: deepest.color, ammo, capacity: 50 };
};

describe('Level-Erzeugung', () => {
  it('ist deterministisch per Seed', () => {
    const a = createGame(LEVELS[0]);
    const b = createGame(LEVELS[0]);
    expect(a.asteroid.voxels.map(v => v.color).join('')).toBe(b.asteroid.voxels.map(v => v.color).join(''));
    expect(JSON.stringify(waitingShips(a))).toBe(JSON.stringify(waitingShips(b)));
    expect(JSON.stringify(a.belt)).toBe(JSON.stringify(b.belt));
    const c = createGame(LEVELS[0], { seed: 'anders' });
    expect(JSON.stringify(waitingShips(c))).not.toBe(JSON.stringify(waitingShips(a)));
  });

  it.each(LEVELS.map((level, i) => [i + 1, level]))('Level %i: Munition pro Farbe = Voxelanzahl + Reserve', (_, level) => {
    const game = createGame(level);
    const voxels = {};
    for (const v of game.asteroid.voxels) voxels[v.color] = (voxels[v.color] ?? 0) + 1;
    const ammo = {};
    for (const ship of waitingShips(game)) ammo[ship.color] = (ammo[ship.color] ?? 0) + ship.ammo;
    for (const [color, n] of Object.entries(voxels)) {
      if (color === BLAST) expect(ammo[color]).toBe(n);   // je Kristall ein Spreng-Flieger
      else if (n < MIN_AMMO) expect(ammo[color]).toBe(2 * n);   // kleine Farbe: zwei Schiffe
      else expect(ammo[color]).toBe(n + Math.ceil(n * (level.reserve ?? DEFAULT_RESERVE)));
    }
    expect(game.slots).toHaveLength(level.slots);
  });

  it.each(LEVELS.map((level, i) => [i + 1, level]))(`Level %i: kein Schiff unter ${MIN_AMMO} Schuss (außer die Farbe hat weniger Würfel)`, (_, level) => {
    const game = createGame(level);
    const voxels = {};
    for (const v of game.asteroid.voxels) voxels[v.color] = (voxels[v.color] ?? 0) + 1;
    for (const ship of waitingShips(game)) {
      if (ship.special === 'bomber') continue;
      if (voxels[ship.color] >= MIN_AMMO) expect(ship.ammo).toBeGreaterThanOrEqual(MIN_AMMO);
      else expect(ship.ammo).toBe(voxels[ship.color]);
    }
  });

  it.each(LEVELS.map((level, i) => [i + 1, level]))('Level %i: Haut in Figurfarben, Kern in seinen Schichtfarben', (_, level) => {
    const { voxels } = createGame(level).asteroid;
    for (const v of voxels) {
      if (v.crystal) expect(v.color).toBe(BLAST);
      else if (v.layer === 0) expect(MODELS[level.model.type].skinColors).toContain(v.color);
      else expect(level.core[v.layer - 1]).toContain(v.color);
    }
    // Haut = genau die äußersten `skin` Voxel, und jede Kernschicht kommt vor
    expect(voxels.filter(v => v.depth < (level.skin ?? 1)).every(v => v.layer === 0)).toBe(true);
    for (let k = 1; k <= level.core.length; k++) expect(voxels.some(v => v.layer === k)).toBe(true);
  });

  it.each(LEVELS.map(l => [l.model.type, l]))('%s: jede Hautfarbe kommt vor, keine Kernfarbe in der Haut', (_, level) => {
    const skin = createGame(level).asteroid.voxels.filter(v => v.layer === 0);
    for (const color of MODELS[level.model.type].skinColors) expect(skin.some(v => v.color === color)).toBe(true);
    for (const layer of level.core) for (const color of layer) expect(MODELS[level.model.type].skinColors).not.toContain(color);
  });

  it('der Fußball hat 12 schwarze Fünfecke: gut 1/4 bis 1/3 der Haut ist schwarz, in 12 getrennten Flecken', () => {
    const level = LEVELS.find(l => l.model.type === 'football');
    const { voxels, grid } = createGame(level).asteroid;
    const skin = voxels.filter(v => v.layer === 0 && v.depth === 0);
    const black = skin.filter(v => v.color === 'n');
    expect(black.length / skin.length).toBeGreaterThan(0.2);
    expect(black.length / skin.length).toBeLessThan(0.4);
    // zusammenhängende schwarze Flecken zählen (Nachbarn inkl. diagonal)
    const seen = new Set();
    let patches = 0;
    for (const start of black) {
      if (seen.has(start)) continue;
      patches++;
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const v = stack.pop();
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dz = -1; dz <= 1; dz++) {
              const n = grid.get(voxelKey(v.x + dx, v.y + dy, v.z + dz));
              if (n && n.layer === 0 && n.color === 'n' && !seen.has(n)) {
                seen.add(n);
                stack.push(n);
              }
            }
      }
    }
    expect(patches).toBe(12);
  });

  it('nur die Hülle liegt anfangs frei', () => {
    const { voxels } = createAsteroid(LEVELS[0], createRng(1));
    expect(voxels.some(v => !v.exposed)).toBe(true);
    expect(voxels.find(v => v.x === 0 && v.y === 0 && v.z === 0).exposed).toBe(false);
  });

  it('levelIndex begrenzt auf gültige Level', () => {
    expect(levelIndex(String(LEVELS.length))).toBe(LEVELS.length - 1);
    expect(levelIndex('99')).toBe(LEVELS.length - 1);
    expect(levelIndex('quatsch')).toBe(0);
  });
});

describe('Sichtbarkeit', () => {
  it('ein Voxel auf der Kameraseite zeigt zur Kamera, einer auf der Rückseite nicht', () => {
    const asteroid = createAsteroid(LEVELS[0], createRng(1));
    const camera = { x: 0, y: 0, z: 20 };
    // ein freiliegender Voxel, dessen offene Fläche genau zur Kamera (+z) bzw. von ihr weg (−z) zeigt
    const front = asteroid.voxels.filter(v => v.x === 0 && v.y === 0).sort((a, b) => b.z - a.z)[0];
    const back = asteroid.voxels.filter(v => v.x === 0 && v.y === 0).sort((a, b) => a.z - b.z)[0];
    camera.z = front.z + 20;
    expect(facing(asteroid, front, camera)).toBeGreaterThan(0.9);
    expect(facing(asteroid, back, camera)).toBeLessThan(FACING);
  });
});

describe('Zielregel', () => {
  it.each(LEVELS.slice(0, 3).map(l => [l.model.type, l]))('%s: jedes Schiff trifft ausschließlich Würfel seiner eigenen Farbe – ein ganzes Spiel lang', (_, level) => {
    const game = createGame({ ...unbounded(level), shuffle: 0 });   // ohne Durchmischung, unbegrenzt: läuft lange genug
    const ship = { x: 0, y: -25, z: 18 };
    let time = 0;
    let checked = 0;
    while (game.state === 'play' && time < 400) {
      launchAny(game);
      for (const e of game.step(0.1, orbit(time * 0.3), () => ship)) {
        if (e.type === 'fire') {
          expect(e.shot.voxel.color).toBe(e.ship.color);
          checked++;
        }
      }
      time += 0.1;
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('jeder Schuss tritt durch eine freie Fläche ein, vor der nichts mehr liegt; Flächen zu Kamera/Schiff zuerst', () => {
    const game = createGame(unbounded(LEVELS[0]));
    const ship = { x: 0, y: -25, z: 18 };
    let time = 0;
    let fired = 0;
    let toward = 0;
    while (game.state === 'play' && time < 8) {
      launchAny(game);
      const camera = orbit(time * 0.4);
      for (const e of game.step(1 / 30, camera, () => ship))
        if (e.type === 'fire') {
          fired++;
          const { voxel, normal } = e.shot;
          // „ganz außen“: vor der Eintrittsfläche liegt in gerader Linie kein Voxel mehr
          expect(clearRay(game.asteroid, voxel, normal)).toBe(true);
          const dot = p => {
            const d = [p.x - voxel.x, p.y - voxel.y, p.z - voxel.z];
            return (normal[0] * d[0] + normal[1] * d[1] + normal[2] * d[2]) / Math.hypot(...d);
          };
          if (Math.max(dot(camera), dot(ship)) >= FACING) toward++;
        }
      time += 1 / 30;
    }
    expect(fired).toBeGreaterThan(50);
    // die meisten – bei schnellem Feuer (TIMING.fireEvery) sind die zugewandten Flächen schneller abgeräumt
    expect(toward / fired).toBeGreaterThan(0.8);
  });

  it('die Wände eines Lochs sind nicht treffbar, sein Boden schon', () => {
    // Würfel 7×7×7 mit einem Schacht von oben (x = z = 0) drei Voxel tief
    const grid = new Map();
    const cube = [];
    for (let x = -3; x <= 3; x++)
      for (let y = -3; y <= 3; y++)
        for (let z = -3; z <= 3; z++) {
          if (x === 0 && z === 0 && y >= 1) continue;
          const v = { x, y, z };
          cube.push(v);
          grid.set(voxelKey(x, y, z), v);
        }
    const body = { grid, bounds: 3 };
    const at = (x, y, z) => grid.get(voxelKey(x, y, z));
    expect(hittable(body, at(0, 0, 0))).toBe(true);    // Boden: Linie nach oben frei
    expect(hittable(body, at(1, 1, 0))).toBe(false);   // Wand: schaut auf die gegenüberliegende Wand
    expect(hittable(body, at(-1, 2, 0))).toBe(false);
    expect(hittable(body, at(3, 0, 0))).toBe(true);    // Außenseite
    expect(hittable(body, at(1, 3, 0))).toBe(true);    // Oberkante neben dem Schacht: nach oben frei
  });
});

describe('Spielablauf', () => {
  it('Förderband: läuft nach links, füllt rechts aus der Luke nach (je mindestens ein Platz Abstand), Lücken bleiben, solange genug auf dem Band liegt', () => {
    const game = createGame({ ...LEVELS[0], crystals: 0, belt: 0.2 });
    const speed = game.beltSpeed;
    expect(game.belt.map(item => item.pos)).toEqual([2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
    const order = waitingShips(game).map(s => s.id);
    // ein Schiff aus der Mitte nehmen: die Lücke bleibt beim Weiterlaufen
    const [left, taken, right] = game.belt.slice(1, 4);
    game.launch(taken.ship.id);
    for (let k = 0; k < 10; k++) game.step(0.1, orbit(k));
    expect(left.pos).toBeCloseTo(3.5 - speed);
    expect(right.pos - left.pos).toBeCloseTo(2);
    // lange laufen lassen: rechts kommen die Schiffe in der Reihenfolge der Luke nach, nie dichter als ein Platz
    const queued = game.queue.length;
    for (let k = 0; k < 120; k++) {
      game.step(0.1, orbit(k));
      for (let i = 1; i < game.belt.length; i++) expect(game.belt[i].pos - game.belt[i - 1].pos).toBeGreaterThanOrEqual(1 - 1e-9);
    }
    expect(game.queue.length).toBeLessThan(queued);
    expect(game.belt.at(-1).pos).toBeLessThanOrEqual(BELT_LENGTH);
    expect(waitingShips(game).map(s => s.id)).toEqual(order.filter(id => id !== taken.ship.id).slice(-waitingShips(game).length));
  });

  it('Stauband: liegt wenig auf dem Band und ist eine Plattform frei, rutschen die Schiffe hinter Lücken schnell auf', () => {
    const game = createGame({ ...LEVELS[0], crystals: 0, belt: 0.2, slots: 5 });
    const speed = game.beltSpeed;
    // drei aus der Mitte nehmen → 3 auf dem Band (< BELT_MIN), 2 Plattformen frei
    const [front, a, b, c] = game.belt.slice(0, 4);
    for (const item of [a, b, c]) game.launch(item.ship.id);
    const behind = game.belt[1];
    const gap = behind.pos - front.pos;
    expect(gap).toBeGreaterThan(1.5);
    game.step(0.5, orbit(0));
    expect(front.pos).toBeCloseTo(2.5 - speed * 0.5);                              // der vorderste: Bandtempo
    expect(behind.pos - front.pos).toBeCloseTo(gap - BELT_CATCHUP * 0.5);          // dahinter: rutscht auf
    for (let k = 0; k < 20; k++) game.step(0.1, orbit(k));
    for (let i = 1; i < game.belt.length; i++) expect(game.belt[i].pos - game.belt[i - 1].pos).toBeGreaterThanOrEqual(1 - 1e-9);
    // Nachschub aus der Luke ist da – danach läuft das Band wieder normal (Lücken bleiben)
    expect(game.belt.filter(item => item.pos <= BELT_LENGTH - 0.5).length).toBeGreaterThanOrEqual(BELT_MIN);
  });

  it('ein Schiff fliegt auf die gewünschte freie Plattform, sonst auf die nächste freie; alle belegt → full', () => {
    const game = createGame({ ...LEVELS[0], slots: 5 });
    const next = () => visible(game)[0];
    let ship = next();
    expect(game.canLaunch(ship.id)).toBe('ok');
    expect(game.launch(ship.id, 2)[0]).toEqual({ type: 'launch', ship, slot: 2 });
    expect(game.slots[2].ship).toBe(ship);
    expect(visible(game)).not.toContain(ship);
    expect(game.canLaunch(ship.id)).toBe('gone');   // schon gestartet
    // Plattform 2 belegt: die nächste daneben
    const [first] = game.launch(next().id, 2);
    expect(Math.abs(first.slot - 2)).toBe(1);
    const [second] = game.launch(next().id, 2);
    expect(Math.abs(second.slot - 2)).toBe(1);
    expect(second.slot).not.toBe(first.slot);
    const [third] = game.launch(next().id, 2);
    expect([0, 4]).toContain(third.slot);
    expect(game.launch(next().id, 2)[0].slot).toBe(4 - third.slot);
    expect(game.slots.includes(null)).toBe(false);
    ship = next();
    expect(game.canLaunch(ship.id)).toBe('full');
    expect(game.launch(ship.id)).toEqual([]);
    expect(visible(game)).toContain(ship);
    // noch in der Luke bzw. hinter der Einfahrt: nicht antippbar
    expect(game.canLaunch(game.queue[0].id)).toBe('gone');
  });

  it('was das Bandende erreicht, fällt herunter und ist weg – dank Reserve geht das Spiel weiter', () => {
    const game = createGame(roomy);
    const ship = game.belt[0].ship;
    expect(game.essential(ship)).toBe(false);
    const before = ammoByColor(game);
    const events = [];
    const time = (game.belt[0].pos + 0.5) / game.beltSpeed;
    for (let t = 0; t < time + 0.2; t += 0.1) events.push(...game.step(0.1, orbit(t)));
    expect(events.filter(e => e.type === 'drop')).toEqual([{ type: 'drop', ship }]);
    expect(waitingShips(game)).not.toContain(ship);
    expect(game.stats.dropped).toBe(ship.ammo);
    expect(ammoByColor(game)[ship.color]).toBe(before[ship.color] - ship.ammo);
    expect(game.state).toBe('play');
  });

  it('fällt ein unverzichtbares Schiff herunter (seine Farbe hätte zu wenig Munition), ist das Spiel verloren', () => {
    const game = createGame(roomy);
    const ship = game.belt[0].ship;
    // Reserve dieser Farbe aufbrauchen: alle anderen Schiffe der Farbe weg, dieses trägt genau den Bedarf
    game.belt.splice(0, game.belt.length, ...game.belt.filter(item => item.ship === ship || item.ship.color !== ship.color));
    game.queue.splice(0, game.queue.length, ...game.queue.filter(s => s.color !== ship.color));
    ship.ammo = game.asteroid.aliveByColor.get(ship.color);
    expect(game.essential(ship)).toBe(true);
    expect(game.essential(game.belt[1].ship)).toBe(false);
    let lost = null;
    for (let t = 0; t < 30 && !lost; t += 0.1) lost = game.step(0.1, orbit(t)).find(e => e.type === 'lost');
    expect(lost).toEqual({ type: 'lost', reason: 'ammo', color: ship.color });
    expect(game.state).toBe('lost');
  });

  it('bei beliebigem Starten und Herunterfallen: Munition je Farbe ≥ Bedarf, bis ein unverzichtbares Schiff fällt', () => {
    const level = LEVELS.find(l => l.crystals > 0);
    const game = createGame({ ...level, slots: 300, belt: 2, reserve: 0.25 });
    const rng = createRng('band');
    let drops = 0;
    let last = null;
    for (let t = 0; t < 600 && game.state === 'play'; t += 0.1) {
      const ships = visible(game);
      if (ships.length && rng() < 0.08) game.launch(rng.pick(ships).id);
      const events = game.step(0.1, orbit(t));
      drops += events.filter(e => e.type === 'drop').length;
      last = events.find(e => e.type === 'lost') ?? last;
      if (game.state !== 'play') break;
      // Bedarf: lebende Würfel ohne die, auf die schon ein Schuss fliegt
      const need = aliveByColor(game);
      for (const shot of game.shots) if (shot.voxel.alive) need[shot.voxel.color]--;
      const ammo = ammoByColor(game);
      for (const [color, n] of Object.entries(need)) if (color !== BLAST) expect(ammo[color] ?? 0).toBeGreaterThanOrEqual(n);
    }
    expect(drops).toBeGreaterThan(1);
    // blindes Liegenlassen verbraucht irgendwann zu viel Reserve
    expect(last).toMatchObject({ type: 'lost', reason: 'ammo' });
  });

  it('ein heruntergefallener Spreng-Flieger entschärft einen Kristall: normaler Block, ein Schiff seiner Farbe +1 Munition', () => {
    const level = LEVELS.find(l => l.crystals > 0);
    const game = createGame(level);
    const bomber = waitingShips(game).find(s => s.special === 'bomber');
    game.belt.splice(0, game.belt.length, ...game.belt.filter(item => item.ship !== bomber));
    game.queue.splice(0, game.queue.length, ...game.queue.filter(s => s !== bomber));
    putOnBelt(game, bomber, 0);   // ans Bandende
    const blast = game.asteroid.aliveByColor.get(BLAST);
    const spare = Object.fromEntries([...game.asteroid.aliveByColor.keys()].map(c => [c, game.spare(c)]));
    const events = [];
    for (let t = 0; t < 3; t += 0.1) events.push(...game.step(0.1, orbit(t)));
    expect(events.filter(e => e.type === 'drop')).toEqual([{ type: 'drop', ship: bomber }]);
    expect(waitingShips(game)).not.toContain(bomber);
    const defuse = events.find(e => e.type === 'defuse');
    expect(defuse).toBeTruthy();
    const { crystal, ship } = defuse;
    expect(crystal).toMatchObject({ crystal: false, color: crystal.baseColor, alive: true });
    expect(ship.color).toBe(crystal.baseColor);
    expect(game.asteroid.aliveByColor.get(BLAST)).toBe(blast - 1);
    expect(waitingShips(game).filter(s => s.special === 'bomber')).toHaveLength(blast - 1);
    // Reserve bleibt gleich: ein Block mehr, ein Schuss mehr
    expect(game.spare(crystal.baseColor)).toBe(spare[crystal.baseColor]);
    expect(game.stats.bombersLost).toBe(1);
    expect(game.stats.dropped).toBe(0);
    expect(game.state).toBe('play');
  });

  it('Schiff schießt erst nach dem Anflug', () => {
    const game = createGame(LEVELS[0]);
    launchAny(game);
    expect(game.step(TIMING.arrive / 2, orbit(0)).some(e => e.type === 'fire')).toBe(false);
    let fired = false;
    for (let t = 0; t < 10 && !fired; t += 0.05) fired = game.step(0.05, orbit(t)).some(e => e.type === 'fire');
    expect(fired).toBe(true);
  });

  it.each(LEVELS.map((level, i) => [i + 1, level]))('Level %i ist mit unbegrenztem Hangar immer zu gewinnen', (_, level) => {
    const game = createGame(unbounded(level));
    autoplay(game);
    expect(game.state).toBe('won');
    expect(game.destroyed).toBe(game.asteroid.total);
  }, 60_000);

  it('ein Schiff ohne Ziel ganz außen bleibt blockiert auf seiner Plattform, ohne zu schießen', () => {
    const game = createGame({ ...LEVELS[0], slots: 2 });
    const ship = putOnBelt(game, deepShip(game, 900));
    game.launch(ship.id);
    const events = [];
    for (let t = 0; t < TIMING.arrive + BLOCKED_AFTER + 1; t += 0.05) events.push(...game.step(0.05, orbit(t)));
    expect(events.some(e => e.type === 'fire' || e.type === 'leave')).toBe(false);
    expect(game.slots[0]).toMatchObject({ ship, phase: 'ready' });
    expect(game.slots[0].idle).toBeGreaterThan(BLOCKED_AFTER);
    expect(ship.ammo).toBe(5);
    expect(game.state).toBe('play');   // eine Plattform ist noch frei
  });

  it('alle Plattformen mit blockierten Schiffen belegt → verloren', () => {
    const game = createGame({ ...LEVELS[0], slots: 2 });
    game.launch(putOnBelt(game, deepShip(game, 900)).id);
    game.launch(putOnBelt(game, deepShip(game, 901)).id);
    let lost = null;
    for (let t = 0; t < 5 && !lost; t += 0.05) lost = game.step(0.05, orbit(t)).find(e => e.type === 'lost');
    expect(lost).toEqual({ type: 'lost', reason: 'jam' });
    expect(game.state).toBe('lost');
  });

  it('volle Slots ohne passende Ziele → verloren', () => {
    const game = createGame({ ...LEVELS[0], slots: 1 });
    launchAny(game);
    // alle Voxel der Schiffsfarbe als reserviert markieren: das Schiff findet kein Ziel mehr
    const color = game.slots[0].ship.color;
    for (const v of game.asteroid.voxels) if (v.color === color) v.reserved = true;
    let lost = false;
    for (let t = 0; t < 5 && !lost; t += 0.1) lost = game.step(0.1, orbit(t)).some(e => e.type === 'lost');
    expect(lost).toBe(true);
  });
});

describe('Riss-Kristalle', () => {
  const withCrystals = LEVELS.find(l => l.crystals > 0);

  it('Level ohne Kristalle haben keine, die anderen so viele wie angegeben – ab der zweiten Kernschicht', () => {
    for (const level of LEVELS) {
      const { crystals } = createGame(level).asteroid;
      expect(crystals).toHaveLength(level.crystals ?? 0);
      // Figuren mit festen Kristallen (z. B. die Augen der Maske) legen sie bewusst an die Oberfläche
      const fixed = MODELS[level.model.type].build({ radius: level.radius, ...level.model }, createRng(level.seed)).crystals;
      if (fixed?.length) continue;
      for (const c of crystals) expect(c.layer).toBeGreaterThanOrEqual(Math.min(2, level.core.length));
    }
  });

  it('je Spreng-Block genau ein Spreng-Flieger mit einer Bombe; normale Schiffe haben nie die Spreng-Farbe', () => {
    const game = createGame(withCrystals);
    const ships = waitingShips(game);
    const bombers = ships.filter(s => s.special === 'bomber');
    expect(bombers).toHaveLength(game.asteroid.crystals.length);
    for (const b of bombers) expect(b).toMatchObject({ color: BLAST, ammo: 1 });
    expect(ships.filter(s => !s.special).every(s => s.color !== BLAST)).toBe(true);
  });

  it('Kristalle liegen anfangs verdeckt in einer inneren Schicht', () => {
    const { crystals } = createGame(withCrystals).asteroid;
    for (const c of crystals) {
      expect(c.layer).toBeGreaterThanOrEqual(Math.min(2, withCrystals.core.length));
      expect(c.exposed).toBe(false);
      expect(blastReach(createGame(withCrystals).asteroid, c, blastPower(withCrystals)).length).toBeGreaterThan(20);
    }
  });

  it('Sprengkraft: nimmt mit Abstand und jedem Würfel dazwischen ab; innen liegende Würfel sind schwerer', () => {
    // Kristall im Ursprung; nach +x eine volle Reihe, nach +y nur ein einzelner Würfel im selben Abstand
    const voxels = [];
    const grid = new Map();
    const add = (x, y, z, depth = 0) => {
      const v = { x, y, z, depth, alive: true };
      voxels.push(v);
      grid.set(voxelKey(x, y, z), v);
      return v;
    };
    const crystal = add(0, 0, 0);
    for (let x = 1; x <= 4; x++) add(x, 0, 0, 4 - x);
    const lone = add(0, 4, 0, 3);
    const hits = new Map(blastReach({ voxels, grid }, crystal, 8).map(h => [h.voxel, h]));
    const far = hits.get(grid.get(voxelKey(4, 0, 0)));
    // gleicher Abstand: hinter drei Würfeln kommt drei Einheiten weniger Energie an als durch freie Bahn
    expect(hits.get(lone).energy - far.energy).toBeCloseTo(3);
    // näher dran = mehr Energie
    expect(hits.get(grid.get(voxelKey(1, 0, 0))).energy).toBeGreaterThan(far.energy);
    // Masse wächst mit der Tiefe (innen schwer, außen leicht)
    expect(hits.get(grid.get(voxelKey(1, 0, 0))).mass).toBeGreaterThan(far.mass);
    // zu viele Würfel dazwischen: kommt nichts mehr an
    expect(blastReach({ voxels, grid }, crystal, 4.5).some(h => h.voxel === far.voxel)).toBe(false);
  });

  it('ein Treffer auf den Kristall sprengt alles weg, wo noch Energie ankommt – auch nahe Hülle', () => {
    const game = createGame({ ...withCrystals, slots: 1 });
    const crystal = game.asteroid.crystals[0];
    // Schiff in Kristallfarbe direkt in den Hangar, Kristall als einziges Ziel freilegen
    game.launch(putOnBelt(game, { id: 999, color: crystal.color, ammo: 1 }).id);
    // Schacht vom Kristall nach außen graben (entlang seiner größten Achse), Kamera weit draußen in dieser Richtung
    const axis = ['x', 'y', 'z'].reduce((a, b) => (Math.abs(crystal[b]) > Math.abs(crystal[a]) ? b : a));
    const step = { x: 0, y: 0, z: 0, [axis]: Math.sign(crystal[axis]) || 1 };
    for (let k = 1; k < 20; k++) {
      const v = game.asteroid.grid.get(voxelKey(crystal.x + step.x * k, crystal.y + step.y * k, crystal.z + step.z * k));
      if (v) removeVoxel(game.asteroid, v);
    }
    for (const v of game.asteroid.voxels) if (v !== crystal && v.color === crystal.color) v.reserved = true;
    const camera = { x: crystal.x + step.x * 50, y: crystal.y + step.y * 50, z: crystal.z + step.z * 50 };
    const before = game.destroyed;
    const expected = blastReach(game.asteroid, crystal, blastPower(withCrystals)).length;
    const events = [];
    for (let t = 0; t < 3; t += 0.05) events.push(...game.step(0.05, camera));
    expect(events.find(e => e.type === 'hit')?.voxel).toBe(crystal);
    const breaks = events.filter(e => e.type === 'break');
    const blown = breaks.flatMap(e => e.voxels);
    expect(breaks[0].voxels).toHaveLength(expected);
    expect(blown.every(v => !v.alive)).toBe(true);
    expect(blown.some(v => v.layer === 0)).toBe(true);   // die Hülle reißt mit auf
    for (const e of breaks) {
      expect(e.energy).toHaveLength(e.voxels.length);
      expect(e.energy.every(n => n > 0) && e.mass.every(m => m >= 1)).toBe(true);
    }
    expect(game.destroyed).toBe(before + 1 + blown.length);
  });

  it('detonate zündet einen Kristall sofort', () => {
    const game = createGame(withCrystals);
    const crystal = game.asteroid.crystals[0];
    const events = game.detonate(crystal);
    expect(events.map(e => e.type).slice(0, 2)).toEqual(['hit', 'break']);
    expect(crystal.alive).toBe(false);
    expect(events[1].voxels.length).toBeGreaterThan(20);
    expect(events[1].voxels.every(v => !v.alive)).toBe(true);
    expect(game.detonate(crystal)).toEqual([]);
  });

  it('letzter Stein ist ein Kristall: Sprengung mit leerer Würfelliste, danach gewonnen', () => {
    // Regression: die Darstellung stürzte bei der leeren Liste ab, 'won' kam nie an – das Spiel hing
    const game = createGame(withCrystals);
    const crystal = game.asteroid.crystals[0];
    for (const v of game.asteroid.voxels) if (v.alive && v !== crystal) removeVoxel(game.asteroid, v);
    const events = game.detonate(crystal);
    const blast = events.find(e => e.type === 'break');
    expect(blast.voxels).toEqual([]);
    expect(blast.energy).toEqual([]);
    expect(game.asteroid.alive).toBe(0);
    expect(game.step(0.016, { x: 0, y: 0, z: 40 }).map(e => e.type)).toContain('won');
  });

  it('ist eine Farbe fertig, bleiben ihre Schiffe stehen – gestartet blockieren sie die Plattform für immer', () => {
    const game = createGame({ ...LEVELS[0], slots: 2 });
    const ship = game.belt[0].ship;
    const { color } = ship;
    const waiting = waitingShips(game).filter(s => s.color === color).length;
    // alle Voxel der Farbe von außen entfernen (wie durch Bruchstücke), dann einen Schritt rechnen
    for (const v of game.asteroid.voxels) if (v.color === color) {
      v.alive = false;
      game.asteroid.alive--;
    }
    game.asteroid.aliveByColor.set(color, 0);
    game.step(0.01, orbit(0));
    expect(waitingShips(game).filter(s => s.color === color)).toHaveLength(waiting);
    // herunterfallen lassen kostet nichts (wird nicht mehr gebraucht)
    expect(game.essential(ship)).toBe(false);
    game.launch(ship.id, 0);
    expect(game.slots[0].doomed).toBe(true);
    const events = [];
    for (let t = 0; t < 5; t += 0.05) events.push(...game.step(0.05, orbit(t)));
    expect(events.some(e => e.type === 'leave' || e.type === 'fire')).toBe(false);
    expect(game.slots[0]).toMatchObject({ ship, phase: 'ready' });
  });

  it('wird die Farbe fertig, während das Schiff auf der Plattform steht, fliegt es mit Restmunition ab', () => {
    const game = createGame(LEVELS[0]);
    game.launch(visible(game)[0].id, 0);
    const { ship } = game.slots[0];
    for (let t = 0; t < TIMING.arrive + 0.05; t += 0.05) game.step(0.05, orbit(t));
    for (const v of game.asteroid.voxels) if (v.color === ship.color && v.alive) removeVoxel(game.asteroid, v);
    const events = [];
    for (let t = 0; t < 2; t += 0.05) events.push(...game.step(0.05, orbit(t)));
    expect(events.some(e => e.type === 'leave' && e.ship === ship)).toBe(true);
  });

  it('Level mit Kristallen sind mit unbegrenztem Hangar zu gewinnen, Schiffe mit Restmunition fliegen ab', () => {
    const game = createGame(unbounded(withCrystals));
    autoplay(game);
    expect(game.state).toBe('won');
  });
});

describe('Simulation (Bots)', () => {
  it.each(LEVELS.map((level, i) => [i + 1, level]))('Level %i: der schlaue Bot gewinnt mit dem echten Hangar mindestens 2 von 3 Seeds', (_, level) => {
    const runs = [0, 1, 2].map(k => simulate(level, { bot: 'smart', seed: `${level.seed}#${k}` }));
    expect(runs.filter(r => r.won).length).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('beide Bots melden Starts, heruntergefallene Schiffe, Fehlstarts und Sterne', () => {
    const r = simulate(LEVELS[0], { bot: 'random' });
    expect(r.launches).toBeGreaterThan(0);
    expect(r).toHaveProperty('drops');
    expect(r).toHaveProperty('misfires');
    const smart = simulate(LEVELS[0]);
    expect(smart).toMatchObject({ won: true, left: 0, reason: null });
    expect(smart.stars).toBeGreaterThanOrEqual(1);
  });
});

describe('Sterne und Specials', () => {
  it('Fehlstart: ein gestartetes Schiff, das blockiert stehen bleibt, zählt einmal', () => {
    const game = createGame({ ...LEVELS[0], crystals: 0 });
    launchAny(game);   // Hülle: hat sofort Ziele
    game.launch(putOnBelt(game, deepShip(game, 900)).id);
    for (let t = 0; t < TIMING.arrive + BLOCKED_AFTER * 4; t += 0.05) game.step(0.05, orbit(t));
    expect(game.stats.misfires).toBe(1);
  });

  it('Sterne: 0 vor dem Sieg; ★★★ bis STAR_THREE Fehlstarts ohne verlorenen Spreng-Flieger, ★★ bis STAR_TWO, sonst ★', () => {
    const game = createGame({ ...LEVELS[0], crystals: 0 });
    expect(game.stars()).toBe(0);
    expect(game.stats).toEqual({ misfires: 0, dropped: 0, bombersLost: 0 });
    game.clearAll();
    game.step(0.01, orbit(0));
    expect(game.state).toBe('won');
    expect(game.stars()).toBe(3);
    game.stats.misfires = STAR_THREE;
    expect(game.stars()).toBe(3);
    game.stats.misfires = STAR_THREE + 1;
    expect(game.stars()).toBe(2);
    game.stats.misfires = STAR_TWO;
    expect(game.stars()).toBe(2);
    game.stats.misfires = STAR_TWO + 1;
    expect(game.stars()).toBe(1);
    game.stats.misfires = 0;
    game.stats.dropped = 500;   // heruntergefallene Munition kostet keinen Stern
    expect(game.stars()).toBe(3);
    game.stats.bombersLost = 1;
    expect(game.stars()).toBe(2);   // verschenkter Spreng-Flieger kostet den dritten Stern
  });

  it('Plattform +1: eine Zusatz-Plattform, die jedes Schiff nutzen kann – je Versuch einmal', () => {
    const slots = 3;
    const game = createGame({ ...LEVELS[0], slots });
    for (let k = 0; k < slots; k++) launchAny(game);
    const ship = visible(game)[0];
    expect(game.canLaunch(ship.id)).toBe('full');
    expect(game.special('pad')).toEqual([{ type: 'pad', slot: slots }]);
    expect(game.canLaunch(ship.id)).toBe('ok');
    expect(game.launch(ship.id)[0]).toMatchObject({ type: 'launch', ship, slot: slots });
    expect(game.canLaunch(visible(game)[0].id)).toBe('full');
    expect(game.special('pad')).toEqual([]);
  });

  it('Farbwechsel: äußerste Blöcke anderer Farben bekommen die Farbe des Fliegers auf dem Band, er die Schüsse dazu', () => {
    const game = createGame({ ...LEVELS[0], crystals: 0 });
    const ship = visible(game)[2];
    const ammo = ship.ammo;
    const before = ammoByColor(game);
    expect(game.special('recolor', 12345)).toEqual([]);   // kein Schiff auf dem Band
    const [event] = game.special('recolor', ship.id);
    expect(event).toMatchObject({ type: 'recolor', ship, color: ship.color });
    expect(event.voxels.length).toBeGreaterThan(0);
    expect(event.voxels.every(v => v.color === ship.color && hittable(game.asteroid, v))).toBe(true);
    expect(ship.ammo).toBe(ammo + event.voxels.length);
    // Munition reicht weiter für jede Farbe
    const after = ammoByColor(game);
    for (const [color, alive] of Object.entries(aliveByColor(game))) expect(after[color]).toBeGreaterThanOrEqual(alive);
    expect(after[ship.color]).toBe(before[ship.color] + event.voxels.length);
    expect(game.special('recolor', visible(game)[0].id)).toEqual([]);   // je Versuch einmal
  });

  it('Zurückziehen: Schiff auf der Plattform kommt mit Restmunition als Nächstes aus der Luke – je Versuch einmal', () => {
    const game = createGame({ ...LEVELS[0], crystals: 0 });
    const [event] = launchAny(game);
    const { ship, slot } = event;
    expect(game.special('recall', slot)).toEqual([]);   // landet noch – erst schussbereit zurückholbar
    for (let k = 0; k < 200 && game.slots[slot]?.phase !== 'ready'; k++) game.step(0.01, { x: 0, y: 0, z: 30 });
    expect(game.slots[slot]?.ship).toBe(ship);
    expect(game.special('recall', slot)).toEqual([{ type: 'recall', ship, slot }]);
    expect(game.slots[slot]).toBeNull();
    expect(game.queue[0]).toBe(ship);
    expect(game.special('recall', slot)).toEqual([]);
  });

  it('Supernova: reißt die Figur auf der Kameraseite weit auf', () => {
    const game = createGame(LEVELS[0]);
    const before = game.destroyed;
    const events = game.special('nova', { x: 0, y: 0, z: 30 });
    const blown = events.filter(e => e.type === 'break').flatMap(e => e.voxels);
    expect(blown.length).toBeGreaterThan(100);
    expect(game.destroyed).toBe(before + 1 + blown.length);
    // vorn, nicht hinten: der Schwerpunkt der weggesprengten Würfel liegt deutlich auf der Kameraseite
    expect(blown.reduce((sum, v) => sum + v.z, 0) / blown.length).toBeGreaterThan(2);
  });
});
