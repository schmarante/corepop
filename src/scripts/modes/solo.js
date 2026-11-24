// Solo-Modus: verbindet Spiellogik (core), 3D-Darstellung (render) und Bedienung (ui).
// Markup: src/components/SoloGame.astro. Level aus ?level=n (1-basiert), höchstens bis zum freigeschalteten.
import * as THREE from 'three';
import { LEVELS, levelIndex } from '../core/levels.js';
import { createGame } from '../core/game.js';
import { createStage } from '../render/stage.js';
import { createAsteroidView } from '../render/asteroid-view.js';
import { createHangarView } from '../render/hangar-view.js';
import { createBeltView } from '../render/belt-view.js';
import { createEffectsView } from '../render/effects-view.js';
import { attachBeltInput } from '../ui/belt-input.js';
import { createHud } from '../ui/hud.js';
import { createDialog } from '../ui/dialog.js';
import { createToast } from '../ui/toast.js';
import { createHint } from '../ui/hint.js';
import { attachDragRotate } from '../ui/drag-rotate.js';
import { unlockedLevel, unlockLevel, unlockEverything, specialUnlocked, recordStars, shipDesign, SPECIALS } from '../store/progress.js';
import { createSpecials } from '../ui/specials.js';
import { useTranslations } from '../../i18n/index.js';
import { getSound } from '../audio/sound.js';

const RESULT_DELAY = 900;   // ms nach dem letzten Treffer bis zum Dialog

/** @returns {() => void} räumt auf (Seitenwechsel ohne Neuladen, Astro ClientRouter) */
export function startSolo(root, locale) {
  const t = useTranslations(locale);
  const sound = getSound();
  const $ = selector => root.querySelector(selector);
  const canvas = $('[data-stage]');

  let index = 0;
  let game = null;
  let views = null;   // { asteroid, hangar, belt, effects } – pro Level neu
  let outgoing = [];  // Ansichten des vorigen Levels, die noch herausschrumpfen: { views, game }

  let stage;
  let playObserver;
  let disposed = false;
  try {
    stage = createStage(canvas, {
      onLayout: placeViews,
      adaptive: true,   // zu langsam → Grafik-Stufe senken (render/quality.js)
      // verdeckt: oben die Kopfzeile (unten nur der sichere Rand) – Körper, Hangar und Warteschlange kommen dazwischen
      insets: () => {
        const play = $('[data-play]').getBoundingClientRect();
        const box = canvas.getBoundingClientRect();
        return { top: play.top - box.top, bottom: box.bottom - play.bottom };
      },
    });
    playObserver = new ResizeObserver(() => stage.relayout());
    playObserver.observe($('[data-play]'));
  } catch {
    $('[data-no-webgl]').hidden = false;
    return () => {};
  }

  const hud = createHud(root, t);
  const dialog = createDialog($('[data-dialog]'));
  const toast = createToast($('[data-toast]'));
  // Bildschirmpunkt → Flieger auf dem Band (fragt die Darstellung); null = nicht über dem Band, dort dreht Wischen.
  // Wartet „Zurückziehen“ auf ein Ziel, zählen auch die Flieger auf dem Deck.
  const ndc = new THREE.Vector2();
  function pickShip(x, y) {
    if (!views) return null;
    const box = canvas.getBoundingClientRect();
    ndc.set(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1);
    if (picking === 'recall') {
      const slot = views.hangar.pick(ndc, stage.camera);
      if (slot !== null) return { recall: slot };
    }
    return views.belt.pick(ndc, stage.camera);
  }
  const detachBelt = attachBeltInput(canvas, {
    pick: pickShip,
    onTap: hit => ('recall' in hit ? recall(hit.recall) : launch(hit.id, hit.slot)),
    visibleIds: () => (game ? views.belt.visibleIds(game.belt) : []),
  });
  const detachDrag = attachDragRotate(canvas, radians => views?.asteroid.rotate(radians), {
    accept: e => !pickShip(e.clientX, e.clientY),
    onFling: velocity => views?.asteroid.fling(velocity),   // loslassen: dreht nach und läuft aus
  });
  const options = document.querySelector('[data-options]');   // Optionen offen → Spiel pausiert
  const hint = createHint($('[data-hint]'));
  // Specials: je Versuch einmal; Farbwechsel wartet auf das Antippen eines Fliegers (picking)
  let picking = null;
  const specials = createSpecials(root, { onUse: useSpecial });
  const refreshSpecials = () => specials.update({ unlocked: specialUnlocked, used: id => !!game?.usedSpecials.has(id) });

  function placeViews({ asteroidY, hangarY } = stage.anchors) {
    views?.asteroid.setY(asteroidY);
    views?.hangar.setY(hangarY);
    views?.belt.setY(hangarY);
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
      views.belt.vanish();
      views.effects.dispose();
      outgoing.push({ views, game });
    }
    game = createGame(LEVELS[i]);
    // Boss-Level: Hintergrund wechselt in die Boss-Stimmung (render/starfield.js liest data-boss), die Figur glitcht
    document.documentElement.dataset.boss = game.level.boss ? '1' : '';
    sound.music(game.level.boss ? 'boss' : 'game');
    views = {
      asteroid: createAsteroidView(stage.scene, game.asteroid, game.level, { glitch: !!game.level.boss }),
      hangar: createHangarView(stage.scene, game.level.slots),
      belt: createBeltView(stage.scene, game.level.slots, { moreText: count => t('game.more', { count }), design: shipDesign() }),
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

  /** Flieger vom Band starten (`slot`: die Plattform darüber, bevorzugt; null = egal) */
  function launch(id, slot) {
    if (!playing()) return;
    const ship = game.belt.find(item => item.ship.id === id)?.ship;
    if (!ship) return;
    if (picking === 'recolor') {
      // Farbwechsel: dieser Flieger gibt die Farbe vor
      const events = game.special('recolor', id);
      if (!events.length) return views.belt.shake(ship);
      setPicking(null);
      handle(events);
      refreshSpecials();
      return;
    }
    const status = game.canLaunch(id);
    if (status === 'full') {
      views.belt.shake(ship);
      sound.play('nope');
    }
    if (status !== 'ok') return;
    handle(game.launch(id, slot ?? 0));
    hint.done();
  }

  /** Special Zurückziehen: Flieger von dieser Plattform zurück in die Luke */
  function recall(slot) {
    if (!playing()) return;
    const events = game.special('recall', slot);
    if (!events.length) return;
    setPicking(null);
    toast.show(t('special.recall.name'));
    handle(events);
    refreshSpecials();
  }

  function handle(events) {
    for (const e of events) {
      if (e.type === 'launch') {
        views.hangar.add(e.slot, e.ship, views.belt.take(e.ship));
        sound.play('launch', e.ship.special === 'bomber');
      } else if (e.type === 'drop') {
        views.belt.drop(e.ship);
        sound.play('drop');
        if (e.ship.special === 'bomber') toast.show(t('game.bomberGone'));
      } else if (e.type === 'defuse') {
        views.asteroid.defuse(e.crystal);
        sound.play('defuse');
      } else if (e.type === 'pad') {
        views.hangar.addPad(e.slot);
        sound.play('pad');
      } else if (e.type === 'recolor') {
        views.asteroid.recolor(e.voxels);
        sound.play('recolor');
      } else if (e.type === 'recall') {
        views.hangar.recall(e.slot, views.belt.hatchPosition());
        sound.play('recall');
      } else if (e.type === 'blocked') sound.play('blocked');
      else if (e.type === 'leave') sound.play('leave');
      else if (e.type === 'fire') {
        sound.play('fire');
        views.hangar.aim(e.slot, views.asteroid.worldPosition(e.shot.voxel));
        views.effects.addShot(e.shot, e.ship.color, views.hangar.muzzle(e.slot));
        views.hangar.recoil(e.slot);
      } else if (e.type === 'hit') {
        if (e.shot) views.effects.removeShot(e.shot);
        const hitAt = views.asteroid.worldPosition(e.voxel);
        views.effects.burst(hitAt, e.voxel.color, views.asteroid.size);
        views.effects.flash(hitAt, e.voxel.color, views.asteroid.size);
        views.asteroid.remove(e.voxel);
        sound.play('hit', e.voxel.color);
        updateHud();
      } else if (e.type === 'fizzle') views.effects.removeShot(e.shot, { fizzle: true, colorId: game.slots[e.shot.slot]?.ship.color });
      else if (e.type === 'break') {
        for (const v of e.voxels) views.asteroid.remove(v, { detach: true });
        const body = views.asteroid.bounds();
        const at = views.asteroid.worldPosition(e.crystal);
        views.effects.explode(at, at.clone().sub(body.center).normalize(), [...new Set(e.voxels.map(v => v.color))], views.asteroid.size);
        views.effects.shatter(e.voxels, views.asteroid.matrixWorld, views.asteroid.size, body, at, e.energy, e.mass, views.asteroid);
        // Rückstoß: die Figur dreht und kippt kurz – je mehr Masse wegfliegt, desto stärker (Supernova am meisten)
        views.asteroid.impulse(at, Math.min(1.6, e.mass.reduce((sum, m) => sum + m, 0) / 350), stage.camera.position);
        stage.shake(e.nova ? 1 : 0.7);
        sound.play('explode', e.voxels.length / 300, !!e.nova);
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
    if (id === 'recolor' || id === 'recall') {
      // erst ein Ziel wählen (Flieger auf dem Band bzw. auf dem Deck); nochmal tippen bricht ab
      setPicking(picking === id ? null : id);
      if (picking) toast.show(t(id === 'recall' ? 'special.recallPick' : 'special.pick'));
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
    setTimeout(() => !disposed && sound.play('won'), RESULT_DELAY - 250);   // Fanfare kurz bevor der Dialog aufgeht
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
        !disposed &&
        dialog.show({
          heading: t(last ? 'game.allDone' : 'game.won'),
          body: news.join(' '),
          stars,
          starsLabel: t('stars.label', { count: stars }),
          label: t(last ? 'game.fromStart' : 'game.next'),
          run: () => load(last ? 0 : index + 1),
          onStar: k => sound.play('star', k),
        }),
      RESULT_DELAY,
    );
  }

  function lost({ reason, color }) {
    const ammo = reason === 'ammo';
    sound.play('lost');
    dialog.show({
      heading: t(ammo ? 'game.lostAmmo' : 'game.lost'),
      body: ammo ? t('game.lostAmmoText', { color: t(`colors.${color}`) }) : t('game.lostText'),
      label: t('game.again'),
      run: () => load(index),
    });
  }

  stage.run(dt => {
    outgoing = outgoing.filter(({ views: old, game: was }) => {
      old.asteroid.update(dt);
      old.hangar.update(was.slots, dt);
      old.belt.update(was.belt, was.queue.length, 0, dt);
      if (!old.asteroid.gone || !old.hangar.gone || !old.belt.gone) return true;
      old.asteroid.dispose();
      old.hangar.dispose();
      old.belt.dispose();
      return false;
    });
    if (!game || options?.open) return stage.glitch(null);
    views.asteroid.rotate(game.spin * dt);   // je weniger übrig, desto langsamer (core/game.js → spin)
    views.asteroid.update(dt);
    stage.glitch(views.asteroid.glitchState());   // Boss: Farbgeister als Pixel-Shader (stage.js)
    handle(game.step(dt, views.asteroid.cameraInGrid(stage.camera), shipInGrid));
    views.hangar.update(game.slots, dt);
    views.belt.update(game.belt, game.queue.length, game.state === 'play' ? game.beltSpeed : 0, dt, {
      finished: ship => !game.asteroid.aliveByColor.get(ship.color),   // Farbe fertig: grau (Falle)
    });
    views.effects.update(dt, game.shots, (shot, target, normal) => {
      views.asteroid.worldPosition(shot.voxel, target);
      views.asteroid.normalToWorld(shot.normal, normal);
    });
  });

  // Test-Hilfen (nur mit PUBLIC_DEBUG=true gebaut, siehe .env.example): Taste B sprengt den nächsten Kristall,
  // Taste W gewinnt das Level sofort (Figur schrumpft weg, dann „Gepoppt!“ – nächstes Level freigeschaltet),
  // Taste P schaltet alle Level frei
  function debugKeys(e) {
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
  }
  if (import.meta.env.PUBLIC_DEBUG === 'true') addEventListener('keydown', debugKeys);
  // Dev-Profiler (Taste I oder ?profiler): Bildzeiten, Draw-Calls, Dreiecke, Drahtgitter – nie auf der echten Seite
  let detachProfiler = () => {};
  if (import.meta.env.DEV || import.meta.env.PUBLIC_DEBUG === 'true')
    import('../dev/profiler.js').then(({ attachProfiler }) => {
      if (!disposed) detachProfiler = attachProfiler(stage, { open: new URLSearchParams(location.search).has('profiler') });
    });

  const wanted = levelIndex(new URLSearchParams(location.search).get('level') ?? unlockedLevel() + 1);
  load(Math.min(wanted, unlockedLevel()));

  return () => {
    disposed = true;
    removeEventListener('keydown', debugKeys);
    detachProfiler();
    detachBelt();
    detachDrag();
    playObserver.disconnect();
    views.effects.dispose();   // die der herausschrumpfenden Level sind schon weg (load)
    for (const v of [views, ...outgoing.map(o => o.views)]) {
      v.asteroid.dispose();
      v.hangar.dispose();
      v.belt.dispose();
    }
    stage.dispose();
    document.documentElement.dataset.boss = '';
  };
}
