// Tutorial im ersten Level: Über dem vordersten Flieger auf dem Band dreht und federt eine kleine gelbe Pyramide
// (3D, render/belt-view.js → setIndicator; der Modus steuert sie), darüber eine Sprechblase („Klick auf die Schiffe!“).
// (Ein Comic-Handschuh wurde verworfen – der erste Entwurf las sich wie ein Mittelfinger.) Reagiert man nicht (IDLE) oder kommt der Flieger dem Bandende
// nahe (PAUSE_AT), pausiert das Spiel (`paused` – der Modus hält dann Band und Figur an) und eine Fokus-Maske dunkelt
// alles außer dem Flieger ab. Mit dem ersten gestarteten Flieger ist das Tutorial fertig (auf diesem Gerät gemerkt).
// Die Ebene lässt Antippen durch (pointer-events: none) – getippt wird wie sonst auf den Flieger im Canvas.
// Darstellung: .tutorial-* in styles/global.css. Nichts poppt: Maske und Blase blenden, die Pyramide wächst.
const KEY = 'corepop:tutorial';
const IDLE = 2.5;       // s ohne Antippen → Pause + Fokus-Maske
const PAUSE_AT = 1.4;   // Bandplatz: spätestens hier pausieren, damit der Flieger nicht herunterfällt
const FADE = 300;       // ms

/** schon einmal durchgespielt? */
export function tutorialDone() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** @param {HTMLElement} container  Spielbildschirm (liegt deckungsgleich über dem Canvas)  @param {string} text */
export function createTutorial(container, text) {
  const layer = document.createElement('div');
  layer.className = 'tutorial';
  layer.innerHTML = `<div class="tutorial-mask"></div>
    <div class="tutorial-pointer"><p class="tutorial-bubble"></p></div>`;
  layer.querySelector('.tutorial-bubble').textContent = text;
  container.append(layer);
  requestAnimationFrame(() => layer.classList.add('is-on'));

  let idle = 0;
  let paused = false;
  let finished = false;

  return {
    /** hält das Spiel an (Modus: Band und Figur stehen) */
    get paused() {
      return paused && !finished;
    },
    /**
     * je Bild: `target` = Bildschirmpunkt des vordersten Fliegers relativ zum Container ({ x, y } in px) oder null,
     * `frontPos` = sein Bandplatz (Pause, bevor er herunterfällt)
     */
    update(dt, target, frontPos = Infinity) {
      if (finished) return;
      layer.classList.toggle('has-target', !!target);
      if (!target) return;
      if (!paused) idle += dt;
      if (!paused && (idle >= IDLE || frontPos < PAUSE_AT)) {
        paused = true;
        layer.classList.add('is-paused');
      }
      layer.style.setProperty('--x', `${target.x}px`);
      layer.style.setProperty('--y', `${target.y}px`);
    },
    /** erster Flieger gestartet: ausblenden, merken */
    done() {
      if (finished) return;
      finished = true;
      layer.classList.remove('is-on', 'is-paused');
      setTimeout(() => layer.remove(), FADE);
      try {
        localStorage.setItem(KEY, '1');
      } catch {
        /* nicht gemerkt – kommt beim nächsten Mal wieder */
      }
    },
    dispose() {
      finished = true;
      layer.remove();
    },
  };
}
