// Modell „Piratenschiff“ (Zwischenboss, Comic-Stil, eigenes Design): bauchiger Holzrumpf in Bananenform – Bug (+x)
// und Heck biegen sich stark nach oben –, darauf hinten eine dicke, kopflastige Kapitänskajüte (breiter als der Rumpf,
// hinten überstehend, gewölbtes Dach, runde Bullaugen mit Goldrand, Fensterreihe am Heck). Vorn ein schräger
// Bugspriet, am Rumpf ein goldener Zierstreifen und Kanonenluken. Ein Mast mit großem, gebauschtem schwarzen Segel mit
// weißem Totenkopf und gekreuzten Knochen, Rahen und Ausguck. Deutlich größer als die anderen Figuren.
// Der bunte Kern steckt in Rumpf und Kajüte (Mast und Segel sind nur Haut).
import { inCylinderY } from './shapes.js';

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['u', 'n', 'w', 'y'];

/** @param {{ radius: number }} params  radius: halbe Schiffslänge in Voxeln */
export function pirateShipModel({ radius: R }) {
  const shift = R * 0.3;                // Modell vertikal zentrieren
  const H = R * 0.42;                   // Rumpftiefe unter dem tiefsten Deckpunkt
  const B = R * 0.3;                    // halbe Breite (Mitte)
  const stern = -R * 0.86;              // Heck des Rumpfs
  const bow = R;                        // Bugspitze
  /** Deckhöhe: Bananenform – in der Mitte 0, zu Bug und Heck stark ansteigend */
  const deckAt = x => R * 0.2 * (x / R) ** 2 * (x > 0 ? 1.1 : 0.8);
  /** Kiel: unten rund, an den Enden hochgezogen */
  const keelAt = x => -H * (1 - 0.55 * Math.abs(x / R) ** 3);
  /** halbe Breite: bauchig in der Mitte, Bug spitz, Heck abgerundet */
  const beamAt = (x, Y) => {
    let f = 1.08 - 0.08 * (x / R) ** 2;
    if (x > R * 0.3) f *= Math.sqrt(Math.max(0, 1 - ((x - R * 0.3) / (bow - R * 0.3)) ** 2));
    if (x < -R * 0.7) f *= 0.92;
    const keel = keelAt(x);
    const g = Y < 0 ? Math.sqrt(Math.max(0, 1 - (Y / keel) ** 2)) : 1;   // runder Boden
    return B * f * g;
  };
  const inHull = (x, Y, z) => x >= stern && x <= bow && Y >= keelAt(x) && Y <= deckAt(x) && Math.abs(z) <= beamAt(x, Y) + 0.3;

  // Kapitänskajüte: dicker, kopflastiger Kasten über dem Heck, breiter als der Rumpf und hinten überstehend
  const cabin = { front: -R * 0.4, back: -R * 0.98, half: B * 1.18, base: 0, roof: R * 0.5 };
  /** Dach gewölbt (zur Seite abfallend), Seiten nach unten leicht eingezogen */
  const inCabin = (x, Y, z) => {
    if (x < cabin.back || x > cabin.front || Y < Math.max(cabin.base, keelAt(x) + 2) || Y > cabin.roof) return false;
    const t = (Y - cabin.base) / (cabin.roof - cabin.base);
    const half = cabin.half * (0.88 + 0.12 * Math.min(1, t * 1.6));
    const roof = cabin.roof - 2.2 * (z / cabin.half) ** 2 - (x > cabin.front - 2 ? 1 : 0);
    return Math.abs(z) <= half && Y <= roof;
  };
  const portholes = [-0.52, -0.7, -0.87].map(f => ({ x: R * f, y: cabin.roof * 0.52 }));
  /** Bugspriet: schräge Stange vorn */
  const inBowsprit = (x, Y, z) => {
    if (x < bow - 2 || x > bow + R * 0.24) return false;
    const yLine = deckAt(bow) + (x - bow) * 0.55;
    return Math.hypot(Y - yLine, z) <= 0.75;
  };

  const mast = { x: Math.round(R * 0.12), top: R * 1.18 };
  const sail = { y0: R * 0.16, y1: R * 1.02, half: R * 0.48, bulge: 2.2 };
  const nestY = mast.top - R * 0.12;
  const inMast = (x, Y, z) =>
    inCylinderY(x, Y, z, [mast.x, 0], 0.7, 0, mast.top) ||
    (Y >= nestY && Y <= nestY + 1.6 && Math.hypot(x - mast.x, z) <= 2.2) ||                       // Ausguck
    [sail.y0 - 0.6, sail.y1 + 0.6].some(y => Math.abs(Y - y) < 0.6 && Math.abs(x - mast.x) <= sail.half + 1.5 && Math.abs(z) < 0.6);   // Rahen

  /** Lage im Segel: u = −1 … 1 (quer), v = 0 … 1 (unten → oben) */
  const sailUV = (x, Y) => [(x - mast.x) / sail.half, (Y - sail.y0) / (sail.y1 - sail.y0)];
  /** Segel: gebauschte, dünne Fläche quer zum Schiff, wölbt sich nach vorn (+z) */
  const inSail = (x, Y, z) => {
    const [u, v] = sailUV(x, Y);
    if (v < 0 || v > 1 || Math.abs(u) > 1) return false;
    const bulge = sail.bulge * Math.sin(Math.PI * v) * Math.cos((Math.PI / 2) * u);
    return z >= bulge - 0.65 && z <= bulge + 0.65;
  };
  /** Totenkopf mit gekreuzten Knochen auf dem Segel (in Segel-Koordinaten, Seitenverhältnis ausgeglichen) */
  const aspect = (sail.y1 - sail.y0) / (2 * sail.half);
  const skull = (u, v) => {
    const sv = (v - 0.64) * aspect * 2;           // senkrecht in denselben Einheiten wie u
    const head = Math.hypot(u / 0.44, sv / 0.4) <= 1;
    const jaw = Math.abs(u) <= 0.26 && sv < -0.22 && sv > -0.56;
    const eye = [-1, 1].some(s => Math.hypot(u - s * 0.19, sv - 0.03) <= 0.13);
    const nose = Math.abs(u) <= 0.06 && sv < -0.12 && sv > -0.26;
    const teeth = jaw && sv < -0.38 && sv > -0.5 && Math.abs(((u + 0.26) / 0.13) % 1 - 0.5) < 0.18;
    if (eye || nose || teeth) return false;       // Löcher bleiben schwarz
    if (head || jaw) return true;
    // gekreuzte Knochen unter dem Schädel: zwei Diagonalen mit verdickten Enden
    const bv = (v - 0.2) * aspect * 2;
    for (const s of [-1, 1]) {
      const along = (u + s * bv) / Math.SQRT2;
      const across = (u - s * bv) / Math.SQRT2;
      if (Math.abs(across) <= 0.07 && Math.abs(along) <= 0.62) return true;
      if ([-1, 1].some(e => Math.hypot(along - e * 0.62, across) <= 0.13)) return true;
    }
    return false;
  };
  return {
    bounds: Math.ceil(R) + 2,
    solid: (x, y, z) => {
      const Y = y + shift;
      return inHull(x, Y, z) || inCabin(x, Y, z) || inBowsprit(x, Y, z) || inMast(x, Y, z) || inSail(x, Y, z);
    },
    skin(x, y, z) {
      const Y = y + shift;
      if (inSail(x, Y, z) && !inMast(x, Y, z)) return skull(...sailUV(x, Y)) ? 'w' : 'n';
      if (inCabin(x, Y, z) && !inHull(x, Y, z)) {
        // Kajüte: Bullaugen (Goldring, dunkel innen) an den Seiten, Fensterreihe hinten, goldene Dachkante
        for (const p of portholes) {
          const d = Math.hypot(x - p.x, Y - p.y);
          if (Math.abs(z) > cabin.half * 0.7 && d < 1.9) return d < 1 ? 'n' : 'y';
        }
        if (x < cabin.back + 0.8 && Y > cabin.roof * 0.35 && Y < cabin.roof * 0.7 && Math.round(z) % 3 === 0) return 'y';
        if (Y > cabin.roof - 2.2 * (z / cabin.half) ** 2 - 1.4 && (Math.abs(z) > cabin.half * 0.7 || x < cabin.back + 1 || x > cabin.front - 3)) return 'y';
        return 'u';
      }
      if (!inHull(x, Y, z)) return 'u';                                        // Mast, Rahen, Ausguck, Bugspriet
      const deck = deckAt(x);
      // Reling: nur der Rand des Decks golden, die Deckfläche bleibt Holz
      if (Y > deck - 1 && (Math.abs(z) >= beamAt(x, Y) - 0.8 || x > bow - 2)) return 'y';
      if (Math.abs(Y - (deck - 3)) < 0.5) return 'y';                         // Zierstreifen
      // Kanonenluken: Reihe dunkler Quadrate an der Bordwand
      if (Y < deck - 4.5 && Y > deck - 7.5 && x > cabin.front && x < R * 0.55 && ((x % 3) + 3) % 3 === 0) return 'n';
      return 'u';
    },
  };
}
