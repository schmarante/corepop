// Modell „Piratenschiff“ (Zwischenboss, Comic-Stil, eigenes Design): bauchiger Holzrumpf in Bananenform – Bug (+x)
// und Heck biegen sich stark nach oben –, darauf hinten eine dicke, kopflastige Kapitänskajüte (breiter als der Rumpf,
// hinten überstehend, gewölbtes Dach, runde Bullaugen mit Goldrand, Fensterreihe am Heck). Vorn ein schräger
// Bugspriet, am Rumpf ein goldener Zierstreifen und Kanonenluken. Ein Mast mit großem, gebauschtem schwarzen Segel mit
// weißem Totenkopf und gekreuzten Knochen, Rahen und Ausguck. Deutlich größer als die anderen Figuren (doppelt so viele
// Würfel, ~10 000) – genug Auflösung für Details: Kanonenrohre ragen aus dunklen Luken, goldene Reling mit Pfosten,
// Steuerrad vor der Kajüte, Kajütentür, Hecklaterne, wehender Wimpel an der Mastspitze, silberne Anker am Bug.
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

  // Kanonen: Rohre ragen seitlich aus eckigen Luken (Mitte je Luke, Y relativ zum Deck)
  const cannons = [-0.3, -0.13, 0.04, 0.21, 0.38].map(f => {
    const x = Math.round(R * f);
    return { x, y: Math.round(deckAt(x) - H * 0.45) };
  });
  const inCannon = (x, Y, z) =>
    cannons.some(c => Math.hypot(x - c.x, Y - c.y) <= 0.95 && Math.abs(z) >= beamAt(c.x, c.y) - 1 && Math.abs(z) <= beamAt(c.x, c.y) + 2.4);
  /** Reling: Pfosten alle 3 Voxel und ein Handlauf darüber, am Deckrand zwischen Kajüte und Bug */
  const inRail = (x, Y, z) => {
    if (x < cabin.front || x > bow - 3) return false;
    const deck = deckAt(x);
    if (Y <= deck || Y > deck + 2.5) return false;
    const edge = beamAt(x, deck) - 0.4;
    if (Math.abs(Math.abs(z) - edge) > 0.6) return false;
    return Y > deck + 1.6 || ((Math.round(x) % 3) + 3) % 3 === 0;
  };
  /** Steuerrad vor der Kajüte: Ring mit Speichen, senkrecht, quer zum Schiff (Achse x) */
  const wheel = { x: Math.round(cabin.front + 2.5), y: deckAt(cabin.front) + 4.2, r: 2.4 };
  const inWheel = (x, Y, z) => {
    if (Math.abs(x - wheel.x) > 0.5) return false;
    const d = Math.hypot(Y - wheel.y, z);
    if (Math.abs(d - wheel.r) < 0.55 || d < 0.8) return true;                                // Ring, Nabe
    if (d < wheel.r && (Math.abs(z) < 0.45 || Math.abs(Y - wheel.y) < 0.45)) return true;   // Speichen
    if (Math.abs(z) < 0.5 && Y < wheel.y && Y > deckAt(x)) return true;                      // Ständer
    return false;
  };
  /** Hecklaterne auf dem Kajütendach: Pfosten mit Laternenkasten */
  const lantern = { x: Math.round(cabin.back + 2), y: cabin.roof + 1 };
  const inLantern = (x, Y, z) =>
    (Math.abs(x - lantern.x) < 0.5 && Math.abs(z) < 0.5 && Y >= lantern.y - 1 && Y < lantern.y + 2) ||
    (Math.abs(x - lantern.x) <= 1 && Math.abs(z) <= 1 && Y >= lantern.y + 2 && Y <= lantern.y + 4);

  const mast = { x: Math.round(R * 0.12), top: R * 1.18 };
  const sail = { y0: R * 0.16, y1: R * 1.02, half: R * 0.48, bulge: 2.2 };
  const nestY = mast.top - R * 0.12;
  const inMast = (x, Y, z) =>
    inCylinderY(x, Y, z, [mast.x, 0], 0.7, 0, mast.top) ||
    (Y >= nestY && Y <= nestY + 1.6 && Math.hypot(x - mast.x, z) <= 2.2) ||                       // Ausguck
    [sail.y0 - 0.6, sail.y1 + 0.6].some(y => Math.abs(Y - y) < 0.6 && Math.abs(x - mast.x) <= sail.half + 1.5 && Math.abs(z) < 0.6);   // Rahen

  /** Wimpel an der Mastspitze: weht nach hinten (−x), wellig, spitz zulaufend */
  const pennant = { x0: mast.x - 0.5, length: R * 0.36, y: mast.top - 1.5, height: 2.6 };
  const inPennant = (x, Y, z) => {
    const t = (pennant.x0 - x) / pennant.length;   // 0 am Mast … 1 an der Spitze
    if (t < 0 || t > 1) return false;
    const half = (pennant.height / 2) * (1 - t * 0.75);
    const wave = Math.sin(t * Math.PI * 2.2) * 1.1 * t;
    return Math.abs(Y - pennant.y + t * 1.2) <= half && Math.abs(z - wave) <= 0.55;
  };

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
      return (
        inHull(x, Y, z) || inCabin(x, Y, z) || inBowsprit(x, Y, z) || inMast(x, Y, z) || inSail(x, Y, z) ||
        inCannon(x, Y, z) || inRail(x, Y, z) || inWheel(x, Y, z) || inLantern(x, Y, z) || inPennant(x, Y, z)
      );
    },
    skin(x, y, z) {
      const Y = y + shift;
      if (inSail(x, Y, z) && !inMast(x, Y, z)) return skull(...sailUV(x, Y)) ? 'w' : 'n';
      if (inPennant(x, Y, z) && !inMast(x, Y, z)) return 'n';
      if (inCannon(x, Y, z) && !inHull(x, Y, z)) return 'n';
      if (inRail(x, Y, z)) return 'y';
      if (inWheel(x, Y, z)) return Math.hypot(Y - wheel.y, z) < 0.8 ? 'y' : 'u';
      if (inLantern(x, Y, z)) return Y >= lantern.y + 2 ? 'y' : 'n';
      if (inCabin(x, Y, z) && !inHull(x, Y, z)) {
        // Kajüte: Bullaugen (Goldring, dunkel innen) an den Seiten, Fensterreihe hinten, goldene Dachkante
        for (const p of portholes) {
          const d = Math.hypot(x - p.x, Y - p.y);
          if (Math.abs(z) > cabin.half * 0.7 && d < 1.9) return d < 1 ? 'n' : 'y';
        }
        if (x < cabin.back + 0.8 && Y > cabin.roof * 0.35 && Y < cabin.roof * 0.7 && Math.round(z) % 3 === 0) return 'y';
        // Tür vorn: dunkles Rechteck mit goldenem Rahmen und Knauf
        if (x > cabin.front - 0.8 && Math.abs(z) <= 2.6 && Y < cabin.roof * 0.62) {
          if (Math.abs(z) <= 1.6 && Y < cabin.roof * 0.55) return Math.abs(z - 1) < 0.5 && Math.abs(Y - cabin.roof * 0.3) < 0.5 ? 'y' : 'n';
          return 'y';
        }
        if (Y > cabin.roof - 2.2 * (z / cabin.half) ** 2 - 1.4 && (Math.abs(z) > cabin.half * 0.7 || x < cabin.back + 1 || x > cabin.front - 3)) return 'y';
        return 'u';
      }
      if (!inHull(x, Y, z)) return 'u';                                        // Mast, Rahen, Ausguck, Bugspriet
      const deck = deckAt(x);
      // Reling: nur der Rand des Decks golden, die Deckfläche bleibt Holz
      if (Y > deck - 1 && (Math.abs(z) >= beamAt(x, Y) - 0.8 || x > bow - 2)) return 'y';
      if (Math.abs(Y - (deck - 3)) < 0.5) return 'y';                         // Zierstreifen
      // Kanonenluken: dunkles Quadrat um jedes Rohr
      for (const c of cannons) if (Math.max(Math.abs(x - c.x), Math.abs(Y - c.y)) <= 1.6) return 'n';
      // Anker am Bug (silber): Schaft, Querstock oben, Bogen mit Spitzen unten
      const ax = bow - R * 0.2;
      const ay = deck - H * 0.42;
      const dx = x - ax;
      const dy = Y - ay;
      const shank = Math.abs(dx) < 0.6 && dy > -3.2 && dy < 2.6;
      const stock = Math.abs(dy - 2) < 0.6 && Math.abs(dx) < 1.8;
      const ring = Math.abs(Math.hypot(dx, dy - 3.4) - 0.9) < 0.5;
      const arc = dy < -0.8 && Math.abs(Math.hypot(dx, dy + 0.4) - 3) < 0.6;
      if (shank || stock || ring || arc) return 'w';
      return 'u';
    },
  };
}
