import { describe, expect, it } from 'vitest';
import { LEVELS, levelIndex } from '../src/scripts/core/levels.js';
import { createGame, TIMING, FACING, BLOCKED_AFTER, STAR_TWO, STAR_THREE } from '../src/scripts/core/game.js';
import { BLAST, blastPower, blastReach, clearRay, createAsteroid, facing, hittable, removeVoxel, voxelKey } from '../src/scripts/core/asteroid.js';
import { createRng } from '../src/scripts/core/rng.js';
import { MODELS } from '../src/scripts/core/models/index.js';
import { MIN_AMMO, DEFAULT_RESERVE } from '../src/scripts/core/fleet.js';
import { simulate } from '../src/scripts/core/simulate.js';

/** Kamera kreist um den Asteroiden (wie die Eigendrehung), Abstand in Voxeln */
const orbit = (t, distance = 20) => ({ x: Math.sin(t) * distance, y: 4, z: Math.cos(t) * distance });

/** Startet blind das vorderste Schiff der ersten Spalte, deren Plattform frei ist – außer Schiffe fertiger Farben (die
 *  blockierten für immer). Steht unter keiner freien Plattform ein Schiff, wird die vorderste Reihe einmal geschoben. */
function launchAny(game) {
  const column = game.columns.findIndex((c, i) => c.length && !game.slots[i] && game.asteroid.aliveByColor.get(c[0].color));
  if (column >= 0) return game.launch(column);
  return game.slots.includes(null) ? game.slide(-1) : [];
}

/** Munition je Farbe (Warteschlange + Hangar) */
function ammoByColor(game) {
  const ammo = {};
  const ships = [...game.columns.flat(), ...game.slots.filter(e => e && e.phase !== 'leaving').map(e => e.ship)];
  for (const ship of ships) ammo[ship.color] = (ammo[ship.color] ?? 0) + ship.ammo;
  return ammo;
}

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
    expect(JSON.stringify(a.columns)).toBe(JSON.stringify(b.columns));
    const c = createGame(LEVELS[0], { seed: 'anders' });
    expect(JSON.stringify(c.columns)).not.toBe(JSON.stringify(a.columns));
  });

  it.each(LEVELS.map((level, i) => [i + 1, level]))('Level %i: Munition pro Farbe = Voxelanzahl + Reserve', (_, level) => {
    const game = createGame(level);
    const voxels = {};
    for (const v of game.asteroid.voxels) voxels[v.color] = (voxels[v.color] ?? 0) + 1;
    const ammo = {};
    for (const ship of game.columns.flat()) ammo[ship.color] = (ammo[ship.color] ?? 0) + ship.ammo;
    for (const [color, n] of Object.entries(voxels)) {
      if (color === BLAST) expect(ammo[color]).toBe(n);   // je Kristall ein Spreng-Flieger
      else if (n < MIN_AMMO) expect(ammo[color]).toBe(2 * n);   // kleine Farbe: zwei Schiffe
      else expect(ammo[color]).toBe(n + Math.ceil(n * (level.reserve ?? DEFAULT_RESERVE)));
    }
    expect(game.columns).toHaveLength(level.slots);   // Spalte = Plattform
  });

  it.each(LEVELS.map((level, i) => [i + 1, level]))(`Level %i: kein Schiff unter ${MIN_AMMO} Schuss (außer die Farbe hat weniger Würfel)`, (_, level) => {
    const game = createGame(level);
    const voxels = {};
    for (const v of game.asteroid.voxels) voxels[v.color] = (voxels[v.color] ?? 0) + 1;
    for (const ship of game.columns.flat()) {
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
    const game = createGame({ ...level, slots: 300, shuffle: 0 });   // ohne Durchmischung, unbegrenzt: läuft lange genug
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
    const game = createGame({ ...LEVELS[0], slots: 300 });
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
  it('ein Schiff fliegt nur auf die Plattform über seiner Spalte; ist sie belegt, geht nichts', () => {
    const game = createGame(LEVELS[0]);
    expect(game.columns).toHaveLength(game.slots.length);
    const ship = game.columns[2][0];
    expect(game.launch(2)[0]).toMatchObject({ type: 'launch', ship, slot: 2 });
    expect(game.slots[2].ship).toBe(ship);
    expect(game.slots.filter(Boolean)).toHaveLength(1);
    // dieselbe Spalte noch einmal: Plattform belegt, obwohl andere frei sind
    expect(game.canLaunch(2)).toBe('full');
    expect(game.launch(2)).toEqual([]);
    expect(game.canLaunch(3)).toBe('ok');
    expect(game.launch(4)[0]).toMatchObject({ type: 'launch', slot: 4 });
    expect(game.canLaunch(99)).toBe('empty');
  });

  it('Schieben: vorderste Reihe rückt einen Platz, das Randschiff ist weg', () => {
    for (const dir of [-1, 1]) {
      const game = createGame({ ...LEVELS[0], crystals: 0 });   // ohne Spreng-Flieger
      const n = game.columns.length;
      const fronts = game.columns.map(c => c[0]);
      const edge = dir < 0 ? 0 : n - 1;
      const other = dir < 0 ? n - 1 : 0;
      const nextUp = game.columns[other][1];
      const total = game.columns.flat().length;
      const before = ammoByColor(game);
      const [event] = game.slide(dir);
      expect(event).toEqual({ type: 'slide', dir, out: fronts[edge] });
      expect(game.columns.flat()).not.toContain(fronts[edge]);
      expect(game.columns.flat()).toHaveLength(total - 1);
      for (let i = 0; i < n; i++) {
        if (i === other) expect(game.columns[i][0]).toBe(nextUp);
        else expect(game.columns[i][0]).toBe(fronts[i - dir]);
      }
      const color = fronts[edge].color;
      expect(ammoByColor(game)).toEqual({ ...before, [color]: before[color] - fronts[edge].ammo });
      expect(game.state).toBe('play');   // ein Schiff darf man dank Reserve hergeben
    }
  });

  it('wer ein Schiff aussortiert, ohne das seine Farbe nicht mehr reicht, verliert', () => {
    const game = createGame({ ...LEVELS[0], crystals: 0 });
    const ship = game.columns[0][0];
    // Reserve dieser Farbe aufbrauchen: alle anderen Schiffe der Farbe weg, dieses trägt genau den Bedarf
    for (const column of game.columns) column.splice(0, column.length, ...column.filter(s => s === ship || s.color !== ship.color));
    ship.ammo = game.asteroid.aliveByColor.get(ship.color);
    expect(game.essential(ship)).toBe(true);
    expect(game.essential(game.columns[1][0])).toBe(false);
    expect(game.slide(-1)).toContainEqual({ type: 'lost', reason: 'ammo', color: ship.color });
    expect(game.state).toBe('lost');
  });

  it('nach beliebigem Schieben und Starten: Munition je Farbe ≥ lebende Würfel, bis zu viel aussortiert ist', () => {
    const level = LEVELS.find(l => l.crystals > 0);
    const game = createGame(level);
    const rng = createRng('schieben');
    let slides = 0;
    let events = [];
    for (let k = 0; k < 300 && game.state === 'play'; k++) {
      events = rng() < 0.7 ? game.slide(rng() < 0.5 ? -1 : 1) : game.launch(Math.floor(rng() * game.columns.length));
      slides += events.some(e => e.type === 'slide');
      if (game.state !== 'play') break;
      const ammo = ammoByColor(game);
      for (const [color, alive] of Object.entries(aliveByColor(game))) expect(ammo[color]).toBeGreaterThanOrEqual(alive);
    }
    expect(slides).toBeGreaterThan(1);
    // blindes Schieben verbraucht irgendwann zu viel Reserve
    expect(events.find(e => e.type === 'lost')).toMatchObject({ reason: 'ammo' });
  });

  it('ein aussortierter Spreng-Flieger entschärft einen Kristall: normaler Block, ein Schiff seiner Farbe +1 Munition', () => {
    const level = LEVELS.find(l => l.crystals > 0);
    const game = createGame(level);
    const column = game.columns.findIndex(c => c.some(s => s.special === 'bomber'));
    const bomber = game.columns[column].find(s => s.special === 'bomber');
    game.columns[column].splice(game.columns[column].indexOf(bomber), 1);
    game.columns[0].unshift(bomber);   // an den linken Rand
    const blast = game.asteroid.aliveByColor.get(BLAST);
    const spare = Object.fromEntries([...game.asteroid.aliveByColor.keys()].map(c => [c, game.spare(c)]));
    const events = game.slide(-1);
    expect(events[0]).toEqual({ type: 'slide', dir: -1, out: bomber });
    expect(game.columns.flat()).not.toContain(bomber);
    const defuse = events.find(e => e.type === 'defuse');
    expect(defuse).toBeTruthy();
    const { crystal, ship } = defuse;
    expect(crystal).toMatchObject({ crystal: false, color: crystal.baseColor, alive: true });
    expect(ship.color).toBe(crystal.baseColor);
    expect(game.asteroid.aliveByColor.get(BLAST)).toBe(blast - 1);
    expect(game.columns.flat().filter(s => s.special === 'bomber')).toHaveLength(blast - 1);
    // Reserve bleibt gleich: ein Block mehr, ein Schuss mehr
    expect(game.spare(crystal.baseColor)).toBe(spare[crystal.baseColor]);
    expect(game.state).toBe('play');
  });

  it('Schiff schießt erst nach dem Anflug', () => {
    const game = createGame(LEVELS[0]);
    game.launch(0);
    expect(game.step(TIMING.arrive / 2, orbit(0)).some(e => e.type === 'fire')).toBe(false);
    let fired = false;
    for (let t = 0; t < 10 && !fired; t += 0.05) fired = game.step(0.05, orbit(t)).some(e => e.type === 'fire');
    expect(fired).toBe(true);
  });

  it.each(LEVELS.map((level, i) => [i + 1, level]))('Level %i ist mit unbegrenztem Hangar immer zu gewinnen', (_, level) => {
    const game = createGame({ ...level, slots: 300 });
    autoplay(game);
    expect(game.state).toBe('won');
    expect(game.destroyed).toBe(game.asteroid.total);
  });

  it('ein Schiff ohne Ziel ganz außen bleibt blockiert auf seiner Plattform, ohne zu schießen', () => {
    const game = createGame({ ...LEVELS[0], slots: 2 });
    const ship = deepShip(game, 900);
    game.columns[0].unshift(ship);
    game.launch(0);
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
    game.columns[0].unshift(deepShip(game, 900));
    game.columns[1].unshift(deepShip(game, 901));
    game.launch(0);
    game.launch(1);
    let lost = null;
    for (let t = 0; t < 5 && !lost; t += 0.05) lost = game.step(0.05, orbit(t)).find(e => e.type === 'lost');
    expect(lost).toEqual({ type: 'lost', reason: 'jam' });
    expect(game.state).toBe('lost');
  });

  it('volle Slots ohne passende Ziele → verloren', () => {
    const game = createGame({ ...LEVELS[0], slots: 1 });
    game.launch(0);
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
      for (const c of crystals) expect(c.layer).toBeGreaterThanOrEqual(Math.min(2, level.core.length));
    }
  });

  it('je Spreng-Block genau ein Spreng-Flieger mit einer Bombe; normale Schiffe haben nie die Spreng-Farbe', () => {
    const game = createGame(withCrystals);
    const ships = game.columns.flat();
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
    const column = game.columns.findIndex(c => c.length);
    game.columns[column].unshift({ id: 999, color: crystal.color, ammo: 1 });
    game.launch(column);
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

  it('ist eine Farbe fertig, bleiben ihre Schiffe stehen – gestartet blockieren sie die Plattform für immer', () => {
    const game = createGame({ ...LEVELS[0], slots: 2 });
    const color = game.columns[0][0].color;
    const waiting = game.columns.flat().filter(s => s.color === color).length;
    // alle Voxel der Farbe von außen entfernen (wie durch Bruchstücke), dann einen Schritt rechnen
    for (const v of game.asteroid.voxels) if (v.color === color) {
      v.alive = false;
      game.asteroid.alive--;
    }
    game.asteroid.aliveByColor.set(color, 0);
    game.step(0.01, orbit(0));
    expect(game.columns.flat().filter(s => s.color === color)).toHaveLength(waiting);
    // hinausschieben kostet nichts (wird nicht mehr gebraucht)
    expect(game.essential(game.columns[0][0])).toBe(false);
    const ship = game.columns[0][0];
    game.launch(0);
    expect(game.slots[0].doomed).toBe(true);
    const events = [];
    for (let t = 0; t < 5; t += 0.05) events.push(...game.step(0.05, orbit(t)));
    expect(events.some(e => e.type === 'leave' || e.type === 'fire')).toBe(false);
    expect(game.slots[0]).toMatchObject({ ship, phase: 'ready' });
  });

  it('wird die Farbe fertig, während das Schiff auf der Plattform steht, fliegt es mit Restmunition ab', () => {
    const game = createGame(LEVELS[0]);
    game.launch(0);
    const { ship } = game.slots[0];
    for (let t = 0; t < TIMING.arrive + 0.05; t += 0.05) game.step(0.05, orbit(t));
    for (const v of game.asteroid.voxels) if (v.color === ship.color && v.alive) removeVoxel(game.asteroid, v);
    const events = [];
    for (let t = 0; t < 2; t += 0.05) events.push(...game.step(0.05, orbit(t)));
    expect(events.some(e => e.type === 'leave' && e.ship === ship)).toBe(true);
  });

  it('Level mit Kristallen sind mit unbegrenztem Hangar zu gewinnen, Schiffe mit Restmunition fliegen ab', () => {
    const game = createGame({ ...withCrystals, slots: 300 });
    autoplay(game);
    expect(game.state).toBe('won');
  });
});

describe('Simulation (Bots)', () => {
  it.each(LEVELS.map((level, i) => [i + 1, level]))('Level %i: der schlaue Bot gewinnt mit dem echten Hangar mindestens 2 von 3 Seeds', (_, level) => {
    const runs = [0, 1, 2].map(k => simulate(level, { bot: 'smart', seed: `${level.seed}#${k}` }));
    expect(runs.filter(r => r.won).length).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it('der Zufalls-Bot schiebt auch, beide melden Starts und Schübe', () => {
    const r = simulate(LEVELS[0], { bot: 'random' });
    expect(r.slides).toBeGreaterThan(0);
    expect(r.launches).toBeGreaterThan(0);
    expect(simulate(LEVELS[0])).toMatchObject({ won: true, left: 0 });
  });
});

describe('Sterne und Specials', () => {
  it('Sterne: 0 vor dem Sieg; drei ohne Aussortieren, weniger je mehr Reserve aussortiert wurde', () => {
    const game = createGame({ ...LEVELS[0], crystals: 0 });
    expect(game.stars()).toBe(0);
    expect(game.stats.reserve).toBeGreaterThan(0);
    game.clearAll();
    game.step(0.01, orbit(0));
    expect(game.state).toBe('won');
    expect(game.stars()).toBe(3);
    game.stats.discarded = game.stats.reserve * (STAR_TWO + STAR_THREE) / 2;
    expect(game.stars()).toBe(2);
    game.stats.discarded = game.stats.reserve * 0.9;
    expect(game.stars()).toBe(1);
    game.stats.discarded = 0;
    game.stats.bombersLost = 1;
    expect(game.stars()).toBe(2);   // verschenkter Bomber kostet den dritten Stern
  });

  it('Aussortieren zählt für die Sterne mit', () => {
    const game = createGame({ ...LEVELS[0], crystals: 0 });
    const out = game.columns[0][0];
    game.slide(-1);
    expect(game.stats.discarded).toBe(out.ammo);
  });

  it('Plattform +1: ein Schiff darf auf die Zusatz-Plattform, wenn seine eigene belegt ist – je Versuch einmal', () => {
    const game = createGame(LEVELS[0]);
    game.launch(0);
    expect(game.canLaunch(0)).toBe('full');
    expect(game.special('pad')).toEqual([{ type: 'pad', slot: LEVELS[0].slots }]);
    expect(game.canLaunch(0)).toBe('ok');
    expect(game.launch(0)[0]).toMatchObject({ type: 'launch', slot: LEVELS[0].slots });
    expect(game.canLaunch(0)).toBe('full');
    expect(game.special('pad')).toEqual([]);
  });

  it('Farbwechsel: äußerste Blöcke anderer Farben bekommen die Farbe des Fliegers, er die Schüsse dazu', () => {
    const game = createGame({ ...LEVELS[0], crystals: 0 });
    const ship = game.columns[0][0];
    const ammo = ship.ammo;
    const before = ammoByColor(game);
    const [event] = game.special('recolor', 0);
    expect(event.type).toBe('recolor');
    expect(event.voxels.length).toBeGreaterThan(0);
    expect(event.voxels.every(v => v.color === ship.color && hittable(game.asteroid, v))).toBe(true);
    expect(ship.ammo).toBe(ammo + event.voxels.length);
    // Munition reicht weiter für jede Farbe
    const after = ammoByColor(game);
    for (const [color, alive] of Object.entries(aliveByColor(game))) expect(after[color]).toBeGreaterThanOrEqual(alive);
    expect(after[ship.color]).toBe(before[ship.color] + event.voxels.length);
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
