// Soundeffekte zu den Spielereignissen – alles synthetisch (Tone.js), keine Sound-Dateien.
//
// Klangidee „Candy im All“: Treffer sind kurze, runde „Plopps“, deren Tonhöhe von der Blockfarbe abhängt (pentatonisch
// – viele Treffer klingen wie eine kleine Melodie statt wie Lärm), Explosionen sind dumpfe Rauschwolken mit Bass,
// Flieger heben mit einem aufsteigenden Wusch ab und fallen mit einer Rutschpfeife vom Band.
//
// Jede Stimme ist einstimmig und wird reihum benutzt (Pool). Damit Tone.js nie über Zeitfolgen stolpert, startet eine
// Stimme immer strikt nach ihrem letzten Start (`at`). Häufige Klänge (Schuss, Treffer) sind gedrosselt.
import { COLORS } from '../core/colors.js';

const PENTATONIC = [0, 2, 4, 7, 9];
const HIT_GAP = 0.035;    // s – höchstens so oft ein Treffer-Plopp
const FIRE_GAP = 0.08;    // s – höchstens so oft ein Laser
const COLOR_IDS = Object.keys(COLORS);

/** @param {typeof import('tone')} Tone  @param {import('tone').ToneAudioNode} out */
export function createSfx(Tone, out) {
  const midi = n => Tone.Frequency(n, 'midi').toFrequency();
  /** Blockfarbe → Ton (G4-Pentatonik über zwei Oktaven) */
  const colorNote = color => {
    const i = Math.max(0, COLOR_IDS.indexOf(color)) % 10;
    return midi(67 + 12 * Math.floor(i / 5) + PENTATONIC[i % 5]);
  };

  const reverb = new Tone.Reverb({ decay: 1.8, wet: 0.22 }).connect(out);
  const dry = new Tone.Gain(1).connect(reverb);

  /** Pool einstimmiger Stimmen; liefert { node, at } mit sicherer Startzeit. `hold`: so lange spielt die Stimme
   *  danach noch weitere Töne (die nächste Benutzung startet erst danach) */
  function pool(count, make) {
    const voices = Array.from({ length: count }, () => ({ node: make(), last: -1 }));
    let k = 0;
    return (delay = 0, hold = 0) => {
      const voice = voices[k++ % count];
      const at = Math.max(Tone.immediate() + delay, voice.last + 0.01);
      voice.last = at + hold;
      return { node: voice.node, at };
    };
  }

  /** Ton mit Tonhöhen-Rutsch von `from` nach `to` Hz in `glide` s */
  function sweep(voice, from, to, glide, duration, velocity = 1) {
    const { node, at } = voice;
    node.frequency.cancelScheduledValues(at);
    node.triggerAttackRelease(from, duration, at, velocity);
    node.frequency.exponentialRampToValueAtTime(to, at + glide);
    return at;
  }

  // Plopp (Treffer): Sinus, fällt kurz von der Oktave darüber auf den Ton
  const pop = pool(4, () => new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.002, decay: 0.11, sustain: 0, release: 0.04 }, volume: -12 }).connect(dry));
  // Laser: „Pju“ – Pulswelle, die schnell nach unten rutscht
  const zap = pool(3, () => new Tone.Synth({ oscillator: { type: 'pulse', width: 0.25 }, envelope: { attack: 0.001, decay: 0.11, sustain: 0, release: 0.03 }, volume: -25 }).connect(dry));
  // Gleiter: Wusch beim Start, Rutschpfeife, Zirp beim Abflug
  const glide = pool(3, () => new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.25, sustain: 0.2, release: 0.15 }, volume: -15 }).connect(dry));
  // Rauschen durch einen Filter (Wusch, Zischen, Explosion)
  const noise = pool(3, () => {
    const filter = new Tone.Filter({ type: 'lowpass', frequency: 2000, Q: 0.7 }).connect(dry);
    const synth = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.1 }, volume: -14 }).connect(filter);
    return { synth, filter };
  });
  // Bass-Wumms der Explosion
  const boom = pool(2, () => new Tone.MembraneSynth({ pitchDecay: 0.09, octaves: 6, envelope: { attack: 0.001, decay: 0.7, sustain: 0, release: 0.2 }, volume: -6 }).connect(out));
  // Glocke: Sterne, Specials, Sieg
  const bell = pool(4, () => new Tone.FMSynth({
    harmonicity: 3.01, modulationIndex: 12,
    envelope: { attack: 0.002, decay: 1.1, sustain: 0, release: 0.6 },
    modulationEnvelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.2 },
    volume: -16,
  }).connect(dry));
  // dumpfer Ton: blockiert, „geht nicht“, verloren
  const low = pool(2, () => new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.18, sustain: 0.3, release: 0.12 }, volume: -10 }).connect(dry));

  /** Rausch-Stoß: Filter läuft von `from` nach `to` Hz */
  function hiss({ from, to, decay, type = 'pink', filter = 'lowpass', velocity = 1, delay = 0 }) {
    const { node, at } = noise(delay);
    node.synth.noise.type = type;
    node.filter.type = filter;
    node.synth.envelope.decay = decay;
    node.filter.frequency.cancelScheduledValues(at);
    node.filter.frequency.setValueAtTime(from, at);
    node.filter.frequency.exponentialRampToValueAtTime(to, at + decay);
    node.synth.triggerAttackRelease(decay, at, velocity);
  }

  const ding = (note, delay = 0, velocity = 0.8) => {
    const { node, at } = bell(delay);
    node.triggerAttackRelease(midi(note), 0.4, at, velocity);
  };

  let lastHit = -1;
  let lastFire = -1;

  return {
    hit(color) {
      const now = Tone.immediate();
      if (now - lastHit < HIT_GAP) return;
      lastHit = now;
      const f = colorNote(color);
      sweep(pop(), f * 2, f, 0.035, 0.08, 0.7 + Math.random() * 0.3);
    },
    fire() {
      const now = Tone.immediate();
      if (now - lastFire < FIRE_GAP) return;
      lastFire = now;
      sweep(zap(), 1900 + Math.random() * 200, 240, 0.12, 0.1, 0.6);
    },
    /** Start vom Band; Spreng-Flieger zusätzlich mit Warn-Piepsen */
    launch(bomber = false) {
      sweep(glide(), bomber ? 180 : 260, bomber ? 560 : 820, 0.24, 0.22);
      hiss({ from: 500, to: 4000, decay: 0.3, filter: 'bandpass', velocity: 0.5 });
      if (bomber) [0.12, 0.24].forEach(delay => ding(96, delay, 0.5));
    },
    leave() {
      sweep(glide(), 620, 1250, 0.12, 0.1, 0.5);
    },
    recall() {
      sweep(glide(), 820, 240, 0.4, 0.38);
      hiss({ from: 4000, to: 400, decay: 0.45, filter: 'bandpass', velocity: 0.5 });
    },
    drop() {
      sweep(glide(), 950, 160, 0.6, 0.55, 0.6);
    },
    blocked() {
      // „oh-oh“: zwei fallende Töne
      const voice = low(0, 0.14);
      voice.node.triggerAttackRelease(midi(52), 0.1, voice.at, 0.7);
      voice.node.triggerAttackRelease(midi(48), 0.16, voice.at + 0.14, 0.7);
    },
    nope() {
      sweep(low(), 140, 110, 0.08, 0.07, 0.6);
    },
    defuse() {
      hiss({ from: 6000, to: 1500, decay: 0.4, type: 'white', filter: 'bandpass', velocity: 0.5 });
      sweep(glide(), 520, 180, 0.35, 0.3, 0.5);
    },
    /** Explosion – `strength` 0 … 1 (Menge der Bruchstücke), Supernova größer */
    explode(strength = 0.5, nova = false) {
      const s = Math.min(1, Math.max(0.25, strength));
      hiss({ from: nova ? 6000 : 4000, to: 120, decay: nova ? 2 : 0.8 + s * 0.5, type: 'brown', velocity: 0.7 + s * 0.3 });
      hiss({ from: 9000, to: 2000, decay: 0.25, type: 'white', filter: 'highpass', velocity: 0.35 });
      const { node, at } = boom();
      node.triggerAttackRelease(nova ? 'G0' : 'C1', nova ? 1.2 : 0.6, at, 0.6 + s * 0.4);
    },
    pad() {
      [72, 76, 79, 84].forEach((n, k) => ding(n, k * 0.07, 0.6));
    },
    recolor() {
      [79, 81, 84, 86, 88, 91, 88, 84].forEach((n, k) => ding(n, k * 0.045, 0.45));
    },
    /** Stern im Sieg-Dialog leuchtet auf (k = 0, 1, 2 – jeder höher und mit mehr Glitzer) */
    star(k) {
      ding([84, 88, 91][k] ?? 91, 0, 0.9);
      for (let i = 0; i <= k + 1; i++) ding(96 + PENTATONIC[(i + k) % 5], 0.06 + i * 0.05, 0.3);
    },
    won() {
      [72, 76, 79, 84].forEach((n, k) => ding(n, k * 0.11, 0.8));
      [72, 76, 79].forEach(n => ding(n, 0.5, 0.5));
    },
    lost() {
      const voice = low(0, 1.3);
      [55, 54, 53].forEach((n, k) => voice.node.triggerAttackRelease(midi(n), 0.22, voice.at + k * 0.26, 0.7));
      voice.node.frequency.exponentialRampToValueAtTime(midi(46), voice.at + 1.2);
      voice.node.triggerAttackRelease(midi(52), 0.5, voice.at + 0.78, 0.7);
    },
  };
}
