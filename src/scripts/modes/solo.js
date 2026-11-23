// Solo-Modus: verbindet Spiellogik (core), 3D-Darstellung (render) und Bedienung (ui).
// Markup: src/components/SoloGame.astro. Level aus ?level=n (1-basiert), höchstens bis zum freigeschalteten.
import * as THREE from 'three';
import { LEVELS, levelIndex } from '../core/levels.js';
import { createGame } from '../core/game.js';
import { createStage } from '../render/stage.js';
import { createAsteroidView } from '../render/asteroid-view.js';
import { createHangarView } from '../render/hangar-view.js';
import { createEffectsView } from '../render/effects-view.js';
import { createQueue } from '../ui/queue.js';
import { createHud } from '../ui/hud.js';
import { createDialog } from '../ui/dialog.js';
import { createToast } from '../ui/toast.js';
import { createHint } from '../ui/hint.js';
import { attachDragRotate } from '../ui/drag-rotate.js';
import { unlockedLevel, unlockLevel } from '../store/progress.js';
import { useTranslations } from '../../i18n/index.js';

const RESULT_DELAY = 900;   // ms nach dem letzten Treffer bis zum Dialog

export function startSolo(root, locale) {
  const t = useTranslations(locale);
  const $ = selector => root.querySelector(selector);
  const canvas = $('[data-stage]');

  let index = 0;
  let game = null;
  let views = null;   // { asteroid, hangar, effects } – pro Level neu
  let outgoing = [];  // Ansichten des vorigen Levels, die noch herausschrumpfen: { views, slots }

  let stage;
  try {
    stage = createStage(canvas, {
      onLayout: placeViews,
      // verdeckt: oben die Kopfzeile, unten die Schiffsauswahl – Körper und Hangar kommen in den Bereich dazwischen
      insets: () => {
        const play = $('[data-play]').getBoundingClientRect();
        const box = canvas.getBoundingClientRect();
        return { top: play.top - box.top, bottom: box.bottom - play.bottom };
      },
    });
    // Schiffsauswahl wird höher/niedriger (Spalten leeren sich) → neu ausrichten
    new ResizeObserver(() => stage.relayout()).observe($('[data-play]'));
  } catch {
    $('[data-no-webgl]').hidden = false;
    return;
  }

  const hud = createHud(root, t);
  const dialog = createDialog($('[data-dialog]'));
  const toast = createToast($('[data-toast]'));
  const queue = createQueue($('[data-queue]'), t, { onLaunch: launch });
  attachDragRotate(canvas, radians => views?.asteroid.rotate(radians));
  const options = document.querySelector('[data-options]');   // Optionen offen → Spiel pausiert
  const hint = createHint($('[data-hint]'));

  function placeViews({ asteroidY, hangarY } = stage.anchors) {
    views?.asteroid.setY(asteroidY);
    views?.hangar.setY(hangarY);
  }

  function load(i) {
    index = i;
    if (views) {
      // altes Level schrumpft weg, statt zu verschwinden; Effekte (Schüsse, Funken) enden sofort
      views.asteroid.vanish();
      views.hangar.vanish();
      views.effects.dispose();
      outgoing.push({ views, slots: game.slots });
    }
    game = createGame(LEVELS[i]);
    views = {
      asteroid: createAsteroidView(stage.scene, game.asteroid, game.level),
      hangar: createHangarView(stage.scene, game.level.slots),
      effects: createEffectsView(stage.scene, stage.camera),
    };
    placeViews();
    queue.clear();   // Schiffs-Ids beginnen pro Level neu – alte Elemente nicht wiederverwenden
    queue.render(game.columns);
    updateHud();
    dialog.hide();
    const url = new URL(location.href);
    url.searchParams.set('level', String(i + 1));
    history.replaceState(history.state, '', url);
  }

  // Schiffsposition (Plattform) im Voxel-Raster – für die Schussbahn-Prüfung der Spiellogik
  const shipWorld = new THREE.Vector3();
  const shipGrid = new THREE.Vector3();
  const shipInGrid = slot => views.asteroid.toGrid(views.hangar.slotPosition(slot, shipWorld), shipGrid);

  const updateHud = () => hud.update({ index, destroyed: game.destroyed, total: game.asteroid.total });

  function launch(column) {
    const status = game.canLaunch(column);
    if (status === 'full') queue.shake(column);
    if (status !== 'ok') return;
    handle(game.launch(column));
    queue.render(game.columns);
    hint.done();
  }

  function handle(events) {
    for (const e of events) {
      if (e.type === 'launch') views.hangar.add(e.slot, e.ship);
      else if (e.type === 'fire') {
        views.hangar.aim(e.slot, views.asteroid.worldPosition(e.shot.voxel));
        views.effects.addShot(e.shot, e.ship.color, views.hangar.muzzle(e.slot));
        views.hangar.recoil(e.slot);
      } else if (e.type === 'hit') {
        if (e.shot) views.effects.removeShot(e.shot);
        views.effects.burst(views.asteroid.worldPosition(e.voxel), e.voxel.color, views.asteroid.size);
        views.asteroid.remove(e.voxel);
        updateHud();
      } else if (e.type === 'fizzle') views.effects.removeShot(e.shot, { fizzle: true, colorId: game.slots[e.shot.slot]?.ship.color });
      else if (e.type === 'break') {
        for (const v of e.voxels) views.asteroid.remove(v, { detach: true });
        const body = views.asteroid.bounds();
        const at = views.asteroid.worldPosition(e.crystal);
        views.effects.explode(at, at.clone().sub(body.center).normalize(), [...new Set(e.voxels.map(v => v.color))], views.asteroid.size);
        views.effects.breakOff(e.voxels, views.asteroid.matrixWorld, views.asteroid.size, body);
        stage.shake(0.7);
        toast.show(t('game.breakOff'));
        updateHud();
      } else if (e.type === 'skip') {
        queue.render(game.columns);
        toast.show(t('game.skipped', { count: e.count }));
      } else if (e.type === 'free') views.hangar.remove(e.slot);
      else if (e.type === 'won') won();
      else if (e.type === 'lost') lost();
    }
  }

  function won() {
    const last = index === LEVELS.length - 1;
    unlockLevel(index + 1);
    setTimeout(
      () => dialog.show({ heading: t(last ? 'game.allDone' : 'game.won'), label: t(last ? 'game.fromStart' : 'game.next'), run: () => load(last ? 0 : index + 1) }),
      RESULT_DELAY,
    );
  }

  function lost() {
    dialog.show({ heading: t('game.lost'), body: t('game.lostText'), label: t('game.again'), run: () => load(index) });
  }

  stage.run(dt => {
    outgoing = outgoing.filter(({ views: old, slots }) => {
      old.asteroid.update(dt);
      old.hangar.update(slots, dt);
      if (!old.asteroid.gone || !old.hangar.gone) return true;
      old.asteroid.dispose();
      old.hangar.dispose();
      return false;
    });
    if (!game || options?.open) return;
    views.asteroid.rotate(game.level.spin * dt);
    views.asteroid.update(dt);
    handle(game.step(dt, views.asteroid.cameraInGrid(stage.camera), shipInGrid));
    views.hangar.update(game.slots, dt);
    views.effects.update(dt, game.shots, (shot, target, normal) => {
      views.asteroid.worldPosition(shot.voxel, target);
      views.asteroid.normalToWorld(shot.normal, normal);
    });
  });

  // Test-Hilfe (nur mit PUBLIC_DEBUG=true gebaut, siehe .env.example): Taste B sprengt den nächsten Kristall
  if (import.meta.env.PUBLIC_DEBUG === 'true')
    addEventListener('keydown', e => {
      if (e.key.toLowerCase() === 'b' && game) handle(game.detonate(game.asteroid.crystals.find(c => c.alive)));
    });

  const wanted = levelIndex(new URLSearchParams(location.search).get('level') ?? unlockedLevel() + 1);
  load(Math.min(wanted, unlockedLevel()));
}
