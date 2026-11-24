// Solo-Modus: verbindet Spiellogik (core), 3D-Darstellung (render) und Bedienung (ui).
// Markup: src/components/SoloGame.astro. Level aus ?level=n (1-basiert), höchstens bis zum freigeschalteten.
import * as THREE from 'three';
import { LEVELS, levelIndex } from '../core/levels.js';
import { createGame } from '../core/game.js';
import { createStage } from '../render/stage.js';
import { createAsteroidView } from '../render/asteroid-view.js';
import { createHangarView } from '../render/hangar-view.js';
import { createQueueView } from '../render/queue-view.js';
import { createEffectsView } from '../render/effects-view.js';
import { attachQueueInput } from '../ui/queue-input.js';
import { createHud } from '../ui/hud.js';
import { createDialog } from '../ui/dialog.js';
import { createToast } from '../ui/toast.js';
import { createHint } from '../ui/hint.js';
import { attachDragRotate } from '../ui/drag-rotate.js';
import { unlockedLevel, unlockLevel, unlockEverything, specialUnlocked, recordStars, shipDesign, SPECIALS } from '../store/progress.js';
import { createSpecials } from '../ui/specials.js';
import { useTranslations } from '../../i18n/index.js';

const RESULT_DELAY = 900;   // ms nach dem letzten Treffer bis zum Dialog

export function startSolo(root, locale) {
  const t = useTranslations(locale);
  const $ = selector => root.querySelector(selector);
  const canvas = $('[data-stage]');

  let index = 0;
  let game = null;
  let views = null;   // { asteroid, hangar, queue, effects } – pro Level neu
  let outgoing = [];  // Ansichten des vorigen Levels, die noch herausschrumpfen: { views, slots, columns }

  let stage;
  try {
    stage = createStage(canvas, {
      onLayout: placeViews,
      // verdeckt: oben die Kopfzeile (unten nur der sichere Rand) – Körper, Hangar und Warteschlange kommen dazwischen
      insets: () => {
        const play = $('[data-play]').getBoundingClientRect();
        const box = canvas.getBoundingClientRect();
        return { top: play.top - box.top, bottom: box.bottom - play.bottom };
      },
    });
    new ResizeObserver(() => stage.relayout()).observe($('[data-play]'));
  } catch {
    $('[data-no-webgl]').hidden = false;
    return;
  }

  const hud = createHud(root, t);
  const dialog = createDialog($('[data-dialog]'));
  const toast = createToast($('[data-toast]'));
  // Bildschirmpunkt → Spalte der Warteschlange (fragt die Darstellung); null = darüber, dort dreht Wischen die Figur
  const ndc = new THREE.Vector2();
  function pickColumn(x, y) {
    if (!views) return null;
    const box = canvas.getBoundingClientRect();
    ndc.set(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1);
    const hit = views.queue.pick(ndc, stage.camera);
    return hit && { column: hit.column, stepPx: (hit.step / 2) * box.width };
  }
  attachQueueInput(canvas, { pick: pickColumn, onLaunch: launch, onSlide: slide });
  attachDragRotate(canvas, radians => views?.asteroid.rotate(radians), { accept: e => !pickColumn(e.clientX, e.clientY) });
  const options = document.querySelector('[data-options]');   // Optionen offen → Spiel pausiert
  const hint = createHint($('[data-hint]'));
  // Specials: je Versuch einmal; Farbwechsel wartet auf das Antippen eines Fliegers (picking)
  let picking = null;
  const specials = createSpecials(root, { onUse: useSpecial });
  const refreshSpecials = () => specials.update({ unlocked: specialUnlocked, used: id => !!game?.usedSpecials.has(id) });

  function placeViews({ asteroidY, hangarY } = stage.anchors) {
    views?.asteroid.setY(asteroidY);
    views?.hangar.setY(hangarY);
    views?.queue.setY(hangarY);
    if (views) {
      // Sonnenschatten folgt der Figur (voller Radius – beim Laden wächst sie erst herein)
      const radius = views.asteroid.radius;
      stage.aimShadow(new THREE.Vector3(0, asteroidY, 0), radius);
    }
  }

  function load(i) {
    index = i;
    if (views) {
      // altes Level schrumpft weg, statt zu verschwinden; Effekte (Schüsse, Funken) enden sofort
      views.asteroid.vanish();
      views.hangar.vanish();
      views.queue.vanish();
      views.effects.dispose();
      outgoing.push({ views, slots: game.slots, columns: game.columns });
    }
    game = createGame(LEVELS[i]);
    views = {
      asteroid: createAsteroidView(stage.scene, game.asteroid, game.level),
      hangar: createHangarView(stage.scene, game.level.slots),
      queue: createQueueView(stage.scene, game.level.slots, { moreText: count => t('game.more', { count }), design: shipDesign() }),
      effects: createEffectsView(stage.scene, stage.camera),
    };
    placeViews();
    setPicking(null);
    refreshSpecials();
    // Shader der Effekte (Explosion) jetzt übersetzen, nicht erst bei der ersten Explosion
    views.effects.warmUp(views.asteroid.size);
    stage.warmUp();
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

  const playing = () => game && !options?.open && !dialog.open;

  function launch(column) {
    if (!playing()) return;
    if (picking === 'recolor') {
      // Farbwechsel: dieser Flieger gibt die Farbe vor
      const events = game.special('recolor', column);
      if (!events.length) return views.queue.shake(column);
      setPicking(null);
      handle(events);
      refreshSpecials();
      return;
    }
    const status = game.canLaunch(column);
    if (status === 'full') views.queue.shake(column);
    if (status !== 'ok') return;
    handle(game.launch(column));
    hint.done();
  }

  function slide(dir) {
    if (!playing()) return;
    handle(game.slide(dir));
  }

  function handle(events) {
    for (const e of events) {
      if (e.type === 'launch') views.hangar.add(e.slot, e.ship, views.queue.take(e.ship));
      else if (e.type === 'slide') {
        if (e.out) views.queue.eject(e.out, e.dir);
        if (e.out?.special === 'bomber') toast.show(t('game.bomberGone'));
      } else if (e.type === 'defuse') views.asteroid.defuse(e.crystal);
      else if (e.type === 'pad') views.hangar.addPad(e.slot);
      else if (e.type === 'recolor') views.asteroid.recolor(e.voxels);
      else if (e.type === 'fire') {
        views.hangar.aim(e.slot, views.asteroid.worldPosition(e.shot.voxel));
        views.effects.addShot(e.shot, e.ship.color, views.hangar.muzzle(e.slot));
        views.hangar.recoil(e.slot);
      } else if (e.type === 'hit') {
        if (e.shot) views.effects.removeShot(e.shot);
        const hitAt = views.asteroid.worldPosition(e.voxel);
        views.effects.burst(hitAt, e.voxel.color, views.asteroid.size);
        views.effects.flash(hitAt, e.voxel.color, views.asteroid.size);
        views.asteroid.remove(e.voxel);
        updateHud();
      } else if (e.type === 'fizzle') views.effects.removeShot(e.shot, { fizzle: true, colorId: game.slots[e.shot.slot]?.ship.color });
      else if (e.type === 'break') {
        for (const v of e.voxels) views.asteroid.remove(v, { detach: true });
        const body = views.asteroid.bounds();
        const at = views.asteroid.worldPosition(e.crystal);
        views.effects.explode(at, at.clone().sub(body.center).normalize(), [...new Set(e.voxels.map(v => v.color))], views.asteroid.size);
        views.effects.shatter(e.voxels, views.asteroid.matrixWorld, views.asteroid.size, body, at, e.energy, e.mass, views.asteroid);
        stage.shake(e.nova ? 1 : 0.7);
        if (!e.nova) toast.show(t('game.breakOff'));
        updateHud();
      } else if (e.type === 'free') views.hangar.remove(e.slot);
      else if (e.type === 'won') won();
      else if (e.type === 'lost') lost(e);
    }
  }

  function setPicking(id) {
    picking = id;
    specials.picking(id);
  }

  function useSpecial(id) {
    if (!playing()) return;
    if (id === 'recolor') {
      // erst ein Ziel wählen; nochmal tippen bricht ab
      setPicking(picking === 'recolor' ? null : 'recolor');
      if (picking) toast.show(t('special.pick'));
      return;
    }
    setPicking(null);
    const events = id === 'nova' ? game.special('nova', views.asteroid.cameraInGrid(stage.camera)) : game.special(id);
    if (events.length) toast.show(t(`special.${id}.name`));
    handle(events);
    refreshSpecials();
  }

  function won() {
    const last = index === LEVELS.length - 1;
    unlockLevel(index + 1);
    const stars = game.stars();
    const { designs } = recordStars(index, stars);
    // Neu freigeschaltet: Special (über das nächste Level) und Flieger (über die Sterne) – im Dialog nennen
    const news = [
      ...SPECIALS.filter(s => s.from === index + 1).map(s => t('special.unlocked', { name: t(`special.${s.id}.name`) })),
      ...designs.map(id => t('design.unlocked', { name: t(`design.${id}`) })),
    ];
    setTimeout(
      () =>
        dialog.show({
          heading: t(last ? 'game.allDone' : 'game.won'),
          body: news.join(' '),
          stars,
          starsLabel: t('stars.label', { count: stars }),
          label: t(last ? 'game.fromStart' : 'game.next'),
          run: () => load(last ? 0 : index + 1),
        }),
      RESULT_DELAY,
    );
  }

  function lost({ reason, color }) {
    const ammo = reason === 'ammo';
    dialog.show({
      heading: t(ammo ? 'game.lostAmmo' : 'game.lost'),
      body: ammo ? t('game.lostAmmoText', { color: t(`colors.${color}`) }) : t('game.lostText'),
      label: t('game.again'),
      run: () => load(index),
    });
  }

  stage.run(dt => {
    outgoing = outgoing.filter(({ views: old, slots, columns }) => {
      old.asteroid.update(dt);
      old.hangar.update(slots, dt);
      old.queue.update(columns, slots, dt);
      if (!old.asteroid.gone || !old.hangar.gone || !old.queue.gone) return true;
      old.asteroid.dispose();
      old.hangar.dispose();
      old.queue.dispose();
      return false;
    });
    if (!game || options?.open) return;
    views.asteroid.rotate(game.level.spin * dt);
    views.asteroid.update(dt);
    handle(game.step(dt, views.asteroid.cameraInGrid(stage.camera), shipInGrid));
    views.hangar.update(game.slots, dt);
    views.queue.update(game.columns, game.slots, dt, game.essential);
    views.effects.update(dt, game.shots, (shot, target, normal) => {
      views.asteroid.worldPosition(shot.voxel, target);
      views.asteroid.normalToWorld(shot.normal, normal);
    });
  });

  // Test-Hilfen (nur mit PUBLIC_DEBUG=true gebaut, siehe .env.example): Taste B sprengt den nächsten Kristall,
  // Taste W gewinnt das Level sofort (Figur schrumpft weg, dann „Gepoppt!“ – nächstes Level freigeschaltet),
  // Taste P schaltet alle Level frei
  if (import.meta.env.PUBLIC_DEBUG === 'true')
    addEventListener('keydown', e => {
      if (!game) return;
      const key = e.key.toLowerCase();
      if (key === 'b') handle(game.detonate(game.asteroid.crystals.find(c => c.alive)));
      if (key === 'p') {
        unlockEverything();
        refreshSpecials();
        toast.show('Alles freigeschaltet (Test)');
      }
      if (key === 'w' && game.clearAll()) {
        views.asteroid.vanish();
        updateHud();
      }
    });

  const wanted = levelIndex(new URLSearchParams(location.search).get('level') ?? unlockedLevel() + 1);
  load(Math.min(wanted, unlockedLevel()));
}
