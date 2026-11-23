import { describe, expect, it } from 'vitest';
import { LEVELS, levelIndex } from '../src/scripts/core/levels.js';
import { createGame, TIMING, FACING } from '../src/scripts/core/game.js';
import { BLAST, createAsteroid, facing, removeVoxel, voxelKey } from '../src/scripts/core/asteroid.js';
import { createRng } from '../src/scripts/core/rng.js';
import { MODELS } from '../src/scripts/core/models/index.js';

/** Kamera kreist um den Asteroiden (wie die Eigendrehung), Abstand in Voxeln */
const orbit = (t, distance = 20) => ({ x: Math.sin(t) * distance, y: 4, z: Math.cos(t) * distance });

/** Spielt automatisch: startet immer das vorderste Schiff der ersten Spalte, die eins hat. */
function autoplay(game, { seconds = 600, dt = 1 / 30 } = {}) {
  let time = 0;
  while (game.state === 'play' && time < seconds) {
    const column = game.columns.findIndex(c => c.length);
    if (column >= 0) game.launch(column);
    game.step(dt, orbit(time * 0.4));
    time += dt;
  }
  return time;
}

describe('Level-Erzeugung', () => {
  it('ist deterministisch per Seed', () => {
    const a = createGame(LEVELS[0]);
    const b = createGame(LEVELS[0]);
    expect(a.asteroid.voxels.map(v => v.color).join('')).toBe(b.asteroid.voxels.map(v => v.color).join(''));
    expect(JSON.stringify(a.columns)).toBe(JSON.stringify(b.columns));
    const c = createGame(LEVELS[0], { seed: 'anders' });
    expect(JSON.stringify(c.columns)).not.toBe(JSON.stringify(a.columns));
  });

  it.each(LEVELS.map((level, i) => [i + 1, level]))('Level %i: Munition pro Farbe = Voxelanzahl', (_, level) => {
    const game = createGame(level);
    const voxels = {};
    for (const v of game.asteroid.voxels) voxels[v.color] = (voxels[v.color] ?? 0) + 1;
    const ammo = {};
    for (const ship of game.columns.flat()) ammo[ship.color] = (ammo[ship.color] ?? 0) + ship.ammo;
    expect(ammo).toEqual(voxels);
    expect(game.columns).toHaveLength(level.columns);
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
    const game = createGame({ ...level, slots: 4, shuffle: 0 });   // ohne Durchmischung: das Spiel läuft lange genug
    const ship = { x: 0, y: -25, z: 18 };
    let time = 0;
    let checked = 0;
    while (game.state === 'play' && time < 400) {
      const column = game.columns.findIndex(c => c.length);
      if (column >= 0) game.launch(column);
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

  it('jeder Schuss tritt durch eine freie Fläche ein, die zur Kamera oder zum Schiff zeigt', () => {
    const game = createGame({ ...LEVELS[0], slots: 99 });
    const ship = { x: 0, y: -25, z: 18 };
    let time = 0;
    let fired = 0;
    while (game.state === 'play' && time < 8) {
      const column = game.columns.findIndex(c => c.length);
      if (column >= 0) game.launch(column);
      const camera = orbit(time * 0.4);
      for (const e of game.step(1 / 30, camera, () => ship))
        if (e.type === 'fire') {
          fired++;
          const { voxel, normal } = e.shot;
          // vor der Eintrittsfläche liegt kein Voxel
          expect(game.asteroid.grid.has(voxelKey(voxel.x + normal[0], voxel.y + normal[1], voxel.z + normal[2]))).toBe(false);
          const toward = p => {
            const d = [p.x - voxel.x, p.y - voxel.y, p.z - voxel.z];
            return (normal[0] * d[0] + normal[1] * d[1] + normal[2] * d[2]) / Math.hypot(...d);
          };
          expect(Math.max(toward(camera), toward(ship))).toBeGreaterThanOrEqual(FACING);
        }
      time += 1 / 30;
    }
    expect(fired).toBeGreaterThan(50);
  });
});

describe('Spielablauf', () => {
  it('Start füllt Slots, bei vollem Hangar geht nichts mehr', () => {
    const game = createGame({ ...LEVELS[0], slots: 2 });
    expect(game.launch(0)[0]).toMatchObject({ type: 'launch', slot: 0 });
    expect(game.launch(1)[0]).toMatchObject({ type: 'launch', slot: 1 });
    expect(game.canLaunch(2)).toBe('full');
    expect(game.launch(2)).toEqual([]);
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
    const game = createGame({ ...level, slots: 99 });
    autoplay(game);
    expect(game.state).toBe('won');
    expect(game.destroyed).toBe(game.asteroid.total);
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
    expect(game.state).toBe('lost');
  });
});

describe('Riss-Kristalle', () => {
  const withCrystals = LEVELS.find(l => l.crystals > 0);

  it('Level ohne Kristalle haben keine, die anderen so viele wie angegeben', () => {
    for (const level of LEVELS) expect(createGame(level).asteroid.crystals).toHaveLength(level.crystals ?? 0);
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
      expect(c.layer).toBe(1);
      expect(c.exposed).toBe(false);
      expect(c.chunk.length).toBeGreaterThan(5);
    }
  });

  it('ein Treffer auf den Kristall sprengt sein Bruchstück ab', () => {
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
    const breaking = crystal.chunk.filter(v => v.alive).length;
    const events = [];
    for (let t = 0; t < 3; t += 0.05) events.push(...game.step(0.05, camera));
    expect(events.find(e => e.type === 'hit')?.voxel).toBe(crystal);
    expect(events.find(e => e.type === 'break').voxels).toHaveLength(breaking);
    expect(crystal.chunk.every(v => !v.alive)).toBe(true);
    expect(game.destroyed).toBe(before + 1 + breaking);
  });

  it('detonate zündet einen Kristall sofort', () => {
    const game = createGame(withCrystals);
    const crystal = game.asteroid.crystals[0];
    const events = game.detonate(crystal);
    expect(events.map(e => e.type).slice(0, 2)).toEqual(['hit', 'break']);
    expect(crystal.alive).toBe(false);
    expect(crystal.chunk.every(v => !v.alive)).toBe(true);
    expect(game.detonate(crystal)).toEqual([]);
  });

  it('ist eine Farbe weg, verschwinden ihre Schiffe aus der Warteschlange', () => {
    const game = createGame(LEVELS[0]);
    const color = game.columns[0][0].color;
    const waiting = game.columns.flat().filter(s => s.color === color).length;
    const events = [];
    // alle Voxel der Farbe von außen entfernen (wie durch Bruchstücke), dann einen Schritt rechnen
    for (const v of game.asteroid.voxels) if (v.color === color) {
      v.alive = false;
      game.asteroid.alive--;
    }
    game.asteroid.aliveByColor.set(color, 0);
    events.push(...game.step(0.01, orbit(0)));
    expect(events).toContainEqual({ type: 'skip', color, count: waiting });
    expect(game.columns.flat().some(s => s.color === color)).toBe(false);
  });

  it('Level mit Kristallen sind mit unbegrenztem Hangar zu gewinnen, Schiffe mit Restmunition fliegen ab', () => {
    const game = createGame({ ...withCrystals, slots: 99 });
    autoplay(game);
    expect(game.state).toBe('won');
  });
});
