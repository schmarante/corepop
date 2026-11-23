// Modell „Eis am Stiel“: flacher Riegel mit runden Ecken, oben in Schokolade getaucht (mit weißen Streuseln),
// darunter rosa Eis, unten ein heller Holzstiel. Steht senkrecht – nicht rund.

/** Farben der Außenhaut (für Tests/Übersicht) */
export const SKIN_COLORS = ['h', 'u', 'w', 'c'];

/** @param {{ radius: number }} params  radius: halbe Höhe des Eises (ohne Stiel) */
export function popsicleModel({ radius: R }) {
  const halfWidth = R * 0.58;
  const halfDepth = R * 0.38;
  const bottom = -R * 0.65;          // Unterkante des Eises (darunter der Stiel)
  const top = R * 1.0;
  const corner = halfWidth * 0.75;   // Rundung der Ecken (oben stark, unten leicht)
  const dip = top - (top - bottom) * 0.38;   // Schokoladen-Grenze, leicht gewellt
  const inBar = (x, y, z) => {
    if (y < bottom || y > top || Math.abs(x) > halfWidth || Math.abs(z) > halfDepth) return false;
    // runde Kanten vorne/hinten (Querschnitt: Stadion), runde Ecken oben
    const qz = Math.max(0, Math.abs(z) - halfDepth * 0.4);
    const qx = Math.max(0, Math.abs(x) - (halfWidth - halfDepth * 0.6));
    if (Math.hypot(qx, qz) > halfDepth * 0.6) return false;
    const cy = top - corner;
    if (y > cy && Math.hypot(Math.max(0, Math.abs(x) - (halfWidth - corner)), y - cy) > corner) return false;
    return true;
  };
  const inStick = (x, y, z) => y >= bottom - R * 0.75 && y < bottom + 1 && Math.abs(x) <= R * 0.14 && Math.abs(z) <= 0.6;
  return {
    bounds: Math.ceil(R * 1.45) + 1,
    solid: (x, y, z) => inBar(x, y, z) || inStick(x, y, z),
    skin(x, y, z) {
      if (y < bottom + 0.5 && !inBar(x, y + 1, z)) return 'c';
      if (y > dip + Math.sin(x * 0.9) * 0.9) {
        // Streusel: verstreute Punkte auf der Schokolade (festes Muster)
        const sprinkle = Math.sin(x * 2.3 + y * 1.7) * Math.cos(z * 2.9 - y * 1.1) > 0.82;
        return sprinkle ? 'w' : 'u';
      }
      return 'h';
    },
  };
}
