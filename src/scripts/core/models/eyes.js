// Modell „Kulleraugen“ (eigenes Design, kein Hersteller-Emoji): zwei große, eiförmige Augäpfel dicht nebeneinander,
// weiß mit stahlgrauem Rand hinten, schwarze Pupillen schauen verschmitzt nach links, je ein weißer Lichtpunkt.
// Comic: übertrieben große Pupillen, Augen leicht zueinander gedreht.
import { inEllipsoid } from './shapes.js';

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['w', 'n', 'z'];

/** @param {{ radius: number }} params  radius: halbe Gesamtbreite in Voxeln */
export function eyesModel({ radius: R }) {
  const radii = [R * 0.6, R * 1.0, R * 0.7];
  // Augäpfel: links etwas tiefer, rechts etwas höher – wirkt lebendiger
  const eyes = [
    { center: [-R * 0.58, -R * 0.05, 0] },
    { center: [R * 0.58, R * 0.05, 0] },
  ];
  // Pupille: von vorn aufs Auge projizierte Ellipse, nach links oben versetzt (schaut zur Seite). Projiziert statt über
  // die Richtung zur Augenmitte – sonst bekämen die Stufen-Würfel eine Lage tiefer eine andere Farbe (Streifen).
  const pupils = eyes.map(({ center }) => ({ x: center[0] - radii[0] * 0.36, y: center[1] + radii[1] * 0.08 }));
  const PUPIL = [radii[0] * 0.5, radii[1] * 0.52];
  // Lichtpunkt oben links in der Pupille
  const SPOT = { dx: -PUPIL[0] * 0.2, dy: PUPIL[1] * 0.35, r: 0.85 };   // klein, nicht am Rand (sonst eine Kerbe)

  return {
    bounds: Math.ceil(R * 1.2) + 1,
    solid: (x, y, z) => eyes.some(e => inEllipsoid(x, y, z, e.center, radii)),
    skin(x, y, z) {
      // das nähere Auge entscheidet
      const k = Math.abs(x - eyes[0].center[0]) < Math.abs(x - eyes[1].center[0]) ? 0 : 1;
      const { center } = eyes[k];
      const front = (z - center[2]) / radii[2];
      if (front < -0.55) return 'z';   // Rückseite: stahlgrauer Rand, damit sich die Augen von hinten nicht wie Eier lesen
      if (front > -0.4) {   // Pupille reicht seitlich etwas ums Auge herum (schaut zur Seite)
        const p = pupils[k];
        // Lichtpunkt nur in der äußersten Lage (sonst eine weiße Säule durch alle Lagen – schräg sichtbar als Strich)
        const rest = 1 - ((x - center[0]) / radii[0]) ** 2 - ((y - center[1]) / radii[1]) ** 2;
        const surface = center[2] + radii[2] * Math.sqrt(Math.max(0, rest));
        if (z >= surface - 1 && Math.hypot(x - (p.x + SPOT.dx), y - (p.y + SPOT.dy)) < SPOT.r) return 'w';
        if (((x - p.x) / PUPIL[0]) ** 2 + ((y - p.y) / PUPIL[1]) ** 2 <= 1) return 'n';
      }
      return 'w';
    },
  };
}
