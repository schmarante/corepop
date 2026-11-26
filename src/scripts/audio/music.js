// Musik: EDM aus eigenen Synths – Four-on-the-floor-Kick, Clap, Hi-Hats, Sub- und Reese-Bass, Supersaw-Akkorde und
// -Lead, Plucks, Flächen, Riser und Snare-Wirbel im Build-up, Impact auf dem Drop. Alles Melodische „pumpt“ mit der
// Kick (Sidechain). Eigene Kompositionen.
//
// Drei Stücke (SONGS):
//   menu  Startseite – der Hook des Spiel-Stücks als ruhige Variante (100 bpm, ohne Drop)
//   game  im Spiel – treibender Drop mit Synkopen-Hook, Groove, Break, Build-up (128 bpm, a-Moll)
//   boss  Boss-Level – härter und schneller (140 bpm, d-Moll): Intro mit rollendem Bass, Drop mit verzerrtem Bass,
//         düsterer Break mit Es-Dur (neapolitanisch), Build-up, zweiter Drop mit dem Hook eine Oktave höher
//
// Aufbau eines Stücks:
//   form    ein Buchstabe je Takt (Abschnitt), z. B. 'DDDDBBBBUUUU'
//   layers  je Buchstabe die Spuren, die dort spielen (siehe LAYERS)
//   chords  Akkord je Takt (läuft reihum)
//   leads   Melodien als Notenfolge „E5:3 A5:2 r:2 …“ (Länge in 16teln, r = Pause, | nur zur Lesbarkeit), Stimme
//           `lead` (Supersaw) oder `pluck`, ab Takt `bar`, optional `octave` (zusätzlich eine Oktave höher gedoppelt)
//   hits    Takte mit Impact + Becken (Drop-Anfang)
//   arp/stab  Muster (16 Schritte) für Arpeggio bzw. Akkord-Stöße; `patterns: { Buchstabe: { arp, stab } }` je Abschnitt
// Ein Build-up (Spur `build`) wirbelt die Snare immer dichter, ein Riser steigt über alle seine Takte, und im letzten
// Schlag davor ist alles still bis auf den Riser – dann kommt der Drop.
//
// Die Stücke werden am Rechner offline gerendert und als MP3 mitgeliefert (public/audio/, siehe createMusic und
// renderForExport); im Spiel wird nur geladen und als Schleife abgespielt. Wechsel zwischen Stücken: kurz ausblenden,
// umschalten, einblenden – nichts bricht hart ab. Den Takt liefert `beat()` (Sternenflug pulsiert mit der Kick).

/** Spuren eines Abschnitts (Namen in `layers`) */
export const LAYERS = ['kick', 'clap', 'hat', 'open', 'bass', 'roll', 'long', 'stab', 'pad', 'arp', 'build'];

/** Akkorde: Grundton (Bass, Oktave 2) und Lage der Flächen */
const CHORDS = {
  C: { root: 36, pad: [60, 64, 67] },
  Bb: { root: 34, pad: [58, 62, 65] },
  F: { root: 41, pad: [57, 60, 65] },
  Am: { root: 45, pad: [57, 60, 64] },
  G: { root: 43, pad: [55, 59, 62] },
  D: { root: 38, pad: [57, 62, 66] },
  Em: { root: 40, pad: [55, 59, 64] },
  Dm: { root: 38, pad: [57, 62, 65] },
  Gm: { root: 43, pad: [55, 58, 62] },
  A: { root: 45, pad: [57, 61, 64] },
  Eb: { root: 39, pad: [55, 58, 63] },
};

export const SONGS = {
  // Variante des Spiel-Hooks: dieselbe Melodie und Akkorde, ruhiger – erst als Pluck über Fläche und Arpeggio, dann
  // als Lead mit derselben Begleitung wie im Drop des Spiel-Stücks
  menu: {
    bpm: 100,
    form: 'CCCCCCCCMMMMMMMM',
    layers: {
      C: 'kick open pad arp long',
      M: 'kick clap hat open bass stab',   // wie der Drop im Spiel-Stück
    },
    chords: ['Am', 'F', 'C', 'G'],
    arp: '0.2.1.3.0.2.1.3.',
    stab: '..x.....x.x.....',
    // Melodie-Teil: Spuren und Akkord-Stöße genau wie im Drop des Spiel-Stücks (passen zu den Synkopen des Hooks)
    patterns: { M: { stab: '..x...x...x..x.x' } },
    kick: -9,   // leiser als im Spiel
    hits: [],
    leads: [
      { bar: 0, voice: 'pluck', notes: 'E5:3 E5:3 A5:2 G5:2 E5:2 D5:2 C5:2 | C5:3 C5:3 F5:2 E5:4 C5:4 | E5:3 E5:3 G5:2 A5:2 G5:2 E5:2 G5:2 | D5:3 D5:3 B4:2 D5:4 r:4 | E5:3 E5:3 A5:2 G5:2 E5:2 D5:2 C5:2 | C5:3 C5:3 F5:2 A5:4 G5:4 | E5:3 G5:3 C6:2 B5:2 A5:2 G5:2 E5:2 | D5:4 G5:4 B5:8' },
      { bar: 8, voice: 'lead', notes: 'E5:3 E5:3 A5:2 G5:2 E5:2 D5:2 C5:2 | C5:3 C5:3 F5:2 E5:4 C5:4 | E5:3 E5:3 G5:2 A5:2 G5:2 E5:2 G5:2 | D5:3 D5:3 B4:2 D5:4 r:4 | E5:3 E5:3 A5:2 G5:2 E5:2 D5:2 C5:2 | C5:3 C5:3 F5:2 A5:4 G5:4 | E5:3 G5:3 C6:2 B5:2 A5:2 G5:2 E5:2 | D5:4 G5:4 B5:8' },
    ],
  },
  game: {
    bpm: 128,
    form: 'DDDDDDDDGGGGGGGGBBBBUUUU',
    layers: {
      D: 'kick clap hat open bass stab',
      G: 'kick clap hat open bass stab arp',
      B: 'pad arp long',
      U: 'kick pad arp build',
    },
    chords: ['Am', 'F', 'C', 'G'],
    arp: '0120312031201203',
    stab: '..x...x...x..x.x',
    hits: [0, 8],
    leads: [
      // Drop: Synkopen-Hook (3 + 3 + 2)
      { bar: 0, voice: 'lead', notes: 'E5:3 E5:3 A5:2 G5:2 E5:2 D5:2 C5:2 | C5:3 C5:3 F5:2 E5:4 C5:4 | E5:3 E5:3 G5:2 A5:2 G5:2 E5:2 G5:2 | D5:3 D5:3 B4:2 D5:4 r:4 | E5:3 E5:3 A5:2 G5:2 E5:2 D5:2 C5:2 | C5:3 C5:3 F5:2 A5:4 G5:4 | E5:3 G5:3 C6:2 B5:2 A5:2 G5:2 E5:2 | D5:4 G5:4 B5:8' },
      // Groove: Pluck antwortet zwischen den Akkord-Stößen
      { bar: 8, voice: 'pluck', notes: 'r:4 A5:2 r:2 G5:2 r:2 E5:4 | r:4 F5:2 r:2 E5:2 r:2 C5:4 | r:4 G5:2 r:2 E5:2 r:2 C5:4 | r:4 D5:2 r:2 B4:2 r:2 G4:4 | r:4 A5:2 r:2 G5:2 r:2 E5:4 | r:4 F5:2 r:2 A5:2 r:2 C6:4 | r:4 G5:2 r:2 C6:2 r:2 E6:4 | D6:4 B5:4 G5:4 D5:4' },
      // Break: getragen
      { bar: 16, voice: 'lead', notes: 'A5:8 G5:4 E5:4 | F5:8 E5:4 C5:4 | E5:8 D5:4 C5:4 | D5:12 r:4' },
      // Build-up: der Hook als Pluck kündigt den Drop an
      { bar: 20, voice: 'pluck', notes: 'E5:3 E5:3 A5:2 G5:2 E5:2 D5:2 C5:2 | C5:3 C5:3 F5:2 E5:4 C5:4 | E5:3 E5:3 G5:2 A5:2 G5:2 E5:2 G5:2 | D5:3 D5:3 B4:2 D5:4 r:4' },
    ],
  },
  boss: {
    bpm: 140,
    form: 'IIIIIIIIDDDDDDDDBBBBUUUUEEEEEEEE',
    layers: {
      I: 'kick hat roll arp',
      D: 'kick clap hat open roll stab',
      B: 'pad long arp',
      U: 'kick pad roll build',
      E: 'kick clap hat open roll stab arp',
    },
    chords: ['Dm', 'Dm', 'Bb', 'A', 'Dm', 'Dm', 'Bb', 'A', 'Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A',
      'Dm', 'Eb', 'Gm', 'A', 'Bb', 'Bb', 'A', 'A', 'Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A'],
    arp: '0102010301020103',
    stab: 'x..x..x...x..x..',
    growl: 0.55,   // verzerrter Bass
    hits: [0, 8, 16, 24],
    leads: [
      // Intro: Pluck-Motiv, das den Hook vorwegnimmt
      { bar: 4, voice: 'pluck', notes: 'D5:2 D5:1 D5:1 F5:2 D5:2 A5:3 G5:3 F5:2 | D5:2 D5:1 D5:1 F5:2 D5:2 A5:3 G5:3 F5:2 | F5:3 D5:3 Bb4:2 D5:4 F5:4 | E5:3 C#5:3 A4:2 C#5:4 E5:4' },
      { bar: 8, voice: 'lead', notes: 'D5:2 D5:1 D5:1 F5:2 D5:2 A5:3 G5:3 F5:2 | F5:3 D5:3 Bb4:2 D5:4 F5:4 | G5:2 G5:1 G5:1 Bb5:2 G5:2 D6:3 C6:3 Bb5:2 | A5:3 G5:3 E5:2 C#5:8 | D5:2 D5:1 D5:1 F5:2 D5:2 A5:3 G5:3 F5:2 | F5:3 D5:3 Bb4:2 F5:4 A5:4 | G5:2 G5:1 G5:1 Bb5:2 G5:2 D6:3 C6:3 Bb5:2 | A5:4 C#6:4 E6:8' },
      // Break: Schauder (Es-Dur in d-Moll)
      { bar: 16, voice: 'lead', notes: 'D5:8 F5:8 | Eb5:8 Bb4:8 | G4:8 Bb4:8 | A4:8 C#5:8' },
      // zweiter Drop: der Hook mit Oktave darüber
      { bar: 24, voice: 'lead', octave: true, notes: 'D5:2 D5:1 D5:1 F5:2 D5:2 A5:3 G5:3 F5:2 | F5:3 D5:3 Bb4:2 D5:4 F5:4 | G5:2 G5:1 G5:1 Bb5:2 G5:2 D6:3 C6:3 Bb5:2 | A5:3 G5:3 E5:2 C#5:8 | D5:2 D5:1 D5:1 F5:2 D5:2 A5:3 G5:3 F5:2 | F5:3 D5:3 Bb4:2 F5:4 A5:4 | G5:2 G5:1 G5:1 Bb5:2 G5:2 D6:3 C6:3 Bb5:2 | A5:4 C#6:4 E6:8' },
    ],
  },
};

/** Takte eines Stücks */
export const barsOf = song => song.form.length;

/**
 * Was in einem 16tel-Schritt spielt: Spuren des Abschnitts, Stelle im Build-up (Takt `b` von `n`) und ob gerade die
 * Stille vor dem Drop ist (letzter Schlag des Build-ups). Quelle für die Band und für den Takt des Sternenflugs.
 */
export function stepInfo(song, step) {
  const bars = barsOf(song);
  const s = ((step % (bars * 16)) + bars * 16) % (bars * 16);
  const bar = Math.floor(s / 16);
  const inBar = s % 16;
  const letter = song.form[bar];
  const layers = new Set(song.layers[letter].split(/\s+/));
  let b = 0;
  let n = 0;
  if (layers.has('build')) {
    while (bar - b - 1 >= 0 && song.form[bar - b - 1] === letter) b++;
    n = b;
    while (bar + n - b < bars && song.form[bar + n - b] === letter) n++;
  }
  const silent = layers.has('build') && b === n - 1 && inBar >= 12;
  return { s, bar, inBar, letter, layers, b, n, silent };
}

/**
 * Takt-Stärke je 16tel-Schritt (Float32Array): Kick 1, Drop-Impact 1,6, Clap ohne Kick 0,4, Snare-Wirbel im Build-up
 * wachsend bis 0,6 – daraus pulsiert der Sternenflug.
 */
export function beatMap(song) {
  const steps = barsOf(song) * 16;
  const map = new Float32Array(steps);
  for (let step = 0; step < steps; step++) {
    const { bar, inBar, layers, b, n, silent } = stepInfo(song, step);
    if (silent) continue;
    let v = 0;
    if (layers.has('clap') && (inBar === 4 || inBar === 12)) v = 0.4;
    if (layers.has('build') && snareRoll(b, n, inBar)) v = 0.15 + 0.45 * ((b * 16 + inBar) / (n * 16));
    if (layers.has('kick') && inBar % 4 === 0) v = 1;
    if (inBar === 0 && song.hits.includes(bar)) v = 1.6;
    map[step] = v;
  }
  return map;
}

/** Snare-Wirbel im Build-up: Viertel, im vorletzten Takt Achtel, im letzten 16tel (bis zur Stille) */
const snareRoll = (b, n, inBar) => (b < n - 2 ? inBar % 4 === 0 : b === n - 2 ? inBar % 2 === 0 : inBar < 12);

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** „F#5“ → MIDI-Nummer */
export function noteToMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Note? ${name}`);
  return (Number(m[3]) + 1) * 12 + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** Notenfolge → [{ step, midi, length }] (step ab Beginn der Melodie, in 16teln) */
export function parseMelody(text) {
  const out = [];
  let step = 0;
  for (const token of text.split(/\s+/)) {
    if (!token || token === '|') continue;
    const [name, len] = token.split(':');
    const length = Number(len);
    if (name !== 'r') out.push({ step, midi: noteToMidi(name), length });
    step += length;
  }
  return out;
}

const FADE = 0.6;          // s – Aus-/Einblenden beim Stückwechsel
const TAIL = 4;            // s – Nachhall über das Schleifenende hinaus (wird vorn wieder eingemischt)
const RENDER_RATE = 32000; // Hz – reicht für die Synths, spart Rechenzeit und Speicher
const PEAK = 1;            // Spitzenpegel eines gerenderten Stücks (danach Musik-Bus 0,65 → Limiter)
const PUMP_DEPTH = 0.22;   // Sidechain: so weit duckt die Kick alles Melodische (danach steigt es über ~½ Schlag)
/** s – Rand vor und hinter der Schleife in den Audio-Dateien (Kopien vom Ende bzw. Anfang der Schleife): MP3 fügt beim
 *  Kodieren Stille/Verzögerung ein. Abgespielt wird ein Fenster von genau einer Schleifenlänge ab MUSIC_PAD – liegt es
 *  durch die Verzögerung etwas versetzt, ist es trotzdem eine exakte Periode, die Naht bleibt unhörbar. */
export const MUSIC_PAD = 0.5;
/** bei jedem neuen Export erhöhen – steckt im Dateinamen (menu-v4.mp3 …), damit kein Browser- oder CDN-Cache die alte
 *  Fassung liefert (ein ?v= an der Adresse reichte nicht) */
export const MUSIC_VERSION = 4;
/** Pfad der fertigen Musikdatei eines Stücks unter public/ (scripts/encode-music.sh schreibt sie so) */
export const musicFile = name => `audio/${name}-v${MUSIC_VERSION}.mp3`;

/** Instrumente für ein Stück in den aktuellen Tone-Kontext bauen; `play(leads, step, time)` spielt einen 16tel-Schritt */
async function createBand(Tone, out, song) {
  const midi = n => Tone.Frequency(n, 'midi').toFrequency();
  const beat = 60 / song.bpm;
  const sixteenth = beat / 4;

  // Sidechain: alles Melodische (und sein Hall) läuft durch `pump`; jede Kick duckt es kurz weg
  const pump = new Tone.Gain(1).connect(out);
  const duck = time => {
    pump.gain.cancelScheduledValues(time);
    pump.gain.setValueAtTime(PUMP_DEPTH, time);
    pump.gain.linearRampToValueAtTime(1, time + beat * 0.55);
  };
  const reverb = new Tone.Reverb({ decay: 3.2, wet: 1 }).connect(pump);
  const delay = new Tone.PingPongDelay({ delayTime: sixteenth * 3, feedback: 0.32, wet: 1 }).connect(pump);
  const drums = new Tone.Gain(1).connect(out);
  /** Knoten trocken nach `to` (Standard pump), dazu Anteile in Hall und Echo */
  const route = (node, { to = pump, verb = 0, echo = 0 } = {}) => {
    node.connect(to);
    if (verb) node.connect(new Tone.Gain(verb).connect(reverb));
    if (echo) node.connect(new Tone.Gain(echo).connect(delay));
    return node;
  };

  // --- Schlagzeug (pumpt nicht) ---
  const kick = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 5.5, envelope: { attack: 0.001, decay: 0.38, sustain: 0, release: 0.05 }, volume: song.kick ?? -4 }).connect(drums);
  const click = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.008, sustain: 0 }, volume: (song.kick ?? -4) - 20 })
    .connect(new Tone.Filter({ type: 'highpass', frequency: 3000 }).connect(drums));
  const clapFilter = route(new Tone.Filter({ type: 'bandpass', frequency: 1400, Q: 0.9 }), { to: drums, verb: 0.35 });
  const clap = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 }, volume: -8 }).connect(clapFilter);
  const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0 }, volume: -20 })
    .connect(new Tone.Filter({ type: 'highpass', frequency: 9000 }).connect(drums));
  const open = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.17, sustain: 0 }, volume: -18 })
    .connect(new Tone.Filter({ type: 'highpass', frequency: 7500 }).connect(drums));
  const snareFilter = route(new Tone.Filter({ type: 'bandpass', frequency: 2300, Q: 0.6 }), { to: drums, verb: 0.3 });
  const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.11, sustain: 0 }, volume: -15 }).connect(snareFilter);
  const snareBody = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 1.4, envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.04 }, volume: -16 }).connect(drums);
  // Impact auf dem Drop: tiefer Schlag, dumpfes Rauschen, Becken
  const impact = new Tone.MembraneSynth({ pitchDecay: 0.3, octaves: 4, envelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 0.6 }, volume: -5 }).connect(drums);
  const boom = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.002, decay: 1.1, sustain: 0 }, volume: -14 })
    .connect(route(new Tone.Filter({ type: 'lowpass', frequency: 800 }), { to: drums, verb: 0.5 }));
  const crash = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 1.9, sustain: 0 }, volume: -21 })
    .connect(route(new Tone.Filter({ type: 'highpass', frequency: 4200 }), { to: drums, verb: 0.4 }));
  // Riser im Build-up: Rauschen mit aufgehendem Filter + steigender Ton
  const riserFilter = route(new Tone.Filter({ type: 'bandpass', frequency: 500, Q: 1.2 }), { to: drums, verb: 0.6 });
  const riser = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 1, attackCurve: 'exponential', decay: 0.02, sustain: 0 }, volume: -15 }).connect(riserFilter);
  const lifter = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.8, decay: 0.1, sustain: 1, release: 0.05 }, volume: -32 })
    .connect(route(new Tone.Filter({ type: 'lowpass', frequency: 3000 }), { verb: 0.5 }));

  // --- Bass: Sub (Sinus) + Reese eine Oktave höher (Sägezahn mit Filter-Hüllkurve, im Boss verzerrt) ---
  const sub = route(new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.004, decay: 0.1, sustain: 0.9, release: 0.05 }, volume: -14 }));
  const reeseOut = song.growl ? route(new Tone.Distortion(song.growl)) : pump;
  const reese = new Tone.MonoSynth({
    oscillator: { type: 'fatsawtooth', count: 2, spread: 18 },
    filter: { type: 'lowpass', rolloff: -24, Q: 3 },
    envelope: { attack: 0.003, decay: 0.15, sustain: 0.5, release: 0.06 },
    filterEnvelope: { attack: 0.002, decay: 0.12, sustain: 0.25, release: 0.08, baseFrequency: 160, octaves: 3.4 },
    volume: song.growl ? -22 : -16,
  }).connect(reeseOut);
  const bass = (note, length, time, velocity = 1) => {
    sub.triggerAttackRelease(midi(note), length, time, velocity);
    reese.triggerAttackRelease(midi(note + 12), length, time, velocity);
  };

  // --- Akkorde, Lead, Plucks ---
  const stabs = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 9,
    oscillator: { type: 'fatsawtooth', count: 4, spread: 38 },
    envelope: { attack: 0.003, decay: 0.16, sustain: 0.2, release: 0.12 },
    volume: -14,
  }).connect(route(new Tone.Filter({ type: 'lowpass', frequency: 5200 }), { verb: 0.25 }));
  const pad = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 6,
    oscillator: { type: 'fatsawtooth', count: 3, spread: 30 },
    envelope: { attack: 0.5, decay: 0.5, sustain: 0.8, release: 1.1 },
    volume: -17,
  }).connect(route(new Tone.Filter({ type: 'lowpass', frequency: 1700 }), { verb: 0.5 }));
  const leadFilter = route(new Tone.Filter({ type: 'lowpass', frequency: 6500 }), { verb: 0.3, echo: 0.18 });
  const lead = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 4,
    oscillator: { type: 'fatsawtooth', count: 5, spread: 28 },
    envelope: { attack: 0.006, decay: 0.2, sustain: 0.6, release: 0.18 },
    volume: -11,
  }).connect(leadFilter);
  const leadHigh = new Tone.Synth({ oscillator: { type: 'fatsawtooth', count: 3, spread: 22 }, envelope: { attack: 0.006, decay: 0.2, sustain: 0.5, release: 0.15 }, volume: -17 }).connect(leadFilter);
  const pluck = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.002, decay: 0.18, sustain: 0, release: 0.1 }, volume: -10 })
    .connect(route(new Tone.Filter({ type: 'lowpass', frequency: 3200, Q: 1.5 }), { verb: 0.2, echo: 0.3 }));
  const arp = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.04 }, volume: -20 })
    .connect(route(new Tone.Filter({ type: 'lowpass', frequency: 2600 }), { echo: 0.25 }));

  await reverb.ready;

  return (leads, step, time) => {
    const { s, bar, inBar, letter, layers, b, n, silent } = stepInfo(song, step);
    const arpPattern = song.patterns?.[letter]?.arp ?? song.arp;
    const stabPattern = song.patterns?.[letter]?.stab ?? song.stab;
    const chord = CHORDS[song.chords[bar % song.chords.length]];
    const has = name => layers.has(name) && !silent;
    // Drop-Anfang
    if (inBar === 0 && song.hits.includes(bar)) {
      impact.triggerAttackRelease(midi(chord.root - 12), 1.4, time);
      boom.triggerAttackRelease(1, time, 0.8);
      crash.triggerAttackRelease(1.8, time, 0.9);
    }
    // Schlagzeug
    if (has('kick') && inBar % 4 === 0) {
      kick.triggerAttackRelease('C1', 0.25, time);
      click.triggerAttackRelease(0.01, time);
      duck(time);
    }
    if (has('clap') && (inBar === 4 || inBar === 12)) {
      clap.triggerAttackRelease(0.02, time, 0.5);   // Clap = drei schnelle Schläge
      clap.triggerAttackRelease(0.02, time + 0.011, 0.6);
      clap.triggerAttackRelease(0.15, time + 0.022, 1);
    }
    if (has('hat')) hat.triggerAttackRelease(0.03, time, inBar % 4 === 2 ? 1 : inBar % 2 ? 0.45 : 0.7);
    if (has('open') && inBar % 4 === 2) open.triggerAttackRelease(0.15, time);
    // Build-up: Riser über alle Takte, Snare-Wirbel immer dichter und lauter
    if (layers.has('build')) {
      if (b === 0 && inBar === 0) {
        const length = n * 16 * sixteenth;
        riser.envelope.attack = length;
        riser.triggerAttackRelease(length, time, 0.9);
        riserFilter.frequency.setValueAtTime(400, time);
        riserFilter.frequency.exponentialRampToValueAtTime(11000, time + length);
        lifter.triggerAttack(midi(chord.root + 12), time, 0.8);
        lifter.frequency.exponentialRampToValueAtTime(midi(chord.root + 36), time + length);
        lifter.triggerRelease(time + length);
      }
      if (snareRoll(b, n, inBar)) {
        const velocity = 0.35 + 0.65 * ((b * 16 + inBar) / (n * 16));
        snare.triggerAttackRelease(0.1, time, velocity);
        snareBody.triggerAttackRelease(200, 0.08, time, velocity);
      }
    }
    // Bass
    if (has('bass') && inBar % 4 === 2) bass(chord.root, sixteenth * 1.8, time);
    if (has('roll') && inBar % 4 !== 0) bass(chord.root + (bar % 2 && inBar >= 14 ? 12 : 0), sixteenth * 0.8, time, inBar % 2 ? 0.7 : 0.9);
    if (has('long') && inBar === 0) sub.triggerAttackRelease(midi(chord.root), sixteenth * 15.5, time, 0.45);
    // Akkorde
    if (has('pad') && inBar === 0) pad.triggerAttackRelease(chord.pad.map(midi), sixteenth * 15.5, time, 0.7);
    if (has('stab') && stabPattern[inBar] === 'x') stabs.triggerAttackRelease(chord.pad.map(note => midi(note + 12)), sixteenth * 1.4, time, 0.8);
    if (has('arp')) {
      const k = arpPattern[inBar];
      if (k !== '.') {
        const tones = [...chord.pad, chord.pad[0] + 12];
        arp.triggerAttackRelease(midi(tones[Number(k)] + 12), sixteenth * 0.8, time, 0.8);
      }
    }
    // Melodien
    if (!silent)
      for (const note of leads.get(s) ?? []) {
        const length = sixteenth * note.length * 0.92;
        if (note.voice === 'pluck') pluck.triggerAttackRelease(midi(note.midi), length, time, 0.85);
        else {
          lead.triggerAttackRelease(midi(note.midi), length, time, 0.85);
          if (note.octave) leadHigh.triggerAttackRelease(midi(note.midi + 12), length, time, 0.7);
        }
      }
  };
}

/** Melodien eines Stücks: Schritt → [{ midi, length, voice, octave }] (mehrere Stimmen gleichzeitig möglich) */
function leadsOf(song) {
  const leads = new Map();
  for (const { bar, voice, notes, octave = false } of song.leads)
    for (const n of parseMelody(notes)) {
      const at = bar * 16 + n.step;
      leads.set(at, [...(leads.get(at) ?? []), { ...n, voice, octave }]);
    }
  return leads;
}

/** Länge einer Schleife in s */
export const loopLength = song => (barsOf(song) * 16 * 60) / song.bpm / 4;

/** Periode der gerenderten Schleife in s – auf ganze Samples gerundet (so lang ist sie in den Dateien) */
export const loopPeriod = song => Math.round(loopLength(song) * RENDER_RATE) / RENDER_RATE;

/** Stück offline in einen Puffer rendern, nahtlos schleifbar: der Nachhall hinter dem Ende wird vorn eingemischt */
async function renderSong(Tone, song) {
  const length = loopLength(song);
  const leads = leadsOf(song);
  const steps = barsOf(song) * 16;
  const sixteenth = length / steps;
  const rendered = await Tone.Offline(async ({ transport }) => {
    const play = await createBand(Tone, Tone.getDestination(), song);
    let step = 0;
    transport.bpm.value = song.bpm;
    transport.scheduleRepeat(time => step < steps && play(leads, step++, time), sixteenth, 0);
    transport.start(0);
  }, length + TAIL, 2, RENDER_RATE);
  const audio = rendered.get();
  const n = Math.round(loopPeriod(song) * RENDER_RATE);
  const loop = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: RENDER_RATE });
  for (let c = 0; c < 2; c++) {
    const src = audio.getChannelData(c);
    const dst = loop.getChannelData(c);
    dst.set(src.subarray(0, n));
    for (let i = n; i < src.length; i++) dst[i - n] += src[i];
  }
  // Spitze auf höchstens PEAK: Impacts sollen nicht den Limiter (sound.js) quetschen; gleicht die Stücke auch an
  let peak = 0;
  for (let c = 0; c < 2; c++) for (const v of loop.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  if (peak > PEAK) for (let c = 0; c < 2; c++) {
    const data = loop.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] *= PEAK / peak;
  }
  return new Tone.ToneAudioBuffer(loop);
}

/**
 * Stück für den Export rendern: Schleife mit MUSIC_PAD Rand davor (Ende der Schleife) und dahinter (Anfang) –
 * daraus werden die MP3-Dateien (Dev-Seite /dev/musik/ → scripts/encode-music.sh → public/audio/).
 * @returns {Promise<AudioBuffer>}
 */
export async function renderForExport(Tone, name) {
  const loop = (await renderSong(Tone, SONGS[name])).get();
  const n = loop.length;
  const pad = Math.round(MUSIC_PAD * loop.sampleRate);
  const out = new AudioBuffer({ numberOfChannels: 2, length: n + 2 * pad, sampleRate: loop.sampleRate });
  for (let c = 0; c < 2; c++) {
    const src = loop.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src.subarray(n - pad), 0);
    dst.set(src, pad);
    dst.set(src.subarray(0, pad), pad + n);
  }
  return out;
}

const BEAT_DECAY = 9;   // 1/s – so schnell klingt ein Schlag im Takt (beat()) ab

/**
 * Musik als Schleifen aus fertigen Audio-Dateien (public/audio/<name>-v<MUSIC_VERSION>.mp3, musicFile, Rand MUSIC_PAD). Vorher wurden die Stücke
 * im Browser gerendert – auf dem Handy dauerte das ~20 s bis zum ersten Ton; davor liefen die Synths live und kosteten
 * neben WebGL zu viel Rechenzeit (Rauschen, Aussetzer). Die Synths in diesem Modul bleiben die Quelle der Dateien.
 * @param {typeof import('tone')} Tone  @param {import('tone').ToneAudioNode} out
 * @param {{ url?: (name: string) => string }} [options]  url: Adresse der Datei je Stück; ohne → im Browser rendern
 *   (Dev-Seite zum Vorhören)
 */
export function createMusic(Tone, out, { url } = {}) {
  // Echtzeit-Kontext festhalten: Während Tone.Offline rendert, zeigt Tone.getContext() auf den Offline-Kontext –
  // Knoten fürs Abspielen dürfen nie dort entstehen (sonst „different audio context“, Musik startet nicht)
  const context = Tone.getContext();
  const buffers = new Map();   // Name → Promise<{ buffer: ToneAudioBuffer, loopStart: number, loopEnd: number }>
  const beats = new Map();     // Name → beatMap
  let queue = Promise.resolve();
  /** Datei laden und dekodieren – Schleife = Fenster ab dem Rand */
  const load = async name => {
    const response = await fetch(url(name));
    if (!response.ok) throw new Error(`Musik ${name}: ${response.status}`);
    const audio = await context.decodeAudioData(await response.arrayBuffer());
    return { buffer: new Tone.ToneAudioBuffer(audio), loopStart: MUSIC_PAD, loopEnd: MUSIC_PAD + loopPeriod(SONGS[name]) };
  };
  /** im Browser rendern (Dev-Seite) – die ganze Schleife */
  const renderLoop = async name => {
    const buffer = await renderSong(Tone, SONGS[name]);
    return { buffer, loopStart: 0, loopEnd: buffer.duration };
  };
  /** Laden bzw. Rendern nacheinander (nie zwei gleichzeitig) */
  const render = name => {
    if (!buffers.has(name)) {
      const job = queue.then(() => (url ? load(name) : renderLoop(name)));
      queue = job.catch(() => {});
      buffers.set(name, job);
      job.catch(() => buffers.delete(name));   // später nochmal versuchen
    }
    return buffers.get(name);
  };

  let current = null;
  let player = null;   // { node, gain, name, start (Kontextzeit, zu der Schritt 0 erklingt), period }

  const fadeOut = old => {
    if (!old) return;
    old.gain.gain.cancelScheduledValues(context.now());
    old.gain.gain.rampTo(0, FADE * 0.8, context.now());
    setTimeout(() => {
      old.node.stop();
      old.node.dispose();
      old.gain.dispose();
    }, FADE * 1000 + 100);
  };

  return {
    /** Stück wechseln (blendet aus und wieder ein); null = Stille. Ist es noch nicht geladen, setzt es danach ein. */
    play(name) {
      if (name === current) return;
      current = name;
      fadeOut(player);
      player = null;
      if (!name) return;
      render(name).then(({ buffer, loopStart, loopEnd }) => {
        if (current !== name || player) return;
        const gain = new Tone.Gain({ gain: 0, context }).connect(out);
        const node = new Tone.Player({ url: buffer, loop: true, loopStart, loopEnd, context }).connect(gain);
        const start = context.now() + 0.05;
        node.start(start, loopStart);
        gain.gain.rampTo(1, FADE * 2, start);
        // (die Encoder-Verzögerung der MP3s gleicht der Decoder über den LAME-Header aus – gemessen: 0 Samples Versatz)
        player = { node, gain, name, start, period: loopEnd - loopStart };
        // die übrigen Stücke nacheinander vorbereiten (laden) – Wechsel (Menü → Spiel → Boss) gehen dann ohne Pause
        for (const other of Object.keys(SONGS)) render(other);
      }, () => {});
    },
    /** im Hintergrund vorbereiten */
    prepare: render,
    /**
     * Takt gerade jetzt (was man hört): 0 = Stille … 1 = Kick, bis 1,6 auf dem Drop – klingt nach jedem Schlag ab.
     * Folgt dem Ein-/Ausblenden des Stücks.
     */
    beat() {
      if (!player) return 0;
      const song = SONGS[player.name];
      if (!beats.has(player.name)) beats.set(player.name, beatMap(song));
      const map = beats.get(player.name);
      const raw = context.rawContext;
      const heard = raw.currentTime - (raw.outputLatency || raw.baseLatency || 0);
      const pos = heard - player.start;
      if (pos < 0) return 0;
      const sixteenth = 60 / song.bpm / 4;
      const at = (pos % player.period) / sixteenth;
      const step = Math.floor(at);
      // letzter Schlag (bis zu einem Takt zurück)
      for (let k = 0; k < 16; k++) {
        const v = map[(step - k + map.length) % map.length];
        if (v > 0) return v * Math.exp(-BEAT_DECAY * (at - step + k) * sixteenth) * Math.min(1, player.gain.gain.value);
      }
      return 0;
    },
  };
}
