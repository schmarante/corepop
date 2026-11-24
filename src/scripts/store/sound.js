// Ton-Einstellungen (Optionen-Dialog): Musik und Effekte getrennt an/aus. Klartext wie die Sprache – kein Spielstand.
// Änderungen melden sich als Ereignis `corepop:sound` am window, damit ein laufendes Spiel sofort reagiert.
const KEY = 'corepop:sound';
const DEFAULTS = { music: true, sfx: true };

export function soundSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { music: stored.music !== false, sfx: stored.sfx !== false };
  } catch {
    return { ...DEFAULTS };
  }
}

/** @param {'music' | 'sfx'} key */
export function setSoundSetting(key, on) {
  const next = { ...soundSettings(), [key]: !!on };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Speicher gesperrt: gilt dann nur für diese Seite
  }
  dispatchEvent(new CustomEvent('corepop:sound', { detail: next }));
}
