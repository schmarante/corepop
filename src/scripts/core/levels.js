// Level-Definitionen.
//   model    Figur, die die Außenhaut bestimmt: { type, …Parameter } (siehe models/)
//   radius   Grundgröße der Figur in Voxeln
//   skin     Dicke der Außenhaut in Voxeln (in den Farben der Figur)
//   core     Kernschichten von außen nach innen („Lolli“); mehrere Farben einer Schicht bilden eine Spirale
//   slots    Hangar-Plattformen. Schiffe ohne Ziel blockieren ihre; alle blockiert = verloren (wichtigster Hebel)
//   belt     Tempo des Förderbands in Plätzen/s (Standard DEFAULT_BELT_SPEED, core/game.js). Ein Schiff ist
//            8 / belt Sekunden sichtbar (0.2 → 40 s, 0.3 → 27 s); zugleich kommt alle 1 / belt Sekunden ein neues –
//            schneller = kürzeres Level, aber mehr Zeitdruck und mehr Schiffe fallen herunter
//   shuffle  mischt die Reihenfolge (0 … 1.8, core/fleet.js): Schiffe für tiefe Kernfarben kommen früher aufs Band
//   spin     Eigendrehung (rad/s)
//   ships    Mischung der Schiffsklassen { Munition: Gewicht } – 50, 100, 250 (core/fleet.js); größere Schiffe =
//            weniger Schiffe (kürzeres Level), aber Fehlgriffe blockieren länger und ein großes Schiff braucht lange,
//            bis es leer ist (der Hangar kommt dem Band schwerer hinterher)
//   reserve  Extra-Munition je Farbe (Anteil, Standard 0.25 – core/fleet.js): so viel darf herunterfallen. Mehr
//            Reserve = verzeihender, aber auch mehr übrige Schiffe fertiger Farben (Fallen, die blind gestartet
//            für immer blockieren)
//   crystals Anzahl Riss-Kristalle in den inneren Kernschichten (wunde Punkte, sprengen ein Bruchstück ab)
//   boss     Zwischenboss (größer, mehr Würfel) – optional
//   seed     Startwert für den Zufall – gleicher Seed, gleiches Level
//
// Look-Phase: je Figur ein Level (Übersicht: /dev/modelle/).
export const LEVELS = [
  { model: { type: 'football' }, radius: 8, skin: 1, core: [['y'], ['b', 'p'], ['g'], ['r']], spin: 0.3, ships: { 50: 1, 100: 1 }, slots: 5, belt: 0.25, shuffle: 0, crystals: 2, seed: 'corepop-football' },
  { model: { type: 'basketball' }, radius: 8, skin: 1, core: [['y'], ['b', 'p'], ['g'], ['r']], spin: 0.3, ships: { 100: 2, 250: 1 }, slots: 5, belt: 0.25, shuffle: 0.9, crystals: 2, seed: 'corepop-basketball' },
  { model: { type: 'heart' }, radius: 9, skin: 1, core: [['y'], ['b', 'p'], ['g'], ['o']], spin: 0.35, ships: { 100: 1 }, slots: 4, belt: 0.25, shuffle: 1.2, crystals: 2, seed: 'corepop-heart' },
  { model: { type: 'poop' }, radius: 9, skin: 1, core: [['y'], ['b', 'p'], ['g'], ['r']], spin: 0.3, ships: { 50: 1, 100: 1 }, slots: 4, belt: 0.3, shuffle: 0.6, crystals: 2, seed: 'corepop-poop' },
  { model: { type: 'rocket' }, radius: 11, skin: 1, core: [['y'], ['g', 'p'], ['o']], spin: 0.35, ships: { 100: 1 }, slots: 4, belt: 0.3, shuffle: 1.2, crystals: 2, seed: 'corepop-rocket' },
  // Zwischenboss: deutlich größer
  { model: { type: 'pirateShip' }, radius: 26, skin: 1, core: [['g'], ['b', 'p'], ['o'], ['r']], spin: 0.22, ships: { 100: 1, 250: 1 }, slots: 5, belt: 0.25, shuffle: 0.6, crystals: 3, boss: true, seed: 'corepop-pirate-ship' },
  { model: { type: 'watermelon' }, radius: 9, skin: 1, core: [['y'], ['b', 'p'], ['o']], spin: 0.3, ships: { 50: 1, 100: 1 }, slots: 4, belt: 0.3, shuffle: 0.6, crystals: 2, seed: 'corepop-watermelon' },
  { model: { type: 'avocado' }, radius: 9, skin: 1, core: [['y'], ['b', 'p'], ['o']], spin: 0.3, ships: { 50: 2, 100: 1 }, slots: 3, belt: 0.25, shuffle: 1.2, crystals: 2, seed: 'corepop-avocado' },
  { model: { type: 'popsicle' }, radius: 9, skin: 1, core: [['y'], ['b', 'g']], spin: 0.35, ships: { 50: 2, 100: 1 }, slots: 3, belt: 0.3, shuffle: 0, crystals: 2, seed: 'corepop-popsicle' },
  { model: { type: 'teddy' }, radius: 8, skin: 1, core: [['y'], ['b', 'p'], ['g'], ['r']], spin: 0.3, ships: { 50: 1, 100: 1 }, slots: 4, belt: 0.3, shuffle: 0.6, crystals: 2, seed: 'corepop-teddy' },
  { model: { type: 'chicken' }, radius: 9, skin: 1, core: [['y'], ['b', 'p'], ['g']], spin: 0.3, ships: { 100: 1 }, slots: 4, belt: 0.3, shuffle: 0.6, crystals: 3, seed: 'corepop-chicken' },
  { model: { type: 'mushroom' }, radius: 9, skin: 1, core: [['y'], ['b', 'p'], ['g']], spin: 0.3, ships: { 100: 1 }, slots: 4, belt: 0.3, shuffle: 0.6, crystals: 2, seed: 'corepop-mushroom' },
  { model: { type: 'chest' }, radius: 10, skin: 1, core: [['g'], ['b', 'p'], ['o'], ['r']], spin: 0.3, ships: { 50: 1, 100: 1 }, slots: 4, belt: 0.3, shuffle: 0.6, crystals: 2, seed: 'corepop-chest' },
];

/** Level-Nummer (1-basiert, z. B. aus ?level=) → gültiger Index */
export const levelIndex = n => Math.min(LEVELS.length, Math.max(1, Math.floor(Number(n)) || 1)) - 1;
