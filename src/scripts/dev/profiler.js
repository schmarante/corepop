// Dev-Profiler fürs Spiel (nur Dev-Server und Builds mit PUBLIC_DEBUG=true; Texte bewusst nur Deutsch wie alle Dev-Seiten).
// Öffnen: Taste I oder `?profiler` in der Adresse (Handy). Zeigt je Bild:
//   - Bildrate und Bildabstand, CPU-Zeit für Spiel-Update und Render-Aufruf, GPU-Zeit (wenn der Browser
//     EXT_disjoint_timer_query_webgl2 anbietet – Desktop-Chrome ja, Handys meist nicht)
//   - three.js-Zähler: Draw-Calls, Dreiecke (inkl. Schattendurchlauf), Geometrien, Texturen, Shader-Programme
//   - Leinwand in Pixeln, Pixel-Ratio, Grafik-Stufe (umschaltbar 0–3), JS-Speicher (nur Chrome)
//   - die teuersten Objekte der Szene (Dreiecke je Mesh, Instanzen gezählt – auch unsichtbare mit Null-Skalierung,
//     denn die rechnet der Vertex-Shader trotzdem)
//   - Verlauf der Bildabstände (Linien bei 60 und 30 fps)
// Drahtgitter: überschreibt alle Materialien (`scene.overrideMaterial`) – Instanzfarben bleiben erhalten.
import * as THREE from 'three';
import { TIERS, qualityTier, setQuality } from '../render/quality.js';

const HISTORY = 150;      // Bilder im Verlauf
const REFRESH = 0.5;      // s – Zahlen so oft auffrischen (sonst flimmern sie)
const TOP = 6;            // so viele teure Objekte zeigen

/** @param {ReturnType<import('../render/stage.js').createStage>} stage */
export function attachProfiler(stage, { open = false } = {}) {
  const { renderer, scene } = stage;
  const gl = renderer.getContext();

  // --- Oberfläche ---
  const panel = document.createElement('div');
  panel.style.cssText = `position:fixed;left:max(.5rem,env(safe-area-inset-left));top:calc(max(.5rem,env(safe-area-inset-top)) + 3.25rem);
    z-index:60;width:min(17rem,calc(100vw - 1rem));padding:.5rem .6rem;border-radius:.6rem;background:rgb(8 6 24 / .82);
    color:#dfe6ff;font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;pointer-events:auto;backdrop-filter:blur(4px);
    transition:opacity .2s, translate .2s;`;
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-bottom:.3rem">
      <b>Profiler</b><span style="opacity:.6">Taste I</span>
    </div>
    <canvas width="300" height="60" style="width:100%;height:42px;display:block;margin-bottom:.35rem;border-radius:.3rem;background:rgb(255 255 255 / .05)"></canvas>
    <pre data-stats style="margin:0;white-space:pre-wrap"></pre>
    <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.4rem" data-buttons></div>
    <pre data-top style="margin:.4rem 0 0;white-space:pre-wrap;opacity:.85"></pre>`;
  const stats = panel.querySelector('[data-stats]');
  const top = panel.querySelector('[data-top]');
  const graph = panel.querySelector('canvas');
  const g2 = graph.getContext('2d');
  const buttons = panel.querySelector('[data-buttons]');

  const button = (label, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'padding:.15rem .45rem;border-radius:.35rem;background:rgb(255 255 255 / .12);color:inherit;font:inherit;cursor:pointer';
    b.addEventListener('click', onClick);
    buttons.append(b);
    return b;
  };
  const wireMaterial = new THREE.MeshBasicMaterial({ wireframe: true, color: 0xffffff });
  const wire = button('Drahtgitter', () => {
    scene.overrideMaterial = scene.overrideMaterial ? null : wireMaterial;
    wire.style.background = scene.overrideMaterial ? 'rgb(120 200 255 / .45)' : 'rgb(255 255 255 / .12)';
  });
  const tierButtons = TIERS.map((_, k) => button(`Stufe ${k}`, () => setQuality(k)));
  const markTier = () => tierButtons.forEach((b, k) => (b.style.outline = k === qualityTier() ? '1px solid #8fd3ff' : 'none'));
  markTier();

  let visible = false;
  const show = on => {
    visible = on;
    if (on && !panel.isConnected) document.body.append(panel);
    panel.style.opacity = on ? '1' : '0';
    panel.style.translate = on ? '0 0' : '-0.5rem 0';
    panel.style.pointerEvents = on ? 'auto' : 'none';
  };
  show(false);
  requestAnimationFrame(() => show(open));
  const onKey = e => {
    if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey) show(!visible);
  };
  addEventListener('keydown', onKey);

  // --- GPU-Zeit (falls verfügbar) ---
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const pending = [];
  let gpu = NaN;
  const render = renderer.render.bind(renderer);
  if (timer) {
    renderer.render = (s, c) => {
      if (!visible || pending.length > 4) return render(s, c);
      const query = gl.createQuery();
      gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      render(s, c);
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      pending.push(query);
    };
  }
  function pollGpu() {
    while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = pending.shift();
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpu = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(query);
    }
  }

  // --- Messwerte ---
  const intervals = new Float32Array(HISTORY);
  const cpu = new Float32Array(HISTORY);
  let head = 0;
  let sum = { n: 0, dt: 0, update: 0, render: 0 };
  let since = 0;
  let last = performance.now();

  function heaviest() {
    const list = [];
    scene.traverseVisible(o => {
      if (!o.isMesh && !o.isPoints && !o.isLine) return;
      const geo = o.geometry;
      const per = (geo.index ? geo.index.count : geo.attributes.position?.count ?? 0) / 3;
      const count = o.isInstancedMesh ? o.count : 1;
      let owner = o;
      while (owner && !owner.name) owner = owner.parent;
      const name = owner?.name || o.type;
      list.push({ name, tris: per * count, count, shadow: o.castShadow });
    });
    // gleiche Namen zusammenfassen (z. B. viele Flieger-Teile)
    const merged = new Map();
    for (const e of list) {
      const m = merged.get(e.name) ?? { name: e.name, tris: 0, meshes: 0, shadow: false };
      m.tris += e.tris;
      m.meshes++;
      m.shadow ||= e.shadow;
      merged.set(e.name, m);
    }
    return { meshes: list.length, top: [...merged.values()].sort((a, b) => b.tris - a.tris).slice(0, TOP) };
  }

  const fmt = n => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} Mio` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} k` : String(Math.round(n)));

  function drawGraph() {
    const w = graph.width;
    const h = graph.height;
    g2.clearRect(0, 0, w, h);
    const y = ms => h - Math.min(1, ms / 50) * h;   // 0 … 50 ms
    g2.strokeStyle = 'rgb(255 255 255 / .25)';
    for (const ms of [1000 / 60, 1000 / 30]) {
      g2.beginPath();
      g2.moveTo(0, y(ms));
      g2.lineTo(w, y(ms));
      g2.stroke();
    }
    const bar = w / HISTORY;
    for (let i = 0; i < HISTORY; i++) {
      const k = (head + i) % HISTORY;
      const ms = intervals[k];
      g2.fillStyle = ms > 1000 / 30 + 2 ? '#ff5d7a' : ms > 1000 / 60 + 2 ? '#ffc94d' : '#5df2a8';
      g2.fillRect(i * bar, y(ms), Math.max(1, bar - 0.5), h - y(ms));
      g2.fillStyle = 'rgb(140 190 255 / .8)';
      g2.fillRect(i * bar, y(cpu[k]) , Math.max(1, bar - 0.5), 1.5);
    }
  }

  const stopFrames = stage.onFrame(({ update, render: renderMs }) => {
    const now = performance.now();
    const interval = now - last;
    last = now;
    if (!visible) return;
    intervals[head] = interval;
    cpu[head] = update + renderMs;
    head = (head + 1) % HISTORY;
    sum.n++;
    sum.dt += interval;
    sum.update += update;
    sum.render += renderMs;
    if (timer) pollGpu();
    since += interval / 1000;
    if (since < REFRESH) return;
    since = 0;
    const info = renderer.info;
    const canvas = renderer.domElement;
    const { meshes, top: heavy } = heaviest();
    const memory = performance.memory ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB` : 'n/a';
    stats.textContent =
      `fps        ${(1000 / (sum.dt / sum.n)).toFixed(1)}  (${(sum.dt / sum.n).toFixed(1)} ms)\n` +
      `CPU        Update ${(sum.update / sum.n).toFixed(1)} · Render ${(sum.render / sum.n).toFixed(1)} ms\n` +
      `GPU        ${timer ? (Number.isNaN(gpu) ? '…' : `${gpu.toFixed(1)} ms`) : 'n/a (keine Timer-Query)'}\n` +
      `Draw-Calls ${info.render.calls}   Dreiecke ${fmt(info.render.triangles)}\n` +
      `Meshes     ${meshes}   Geometrien ${info.memory.geometries}   Texturen ${info.memory.textures}\n` +
      `Programme  ${info.programs?.length ?? '?'}   JS-Speicher ${memory}\n` +
      `Leinwand   ${canvas.width}×${canvas.height} px  DPR ${renderer.getPixelRatio()}\n` +
      `Stufe      ${qualityTier()}  Schatten ${renderer.shadowMap.enabled ? 'an' : 'aus'}`;
    top.textContent = 'Teuerste Objekte (Dreiecke):\n' + heavy.map(e => `${fmt(e.tris).padStart(8)}  ${e.name}${e.meshes > 1 ? ` ×${e.meshes}` : ''}${e.shadow ? ' ☀' : ''}`).join('\n');
    sum = { n: 0, dt: 0, update: 0, render: 0 };
    markTier();
    drawGraph();
  });

  return () => {
    stopFrames();
    removeEventListener('keydown', onKey);
    renderer.render = render;
    scene.overrideMaterial = null;
    wireMaterial.dispose();
    panel.remove();
  };
}
