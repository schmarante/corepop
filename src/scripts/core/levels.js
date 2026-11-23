// Level-Definitionen.
//   model    Figur, die die Außenhaut bestimmt: { type, …Parameter } (siehe models/)
//   radius   Grundgröße der Figur in Voxeln
//   skin     Dicke der Außenhaut in Voxeln (in den Farben der Figur)
//   core     Kernschichten von außen nach innen („Lolli“); mehrere Farben einer Schicht bilden eine Spirale
//   slots    Hangar-Plätze
//   columns  Spalten der Warteschlange
//   spin     Eigendrehung (rad/s)
//   ships    Mischung der Schiffsklassen { Munition: Gewicht } – 20, 50, 100, 250 (core/fleet.js); mehr große
//            Schiffe = Fehlgriffe blockieren länger
//   crystals Anzahl Riss-Kristalle in der ersten Kernschicht (wunde Punkte, sprengen ein Bruchstück ab)
//   boss     Zwischenboss (größer, mehr Würfel) – optional
//   seed     Startwert für den Zufall – gleicher Seed, gleiches Level
//
// Look-Phase: je Figur ein Level (Übersicht: /dev/modelle/).
export const LEVELS = [
  { model: { type: 'football' }, radius: 8, skin: 1, core: [['y'], ['b', 'p'], ['g'], ['r']], spin: 0.3, ships: { 20: 3, 50: 1 }, slots: 5, shuffle: 0, columns: 4, crystals: 2, seed: 'corepop-football' },
  { model: { type: 'basketball' }, radius: 8, skin: 1, core: [['y'], ['b', 'p'], ['g'], ['r']], spin: 0.3, ships: { 20: 2, 50: 1 }, slots: 5, shuffle: 0.2, columns: 4, crystals: 2, seed: 'corepop-basketball' },
  { model: { type: 'heart' }, radius: 9, skin: 1, core: [['y'], ['b', 'p'], ['g'], ['o']], spin: 0.35, ships: { 20: 2, 50: 2 }, slots: 5, shuffle: 0.4, columns: 4, crystals: 2, seed: 'corepop-heart' },
  { model: { type: 'poop' }, radius: 9, skin: 1, core: [['y'], ['b', 'p'], ['g'], ['r']], spin: 0.3, ships: { 20: 1, 50: 2, 100: 1 }, slots: 4, shuffle: 0.4, columns: 4, crystals: 2, seed: 'corepop-poop' },
  { model: { type: 'rocket' }, radius: 11, skin: 1, core: [['y'], ['g', 'p'], ['o']], spin: 0.35, ships: { 20: 1, 50: 2, 100: 1 }, slots: 4, shuffle: 0.6, columns: 4, crystals: 2, seed: 'corepop-rocket' },
  // Zwischenboss: deutlich größer
  { model: { type: 'pirateShip' }, radius: 20, skin: 1, core: [['g'], ['b', 'p'], ['o'], ['r']], spin: 0.22, ships: { 50: 2, 100: 2, 250: 1 }, slots: 4, shuffle: 0.8, columns: 4, crystals: 3, boss: true, seed: 'corepop-pirate-ship' },
  { model: { type: 'watermelon' }, radius: 9, skin: 1, core: [['y'], ['b', 'p'], ['o']], spin: 0.3, ships: { 20: 1, 50: 2, 100: 1 }, slots: 4, shuffle: 0.6, columns: 4, crystals: 2, seed: 'corepop-watermelon' },
  { model: { type: 'avocado' }, radius: 9, skin: 1, core: [['y'], ['b', 'p'], ['o']], spin: 0.3, ships: { 20: 1, 50: 2, 100: 2 }, slots: 4, shuffle: 0.8, columns: 4, crystals: 2, seed: 'corepop-avocado' },
  { model: { type: 'popsicle' }, radius: 9, skin: 1, core: [['y'], ['b', 'g']], spin: 0.35, ships: { 50: 2, 100: 2 }, slots: 4, shuffle: 1, columns: 4, crystals: 2, seed: 'corepop-popsicle' },
  { model: { type: 'teddy' }, radius: 8, skin: 1, core: [['y'], ['b', 'p'], ['g'], ['r']], spin: 0.3, ships: { 20: 1, 50: 2, 100: 2 }, slots: 3, shuffle: 0.8, columns: 4, crystals: 2, seed: 'corepop-teddy' },
  { model: { type: 'chicken' }, radius: 9, skin: 1, core: [['y'], ['b', 'p'], ['g']], spin: 0.3, ships: { 50: 2, 100: 2, 250: 1 }, slots: 3, shuffle: 1, columns: 4, crystals: 2, seed: 'corepop-chicken' },
  { model: { type: 'mushroom' }, radius: 9, skin: 1, core: [['y'], ['b', 'p'], ['g']], spin: 0.3, ships: { 50: 1, 100: 2, 250: 1 }, slots: 3, shuffle: 1.2, columns: 4, crystals: 2, seed: 'corepop-mushroom' },
  { model: { type: 'chest' }, radius: 10, skin: 1, core: [['g'], ['b', 'p'], ['o'], ['r']], spin: 0.3, ships: { 50: 1, 100: 2, 250: 2 }, slots: 3, shuffle: 1.4, columns: 4, crystals: 2, seed: 'corepop-chest' },
];

/** Level-Nummer (1-basiert, z. B. aus ?level=) → gültiger Index */
export const levelIndex = n => Math.min(LEVELS.length, Math.max(1, Math.floor(Number(n)) || 1)) - 1;
