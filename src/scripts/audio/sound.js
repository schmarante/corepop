// Klang: Soundeffekte (audio/sfx.js) und Musik (audio/music.js) mit Tone.js – eine Instanz für die ganze Sitzung
// (`getSound()`; Seitenwechsel laden nicht neu – Astro ClientRouter –, die Musik läuft durch).
//
// - Autoplay: Tone.js (~100 kB gz, eigener Chunk) wird gleich nach dem Laden geholt und alles aufgebaut. Erlaubt der
//   Browser Ton ohne Geste (z. B. Chrome, wenn man die Seite schon benutzt hat), spielt die Musik sofort; sonst
//   startet sie bei der ersten Berührung oder Taste irgendwo auf der Seite – stummer starten erlaubt kein Browser.
// - Einstellungen Musik/Effekte (store/sound.js): weich ein- und ausgeblendet, live über das Ereignis `corepop:sound`.
// - Tab im Hintergrund: Musik blendet aus, der Audio-Kontext pausiert (Akku); zurück: weiter.
// - Effekte, die während des Ladens ausgelöst werden, spielen nur nach, wenn sie noch frisch sind (`LATE`).
// - Ein Klangfehler darf das Spiel nie stören: alles in try/catch.
import { soundSettings } from '../store/sound.js';
import { createSfx } from './sfx.js';
import { createMusic } from './music.js';

const LATE = 400;          // ms – ältere Effekte aus der Ladezeit fallen weg
const SFX_LEVEL = 0.9;
const MUSIC_LEVEL = 0.65;
const SWITCH = 0.4;        // s – Ein-/Ausblenden der Busse
// Handys: Tone.js startet sonst mit dem kleinsten Audio-Puffer ('interactive') – neben WebGL zu knapp. Die Musik
// läuft vorab gerendert (audio/music.js), live sind nur noch die Effekte; 'balanced' hält deren Verzögerung klein.
export const LOW_POWER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

let shared = null;
/** die Klang-Instanz dieser Seite */
export const getSound = () => (shared ??= createSound());

function createSound() {
  let settings = soundSettings();
  let Tone = null;
  let ctx = null;          // der Echtzeit-Kontext (Tone.getContext() zeigt während eines Offline-Renders woandershin)
  let module = null;       // Promise des Imports
  let ready = null;        // { sfx, music, sfxBus, musicBus }
  let preparing = null;
  let song = null;
  const pending = [];

  const wanted = () => settings.music || settings.sfx;
  const fetchTone = () => (module ??= import('tone').then(m => (Tone = m)));


  function build() {
    const master = new Tone.Limiter(-1).toDestination();
    const sfxBus = new Tone.Gain(settings.sfx ? SFX_LEVEL : 0).connect(master);
    const musicBus = new Tone.Gain(settings.music ? MUSIC_LEVEL : 0).connect(master);
    ready = { sfx: createSfx(Tone, sfxBus), music: createMusic(Tone, musicBus), sfxBus, musicBus };
    if (settings.music && song) ready.music.play(song);
    const now = performance.now();
    for (const [name, args, at] of pending.splice(0)) if (now - at < LATE) play(name, ...args);
  }

  /** Tone.js laden und alles aufbauen; spielt, sobald der Audio-Kontext läuft (sofort, wenn der Browser es erlaubt) */
  function prepare() {
    if (!wanted()) return null;
    preparing ??= fetchTone()
      .then(() => {
        if (!ready) {
          // eigener Kontext vor dem Aufbau – alle Knoten und der Transport hängen daran
          ctx = new Tone.Context({ latencyHint: LOW_POWER ? 'balanced' : 'interactive', lookAhead: 0.05 });
          Tone.setContext(ctx);
          build();
        }
        resume();
      })
      .catch(() => {
        preparing = null;   // nächste Geste versucht es nochmal
        module = null;
      });
    return preparing;
  }

  /** Kontext wecken – klappt ohne Geste nur, wenn der Browser Autoplay erlaubt (sonst wartet das Versprechen still) */
  const resume = () => {
    if (ctx && ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {});
  };

  // jede Geste weckt den Ton (die erste startet ihn, spätere z. B. auf iOS nach dem Tab-Wechsel)
  const onGesture = () => {
    if (Tone) resume();   // noch innerhalb der Geste – sonst lassen manche Browser es nicht zu
    prepare();
  };
  prepare();
  for (const type of ['pointerdown', 'keydown', 'touchend']) addEventListener(type, onGesture, { capture: true, passive: true });

  addEventListener('corepop:sound', e => {
    settings = e.detail;
    if (!ready) {
      prepare();
      return;
    }
    ready.sfxBus.gain.rampTo(settings.sfx ? SFX_LEVEL : 0, SWITCH);
    ready.musicBus.gain.rampTo(settings.music ? MUSIC_LEVEL : 0, SWITCH);
    ready.music.play(settings.music ? song : null);
  });

  document.addEventListener('visibilitychange', () => {
    if (!ready) return;
    try {
      if (document.hidden) {
        ready.music.play(null);
        setTimeout(() => document.hidden && ctx.rawContext.suspend?.(), 700);
      } else {
        ctx.rawContext.resume?.();
        if (settings.music) ready.music.play(song);
      }
    } catch {
      // egal
    }
  });

  function play(name, ...args) {
    if (!ready) {
      if (preparing) {
        pending.push([name, args, performance.now()]);
        if (pending.length > 40) pending.shift();
      }
      return;
    }
    if (!settings.sfx) return;
    try {
      ready.sfx[name]?.(...args);
    } catch {
      // Klang darf das Spiel nie stören
    }
  }

  return {
    play,
    /** Musikstück dieser Seite: 'menu' | 'game' | 'boss' */
    music(name) {
      song = name;
      if (ready && settings.music) ready.music.play(name);
    },
  };
}
