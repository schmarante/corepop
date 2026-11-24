// Grafik-Stufe (render/quality.js): wird gemerkt, damit ein schwaches Handy beim nächsten Besuch gleich flüssig startet.
// Klartext, kein Spielstand.
const KEY = 'corepop:quality';

/** gespeicherte Stufe (0 = volle Qualität) */
export function storedTier() {
  try {
    const tier = Number(localStorage.getItem(KEY));
    return Number.isInteger(tier) && tier > 0 ? tier : 0;
  } catch {
    return 0;
  }
}

export function storeTier(tier) {
  try {
    localStorage.setItem(KEY, String(tier));
  } catch {
    // Speicher gesperrt: gilt dann nur für diese Seite
  }
}
