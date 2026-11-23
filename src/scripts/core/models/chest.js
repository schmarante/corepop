// Modell „Schatztruhe“ (Comic-Stil, eigenes Design): bauchige Holzkiste, nach unten leicht schmaler, runde Kanten;
// dicker gewölbter Deckel, der über die Kiste hinausragt; dicke Goldbeschläge (Deckelrand, zwei Bänder, Ecken),
// ein großes Schloss mit Schlüsselloch und zwischen Deckel und Kiste hervorquellendes Gold. Dunkle Fugen zeigen die
// Bretter. Bei dieser Auflösung sind alle Beschläge genau 1 Voxel breit – sonst überdeckt Gold das Holz.

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['u', 'y', 'n'];

/** @param {{ radius: number }} params  radius: halbe Breite */
export function chestModel({ radius: R }) {
  const a = R * 0.88;            // halbe Breite oben (x)
  const b = R * 0.55;            // halbe Tiefe oben (z)
  const taper = 0.12;            // unten so viel schmaler (Anteil)
  const floor = -R * 0.78;
  const rim = R * 0.02;          // Oberkante der Kiste
  const gap = 1.2;               // Spalt mit Gold zwischen Kiste und Deckel
  const lidBase = rim + gap;
  const lidOver = 1;             // Deckel ragt so viel über
  const lidHeight = R * 0.72;    // Deckel: gestauchter Halbzylinder (Achse x) – hoch und bauchig
  const corner = R * 0.22;       // Rundung der senkrechten Kanten

  /** halbe Breite/Tiefe der Kiste in Höhe y (unten schmaler) */
  const sizeAt = y => 1 - taper * ((rim - y) / (rim - floor));
  /** abgerundetes Rechteck: liegt (x, z) innerhalb von ±w, ±d mit Eckradius r? */
  const inRoundRect = (x, z, w, d, r) => Math.hypot(Math.max(0, Math.abs(x) - (w - r)), Math.max(0, Math.abs(z) - (d - r))) <= r;

  const inBox = (x, y, z) => y >= floor && y <= rim && inRoundRect(x, z, a * sizeAt(y), b * sizeAt(y), corner);
  const inLid = (x, y, z) =>
    y >= lidBase && Math.abs(x) <= a + lidOver && Math.hypot(z / (b + lidOver), (y - lidBase) / lidHeight) <= 1;
  // Gold im Spalt: Münzen-Wulst, vorne etwas herausquellend
  const inTreasure = (x, y, z) => y > rim && y < lidBase + 0.5 && Math.abs(x) <= a - 1 && Math.abs(z) <= b + (z > 0 ? 0.6 : -1);

  const band = x => [-1, 1].some(s => Math.abs(x - Math.round(s * a * 0.55)) < 0.5);
  return {
    bounds: Math.ceil(R) + 2,
    solid: (x, y, z) => inBox(x, y, z) || inLid(x, y, z) || inTreasure(x, y, z),
    skin(x, y, z) {
      if (y > rim && y < lidBase) return 'y';                                     // Gold im Spalt
      // großes Schloss vorne mittig (am Deckelrand), Schlüsselloch dunkel
      if (z > 0 && Math.abs(x) < 1.6 && y > rim - 3.5 && y < lidBase + 0.9) {
        const keyhole = Math.abs(x) < 0.5 && y > rim - 2.5 && y < rim - 0.5;
        return keyhole ? 'n' : 'y';
      }
      if (y >= lidBase) {
        // Deckel: dicker Goldrand unten, zwei Bänder, sonst Holz
        if (y < lidBase + 0.6 || band(x) || Math.abs(x) > a + lidOver - 0.6) return 'y';
        return 'u';
      }
      // Kiste: Bodenleiste, Ecken und Bänder in Gold; Bretter mit dunklen Fugen
      if (y < floor + 0.6 || band(x)) return 'y';
      if (Math.abs(x) > a * sizeAt(y) - 1 && Math.abs(z) > b * sizeAt(y) - 1) return 'y';   // Ecken
      const plank = (rim - y) / ((rim - floor) / 3);
      return Math.abs(plank - Math.round(plank)) < 0.12 && plank > 0.5 && plank < 2.5 ? 'n' : 'u';
    },
  };
}
