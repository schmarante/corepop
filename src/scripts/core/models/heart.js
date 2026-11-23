// Modell „Herz“: klassische Herzform (implizite Fläche), vorne/hinten etwas flacher. Rot mit rosa Glanzlicht oben
// links auf der Vorderseite – wie ein Candy-Herz.

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['r', 'h'];

/**
 * Herzfläche (y nach oben): (x² + 9/4·z² + y² − 1)³ − x²·y³ − 9/80·z²·y³ ≤ 0, Koordinaten auf etwa −1.2 … 1.2
 * @param {{ radius: number }} params  radius: halbe Breite in Voxeln
 */
export function heartModel({ radius: R }) {
  const scale = 1.15 / R;
  const inside = (x, y, z) => {
    const X = x * scale;
    const Y = (y + R * 0.1) * scale;   // etwas nach unten: optische Mitte
    const Z = z * scale * 1.15;
    const a = X * X + 2.25 * Z * Z + Y * Y - 1;
    return a * a * a - X * X * Y * Y * Y - 0.1125 * Z * Z * Y * Y * Y <= 0;
  };
  return {
    bounds: Math.ceil(R * 1.15) + 1,
    solid: inside,
    // Glanzlicht: Fleck auf dem linken Bogen, vorne oben
    skin: (x, y, z) => (Math.hypot(x + R * 0.45, y - R * 0.45, z - R * 0.45) < R * 0.32 ? 'h' : 'r'),
  };
}
