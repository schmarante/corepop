// Musik: Blech-Synths, Pulswellen-Lead, Slap-Bass, Streicher-Fläche, Drumcomputer und Echo. Eigene Kompositionen.
//
// Drei Stücke (SONGS):
//   menu  Startseite – getragen und feierlich wie ein Abspann (Blech-Melodie, Marsch-Trommel)
//   game  im Spiel – treibend, gut gelaunt (Achtel-Bass, Arpeggio, Pulswellen-Melodie)
//   boss  Boss-Level – Endkampf in Moll: Galopp-Bass, Pauken, Becken, tiefe Blech-Schläge, steigert sich bis zum
//         Höhepunkt (siehe dort)
//
// Epische Schicht (optional je Stück): Chor („Aah“, `choir: [von, bis)` in Takten), Streicher-Ostinato in 16teln
// (`ostinato: { from, to, pattern }` – R Grundton, F Quinte, O Oktave), Impacts auf Abschnittsanfängen (`hits`: Takte),
// Becken-Swells, die einen Takt lang in einen Abschnitt hineinschwellen (`swells`: Takte), Hörner = Blech-Thema eine
// Oktave tiefer gedoppelt (`horns`).
//
// Ein Sequenzer (16tel-Schleife) liest die Stücke: Akkorde je Takt, Bass- und Schlagzeugmuster je Takt
// (16 Zeichen; Listen laufen reihum), Melodien als Notenfolge „D5:4 G5:2 r:2 …“ (Länge in 16teln, r = Pause, | nur zur Lesbarkeit).
// Jedes Stück wird einmal offline gerendert (Rechenlast, siehe createMusic) und dann als Schleife abgespielt.
// Wechsel zwischen Stücken: kurz ausblenden, umschalten, einblenden – nichts bricht hart ab.

/** n gleiche Takte */
const bars = (n, pattern) => Array.from({ length: n }, () => pattern);

/** Akkorde: Grundton (Bass, Oktave 2) und Streicher-Lage */
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
  menu: {
    bpm: 80,
    bars: 8,
    choir: [0, 8],
    horns: true,
    hits: [0, 4],
    swells: [0, 4],
    chords: ['C', 'Bb', 'F', 'C', 'Am', 'F', 'G', 'G'],
    bass: ['R.......F.......'],
    bassLength: 7,
    drums: {
      kick: ['x.......x.......'],
      snare: ['....x.......x...', '....x.......x...', '....x.......x...', '....x.......x...', '....x.......x...', '....x.......x...', '....x.......x...', '....x.......xxxx'],
      hat: ['..x...x...x...x.'],
    },
    pad: true,
    leads: [
      { bar: 0, voice: 'brass', notes: 'G4:4 C5:4 D5:2 E5:6 | F5:4 D5:4 Bb4:4 C5:4 | A4:6 C5:2 F5:8 | E5:4 D5:2 C5:2 G4:8 | A4:4 C5:4 E5:4 A5:4 | G5:6 F5:2 E5:4 C5:4 | D5:4 E5:2 F5:2 G5:4 B4:4 | D5:12 r:4' },
    ],
  },
  game: {
    bpm: 124,
    bars: 16,
    choir: [8, 16],
    horns: true,
    ostinato: { from: 8, to: 16, pattern: 'RRFRRRFROROFRRFR' },
    hits: [0, 8],
    swells: [0, 8],
    chords: ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D'],
    bass: ['R.O.R.O.R.O.F.O.'],
    bassLength: 1,
    drums: {
      kick: ['x.....x.x.......'],
      snare: ['....x.......x...', '....x.......x...', '....x.......x...', '....x.....x.xxxx'],
      hat: ['x.x.x.x.x.x.x.x.'],
    },
    pad: true,
    arp: true,
    leads: [
      { bar: 0, voice: 'pulse', notes: 'D5:2 G5:2 B5:4 A5:2 G5:2 D5:4 | F#5:4 E5:2 D5:2 A4:8 | B4:2 E5:2 G5:4 F#5:2 E5:2 B4:4 | C5:4 E5:4 G5:4 E5:4 | D5:2 G5:2 B5:4 D6:4 B5:4 | A5:6 F#5:2 D5:8 | E5:2 G5:2 C6:4 B5:2 A5:2 G5:4 | F#5:4 A5:4 D6:8' },
      { bar: 8, voice: 'brass', notes: 'B4:8 A4:8 | F#4:8 A4:8 | G4:8 B4:8 | C5:8 E5:8 | D5:8 B4:8 | A4:8 F#4:8 | G4:4 C5:4 E5:8 | D5:16' },
    ],
  },
  // Endkampf in vier Teilen (je 4 Takte): A bedrohlicher Galopp-Bass mit Pauken und tiefen Blech-Schlägen,
  // B Blech-Thema, C neapolitanischer Akkord (Es-Dur in d-Moll) für den Schauder, D Höhepunkt: volles Schlagzeug,
  // Thema hoch (Pulswelle) und eine Oktave tiefer im Blech, Blechstöße im Synkopen-Rhythmus.
  boss: {
    bpm: 108,
    bars: 16,
    choir: [4, 16],
    horns: true,
    ostinato: { from: 0, to: 16, pattern: 'RRRRRRFRRRRRRRFO' },
    hits: [0, 4, 8, 12],
    swells: [0, 4, 8, 12],
    chords: ['Dm', 'Dm', 'Bb', 'A', 'Dm', 'Bb', 'Gm', 'A', 'Dm', 'Eb', 'Dm', 'A', 'Gm', 'Eb', 'A', 'A'],
    bass: ['R.RRR.RRR.RRR.RR', 'R.RRR.RRR.RRR.RR', 'R.RRR.RRR.RRR.RR', 'R.RRR.RRO.OOO.OO'],
    bassLength: 1,
    drums: {
      kick: [...bars(3, 'x.......x.......'), 'x.......x.x.x.x.'],
      snare: [...bars(4, '................'), ...bars(8, '........x.......'), ...bars(3, '....x.......x...'), '....x...x.x.xxxx'],
      hat: [...bars(8, '................'), ...bars(8, '..x...x...x...x.')],
      tom: ['x...............', '................', '................', '........x.x.xxxx', 'x...............', '................', '................', '............x.x.',
        'x...............', 'x...............', '................', '........x.x.xxxx', 'x.......x.......', 'x.......x.......', 'x.x.x.x.x.x.x.x.', 'xxxxxxxxxxxxxxxx'],
      crash: ['x...............', ...bars(3, '................')],
    },
    doom: ['x.......x.......', 'x...............', 'x...............', 'x.......x.......', ...bars(4, '................'), 'x...............', 'x...............', '................', '................', ...bars(4, '................')],
    pad: true,
    stabs: [...bars(4, '................'), ...bars(8, 'x.........x.....'), ...bars(4, 'x..x..x...x..x..')],
    leads: [
      { bar: 4, voice: 'brass', notes: 'D5:8 F5:4 E5:4 | D5:6 C5:2 Bb4:8 | G4:4 Bb4:4 D5:4 G5:4 | F5:4 E5:4 C#5:8' },
      { bar: 8, voice: 'brass', notes: 'A5:8 G5:4 F5:4 | G5:6 F5:2 Eb5:8 | D5:4 F5:4 A5:4 D6:4 | C#6:8 A5:8' },
      { bar: 12, voice: 'pulse', notes: 'Bb5:4 A5:4 G5:4 D6:4 | Eb6:8 D6:4 Bb5:4 | C#6:4 E6:4 A6:8 | G6:4 F6:2 E6:2 C#6:8' },
      { bar: 12, voice: 'brass', notes: 'Bb4:4 A4:4 G4:4 D5:4 | Eb5:8 D5:4 Bb4:4 | C#5:4 E5:4 A5:8 | G5:4 F5:2 E5:2 C#5:8' },
    ],
  },
};

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
const TAIL = 4.5;         // s – Nachhall über das Schleifenende hinaus (wird vorn wieder eingemischt)
const RENDER_RATE = 32000; // Hz – reicht für die Synths, spart Rechenzeit und Speicher
const PEAK = 1;           // Spitzenpegel eines gerenderten Stücks (danach Musik-Bus 0,65 → Limiter)

/** Instrumente (Synths, Schlagzeug, Hall, Echo) in den aktuellen Tone-Kontext bauen;
 *  `play(song, leads, step, time)` spielt einen 16tel-Schritt */
async function createBand(Tone, out) {
  const midi = n => Tone.Frequency(n, 'midi').toFrequency();

  const reverb = new Tone.Reverb({ decay: 4.2, wet: 0.34 }).connect(out);   // großer Saal
  const echo = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.28, wet: 0.22 }).connect(reverb);
  const drumBus = new Tone.Gain(1).connect(out);
  drumBus.connect(reverb);

  // Streicher-Fläche
  const padFilter = new Tone.Filter({ type: 'lowpass', frequency: 1800, Q: 0.4 }).connect(reverb);
  const pad = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 8,
    oscillator: { type: 'fatsawtooth', count: 3, spread: 22 },
    envelope: { attack: 0.35, decay: 0.3, sustain: 0.8, release: 1.4 },
    volume: -27,
  }).connect(padFilter);
  // Blech: Sägezahn mit Filter-Hüllkurve (das „Anblasen“)
  const brass = new Tone.PolySynth(Tone.MonoSynth, {
    maxPolyphony: 8,
    oscillator: { type: 'sawtooth' },
    filter: { type: 'lowpass', rolloff: -24, Q: 1 },
    envelope: { attack: 0.03, decay: 0.25, sustain: 0.75, release: 0.35 },
    filterEnvelope: { attack: 0.07, decay: 0.3, sustain: 0.55, release: 0.35, baseFrequency: 280, octaves: 3.3 },
    volume: -17,
  }).connect(echo);
  // Pulswellen-Lead mit leichtem Vibrato
  const vibrato = new Tone.Vibrato({ frequency: 5.5, depth: 0.06 }).connect(echo);
  const pulse = new Tone.Synth({
    oscillator: { type: 'pulse', width: 0.3 },
    envelope: { attack: 0.008, decay: 0.12, sustain: 0.55, release: 0.12 },
    volume: -21,
  }).connect(vibrato);
  // Arpeggio (leise Rechteck-Perlen)
  const arpFilter = new Tone.Filter({ type: 'lowpass', frequency: 2600 }).connect(echo);
  const arp = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.07, sustain: 0, release: 0.04 }, volume: -31 }).connect(arpFilter);
  // Slap-Bass
  const bass = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    filter: { type: 'lowpass', rolloff: -24, Q: 2 },
    envelope: { attack: 0.004, decay: 0.2, sustain: 0.45, release: 0.12 },
    filterEnvelope: { attack: 0.002, decay: 0.16, sustain: 0.2, release: 0.1, baseFrequency: 110, octaves: 3.2 },
    volume: -15,
  }).connect(out);
  // Schlagzeug
  const kick = new Tone.MembraneSynth({ pitchDecay: 0.045, octaves: 6, envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.1 }, volume: -9 }).connect(drumBus);
  const snareFilter = new Tone.Filter({ type: 'highpass', frequency: 1300 }).connect(drumBus);
  const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 }, volume: -19 }).connect(snareFilter);
  const hatFilter = new Tone.Filter({ type: 'highpass', frequency: 7500 }).connect(drumBus);
  const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 }, volume: -30 }).connect(hatFilter);
  const tom = new Tone.MembraneSynth({ pitchDecay: 0.14, octaves: 1.6, envelope: { attack: 0.002, decay: 0.8, sustain: 0, release: 0.3 }, volume: -8 }).connect(drumBus);
  const crashFilter = new Tone.Filter({ type: 'highpass', frequency: 4200 }).connect(drumBus);
  const crash = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 1.6, sustain: 0 }, volume: -22 }).connect(crashFilter);

  // --- epische Schicht ---
  // Chor: verstimmte Sägezähne durch zwei Formant-Filter (≈ „Aah“), weicher Einsatz, viel Hall
  const choirBus = new Tone.Gain(1).connect(reverb);
  const formantA = new Tone.Filter({ type: 'bandpass', frequency: 760, Q: 3.5 }).connect(choirBus);
  const formantB = new Tone.Filter({ type: 'bandpass', frequency: 1180, Q: 4.5 }).connect(choirBus);
  // (Renderzeit: jede Stimme rechnet ihre Oszillatoren das ganze Stück mit – deshalb 3 Sägezähne, 6 Stimmen,
  // kurzes Ausklingen; der lange Hall trägt den Rest)
  const choir = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 6,
    oscillator: { type: 'fatsawtooth', count: 2, spread: 30 },
    envelope: { attack: 0.7, decay: 0.4, sustain: 0.85, release: 0.9 },
    volume: -10,
  });
  choir.connect(formantA);
  choir.connect(formantB);
  // Streicher-Ostinato: kurze, gerissene Sägezahn-Töne – einstimmig (16tel überlappen nicht; PolySynth je Note kostete
  // beim Rendern ein Vielfaches)
  const ostinatoFilter = new Tone.Filter({ type: 'lowpass', frequency: 2400, Q: 0.6 }).connect(reverb);
  const ostinato = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.004, decay: 0.11, sustain: 0.15, release: 0.06 },
    volume: -19,
  }).connect(ostinatoFilter);
  // Impact: tiefer Schlag + dumpfes Rauschen (der „Trailer-Hit“)
  const impact = new Tone.MembraneSynth({ pitchDecay: 0.35, octaves: 4, envelope: { attack: 0.002, decay: 1.8, sustain: 0, release: 0.8 }, volume: -5 }).connect(drumBus);
  const impactNoiseFilter = new Tone.Filter({ type: 'lowpass', frequency: 900 }).connect(reverb);
  const impactNoise = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.002, decay: 1.2, sustain: 0 }, volume: -12 }).connect(impactNoiseFilter);
  // eigenes Becken (das vom Schlagzeug kann im selben Schritt schon schlagen – Tone verlangt steigende Startzeiten)
  const impactCrashFilter = new Tone.Filter({ type: 'highpass', frequency: 4200 }).connect(drumBus);
  const impactCrash = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.002, decay: 1.8, sustain: 0 }, volume: -22 }).connect(impactCrashFilter);
  // Hörner: das Blech-Thema eine Oktave tiefer – einstimmig, weicher Sägezahn durch festes Tiefpassfilter (als zweite
  // Stimme im Blech-PolySynth kostete die Dopplung beim Rendern mehr als das ganze übrige Stück)
  const hornFilter = new Tone.Filter({ type: 'lowpass', frequency: 1100, Q: 0.7 }).connect(echo);
  const horn = new Tone.Synth({
    oscillator: { type: 'fatsawtooth', count: 2, spread: 14 },
    envelope: { attack: 0.06, decay: 0.3, sustain: 0.8, release: 0.4 },
    volume: -19,
  }).connect(hornFilter);
  // Becken-Swell: Rauschen schwillt an und bricht ab
  const swellFilter = new Tone.Filter({ type: 'highpass', frequency: 2800 }).connect(reverb);
  const swell = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 1, attackCurve: 'exponential', decay: 0.05, sustain: 0 }, volume: -20 }).connect(swellFilter);

  const voices = { brass, pulse };
  await reverb.ready;

  return (song, leads, step, time) => {
    const sixteenth = 60 / song.bpm / 4;
    const s = step % (song.bars * 16);
    const bar = Math.floor(s / 16);
    const inBar = s % 16;
    const chord = CHORDS[song.chords[bar % song.chords.length]];
    const pick = (list, b = bar) => list[b % list.length];
    // Schlagzeug
    for (const [name, patterns] of Object.entries(song.drums)) {
      if (pick(patterns)[inBar] !== 'x') continue;
      if (name === 'kick') kick.triggerAttackRelease('C1', 0.2, time);
      else if (name === 'snare') snare.triggerAttackRelease(0.12, time, pick(patterns)[inBar - 1] === 'x' ? 0.6 : 1);   // Wirbel leiser
      else if (name === 'hat') hat.triggerAttackRelease(0.03, time, inBar % 4 === 0 ? 1 : 0.6);
      else if (name === 'tom') tom.triggerAttackRelease(midi(chord.root - 12 + (inBar > 12 ? 7 : 0)), 0.5, time, pick(patterns)[inBar - 1] === 'x' ? 0.7 : 1);
      else if (name === 'crash') crash.triggerAttackRelease(1.5, time);
    }
    // Bass
    const b = pick(song.bass)[inBar];
    if (b && b !== '.') {
      const note = chord.root + (b === 'O' ? 12 : b === 'F' ? 7 : 0);
      bass.triggerAttackRelease(midi(note), sixteenth * song.bassLength * 0.9, time, inBar % 4 === 0 ? 1 : 0.75);
    }
    // Streicher: je Takt neu angeschlagen
    if (song.pad && inBar === 0) pad.triggerAttackRelease(chord.pad.map(midi), sixteenth * 15.5, time, 0.7);
    // Blechstöße und tiefe Blech-Schläge (Grundton in Oktaven) – Boss
    if (song.stabs && pick(song.stabs)[inBar] === 'x') brass.triggerAttackRelease(chord.pad.map(midi), sixteenth * 1.6, time, 0.5);
    if (song.doom && pick(song.doom)[inBar] === 'x') brass.triggerAttackRelease([chord.root, chord.root + 12].map(midi), sixteenth * 6, time, 0.9);
    // Arpeggio: Akkordtöne eine Oktave höher, auf und ab
    if (song.arp) {
      const tones = [...chord.pad, chord.pad[0] + 12].map(n => n + 12);
      const k = inBar % 6;
      arp.triggerAttackRelease(midi(tones[k < 4 ? k : 6 - k]), sixteenth * 0.8, time, 0.8);
    }
    // Melodie (Blech-Thema mit Hörnern eine Oktave tiefer)
    for (const lead of leads.get(s) ?? []) {
      voices[lead.voice].triggerAttackRelease(midi(lead.midi), sixteenth * lead.length * 0.92, time, 0.85);
      if (song.horns && lead.voice === 'brass') horn.triggerAttackRelease(midi(lead.midi - 12), sixteenth * lead.length * 0.92, time, 0.8);
    }
    const within = range => range && bar >= range[0] && bar < range[1];
    // Chor: je Takt der Akkord (Lage der Streicher)
    if (inBar === 0 && within(song.choir)) choir.triggerAttackRelease(chord.pad.map(midi), sixteenth * 15, time, 0.6);
    // Ostinato: 16tel auf Grundton/Quinte/Oktave (eine Oktave über dem Bass), Taktanfang betont
    if (song.ostinato && within([song.ostinato.from, song.ostinato.to])) {
      const o = song.ostinato.pattern[inBar];
      const note = chord.root + 24 + (o === 'F' ? 7 : o === 'O' ? 12 : 0);
      if (o !== '.') ostinato.triggerAttackRelease(midi(note), sixteenth * 0.6, time, inBar % 4 === 0 ? 0.9 : 0.6);
    }
    // Impact auf dem Abschnittsanfang, Swell schwillt den Takt davor hinein
    if (inBar === 0 && song.hits?.includes(bar)) {
      impact.triggerAttackRelease(midi(chord.root - 12), 1.6, time);
      impactNoise.triggerAttackRelease(1.1, time, 0.8);
      impactCrash.triggerAttackRelease(1.6, time, 0.8);
    }
    if (inBar === 0 && song.swells?.includes((bar + 1) % song.bars)) {
      swell.envelope.attack = sixteenth * 16;
      swell.triggerAttackRelease(sixteenth * 16, time, 0.7);
    }
  };
}

/** Melodien eines Stücks: Schritt → [{ midi, length, voice }] (mehrere Stimmen gleichzeitig möglich) */
function leadsOf(song) {
  const leads = new Map();
  for (const { bar, voice, notes } of song.leads)
    for (const n of parseMelody(notes)) {
      const at = bar * 16 + n.step;
      leads.set(at, [...(leads.get(at) ?? []), { ...n, voice }]);
    }
  return leads;
}

/** Länge einer Schleife in s */
export const loopLength = song => (song.bars * 16 * 60) / song.bpm / 4;

/** Stück offline in einen Puffer rendern, nahtlos schleifbar: der Nachhall hinter dem Ende wird vorn eingemischt */
async function renderSong(Tone, song) {
  const length = loopLength(song);
  const leads = leadsOf(song);
  const steps = song.bars * 16;
  const sixteenth = length / steps;
  const rendered = await Tone.Offline(async ({ transport }) => {
    const play = await createBand(Tone, Tone.getDestination());
    let step = 0;
    transport.bpm.value = song.bpm;
    transport.scheduleRepeat(time => step < steps && play(song, leads, step++, time), sixteenth, 0);
    transport.start(0);
  }, length + TAIL, 2, RENDER_RATE);
  const audio = rendered.get();
  const n = Math.round(length * RENDER_RATE);
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
 * Musik als vorab gerenderte Schleifen: Die Synths kosten in Echtzeit sehr viel Rechenzeit (Desktop ~25 % eines
 * Kerns) – auf Handys reichte das neben WebGL nicht, der Ton rauschte, knackste und fiel aus. Gerendert wird einmal
 * im Hintergrund (Offline-Kontext, braucht keine Geste), danach spielt nur noch ein Puffer.
 * @param {typeof import('tone')} Tone  @param {import('tone').ToneAudioNode} out
 */
export function createMusic(Tone, out) {
  // Echtzeit-Kontext festhalten: Während Tone.Offline rendert, zeigt Tone.getContext() auf den Offline-Kontext –
  // Knoten fürs Abspielen dürfen nie dort entstehen (sonst „different audio context“, Musik startet nicht)
  const context = Tone.getContext();
  const buffers = new Map();   // Name → Promise<ToneAudioBuffer>
  let queue = Promise.resolve();
  /** Rendern nacheinander (nie zwei gleichzeitig – Rechenlast) */
  const render = name => {
    if (!buffers.has(name)) {
      const job = queue.then(() => renderSong(Tone, SONGS[name]));
      queue = job.catch(() => {});
      buffers.set(name, job);
      job.catch(() => buffers.delete(name));   // später nochmal versuchen
    }
    return buffers.get(name);
  };

  let current = null;
  let player = null;   // { node, gain }

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
    /** Stück wechseln (blendet aus und wieder ein); null = Stille. Ist es noch nicht gerendert, setzt es danach ein. */
    play(name) {
      if (name === current) return;
      current = name;
      fadeOut(player);
      player = null;
      if (!name) return;
      render(name).then(buffer => {
        if (current !== name || player) return;
        const gain = new Tone.Gain({ gain: 0, context }).connect(out);
        const node = new Tone.Player({ url: buffer, loop: true, context }).connect(gain);
        node.start(context.now() + 0.05);
        gain.gain.rampTo(1, FADE * 2, context.now() + 0.05);
        player = { node, gain };
        // die übrigen Stücke nacheinander vorbereiten – Wechsel (Menü → Spiel → Boss) gehen dann ohne Pause
        for (const other of Object.keys(SONGS)) render(other);
      }, () => {});
    },
    /** im Hintergrund vorbereiten */
    prepare: render,
  };
}
