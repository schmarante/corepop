// 3D-Vorschau eines Modells für die Dev-Übersicht: dieselbe Darstellung wie im Spiel (Candy-Würfel, AO, Taumeln),
// ohne Hangar. Dreht sich von selbst (abschaltbar), Ziehen dreht zusätzlich; „Schnitt“ zeigt das Innere.
import { createStage } from '../render/stage.js';
import { createAsteroidView } from '../render/asteroid-view.js';
import { attachDragRotate } from '../ui/drag-rotate.js';
import { buildBody } from './model-catalog.js';

export function startModelPreview(canvas, level) {
  const stage = createStage(canvas, { minHalfWidth: 6, minHalfHeight: 4 });
  let view = null;
  let spinning = true;

  function show(cut) {
    view?.dispose();
    view = createAsteroidView(stage.scene, buildBody(level, { cut }).body, level);
    view.setY(0);
  }
  show(false);
  attachDragRotate(canvas, radians => view.rotate(radians));
  stage.run(dt => {
    if (spinning) view.rotate((level.spin ?? 0.3) * dt);
    view.update(dt);
  });
  return {
    setCut: show,
    setSpinning(on) {
      spinning = on;
    },
  };
}
