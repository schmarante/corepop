// Alle Figuren, aus denen ein Level gebaut werden kann. Eine Figur legt nur Form und Außenhaut fest – der bunte
// Kern darunter (Lolli-Schichten) und die Kristalle kommen aus der Level-Definition (asteroid.js).
//
// Ein Modell ist eine Funktion (params, rng) → { bounds, solid(x, y, z), skin(x, y, z) }:
//   bounds  halbe Kantenlänge des Würfels, in dem gesucht wird (Voxel-Koordinaten −bounds … +bounds)
//   solid   liegt an dieser Stelle ein Voxel?
//   skin    Farbe der Außenhaut an dieser Stelle (Ids aus colors.js) – so wird die Figur erkennbar
// Neue Figur: Datei in diesem Ordner, hier eintragen, in levels.js verwenden – erscheint automatisch in der
// Dev-Übersicht (/dev/modelle/). Nur eigene Designs: keine erkennbaren fremden Figuren/Fahrzeuge/Logos, auch nicht
// verpixelt. Erfahrung: bei ~16–20 Voxeln Durchmesser funktionieren nur markante, kontrastreiche Muster und Formen.
import { footballModel, SKIN_COLORS as FOOTBALL_SKIN } from './football.js';
import { basketballModel, SKIN_COLORS as BASKETBALL_SKIN } from './basketball.js';
import { heartModel, SKIN_COLORS as HEART_SKIN } from './heart.js';
import { poopModel, SKIN_COLORS as POOP_SKIN } from './poop.js';
import { chestModel, SKIN_COLORS as CHEST_SKIN } from './chest.js';
import { pirateShipModel, SKIN_COLORS as PIRATE_SHIP_SKIN } from './pirate-ship.js';
import { rocketModel, SKIN_COLORS as ROCKET_SKIN } from './rocket.js';
import { watermelonModel, SKIN_COLORS as WATERMELON_SKIN } from './watermelon.js';
import { avocadoModel, SKIN_COLORS as AVOCADO_SKIN } from './avocado.js';
import { popsicleModel, SKIN_COLORS as POPSICLE_SKIN } from './popsicle.js';
import { teddyModel, SKIN_COLORS as TEDDY_SKIN } from './teddy.js';
import { chickenModel, SKIN_COLORS as CHICKEN_SKIN } from './chicken.js';
import { mushroomModel, SKIN_COLORS as MUSHROOM_SKIN } from './mushroom.js';

export const MODELS = {
  football: { build: footballModel, skinColors: FOOTBALL_SKIN },
  basketball: { build: basketballModel, skinColors: BASKETBALL_SKIN },
  heart: { build: heartModel, skinColors: HEART_SKIN },
  poop: { build: poopModel, skinColors: POOP_SKIN },
  rocket: { build: rocketModel, skinColors: ROCKET_SKIN },
  watermelon: { build: watermelonModel, skinColors: WATERMELON_SKIN },
  avocado: { build: avocadoModel, skinColors: AVOCADO_SKIN },
  popsicle: { build: popsicleModel, skinColors: POPSICLE_SKIN },
  teddy: { build: teddyModel, skinColors: TEDDY_SKIN },
  chicken: { build: chickenModel, skinColors: CHICKEN_SKIN },
  mushroom: { build: mushroomModel, skinColors: MUSHROOM_SKIN },
  chest: { build: chestModel, skinColors: CHEST_SKIN },
  pirateShip: { build: pirateShipModel, skinColors: PIRATE_SHIP_SKIN },
};
