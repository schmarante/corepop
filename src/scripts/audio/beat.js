// Takt der Musik für die Darstellung (Sternenflug pulsiert mit der Kick) – ohne Tone.js, damit der Sternenflug auf
// jeder Seite sofort läuft. audio/sound.js meldet die Quelle an, sobald die Musik aufgebaut ist.

let source = () => 0;

/** Quelle anmelden: Funktion → 0 (still) … ~1,6 (Drop), klingt nach jedem Schlag ab */
export function setBeatSource(fn) {
  source = fn;
}

/** Takt jetzt (0, solange keine Musik läuft oder sie aus ist) */
export function beatLevel() {
  try {
    return source() || 0;
  } catch {
    return 0;
  }
}
