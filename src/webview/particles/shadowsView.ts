import type { Vec3 } from '../../formats/w3d/w3dPose';
import {
  DEFAULT_SUN,
  computeGroundProjection,
  getHeightPlane,
} from '../../game/objects/objectShadows';
import type { DecalShadow, ObjectShadow } from '../../game/objects/objectShadows';
import { multiplyMatrices, toTranslation } from '../../game/objects/placeComposedParts';
import type { Matrix4 } from '../../game/objects/placeComposedParts';
import { element } from '../shared/element';
import { createGroundRenderer } from './groundRenderer';
import type { ViewerCamera } from '../shared/viewer/createViewer';
import { getPlacedParts } from './composedParts';
import { getModelOrigin } from './emitterOrigin';
import { post, viewer } from './page';

const DEFAULT_GROUND = '#5c5c57';
const COLOUR = /^#[0-9a-f]{6}$/i;

const shadows = {
  isOn: false,
  hasObject: false,
  sun: DEFAULT_SUN,
  groundColour: DEFAULT_GROUND,
  main: undefined as ObjectShadow | undefined,
};
const textures = new Map<string, WebGLTexture | null | 'loading'>();
const appeared = new Map<string, number>();

const openGround = () => {
  try {
    return viewer.gl && createGroundRenderer(viewer.gl);
  } catch (error) {
    console.error(error);
    return undefined;
  }
};

const ground = openGround();

const GROUND_REACH = 4.5;
const SMALLEST_GROUND = 60;
const CAST_LIFT = 0.1;

interface Caster {
  id: string;
  shadow: ObjectShadow;
  at: Matrix4;
  bounds: { min: Vec3; max: Vec3 } | undefined;
  drawCast(matrix: Matrix4): void;
}

const button = element('button', 'Shadows');
const colour = element('input');

colour.type = 'color';
colour.id = 'groundColour';
colour.hidden = true;
colour.value = DEFAULT_GROUND;
colour.title = 'Ground colour under the shadows';
colour.oninput = () => {
  shadows.groundColour = colour.value;
  viewer.showStatus('ground colour');
};
colour.onchange = () => post({ kind: 'setGroundColour', colour: colour.value });

button.hidden = true;
button.title =
  "Draw a ground, the shadows cast on it and the stock blobs; an object's own shadow textures always show";
button.setAttribute('aria-pressed', 'false');
button.onclick = () => {
  shadows.isOn = !shadows.isOn;
  colour.hidden = !shadows.isOn;
  button.setAttribute('aria-pressed', String(shadows.isOn));
  viewer.showStatus(`shadows ${shadows.isOn ? 'shown' : 'off'}`);
};
viewer.toggles.append(button);
viewer.viewBar.append(colour);

export const setGroundColour = (kept: string | undefined): void => {
  if (kept && COLOUR.test(kept)) {
    shadows.groundColour = kept;
    colour.value = kept;
  }
};

export const setMainShadow = (
  shadow: ObjectShadow | undefined,
  sun: readonly [number, number, number] | undefined,
): void => {
  shadows.hasObject = true;
  shadows.main = shadow;
  shadows.sun = sun ? [...sun] : DEFAULT_SUN;
  button.hidden = false;
  colour.hidden = !shadows.isOn;
};

export const receiveDecal = (name: string, url: string | null): void => {
  const key = name.toLowerCase();

  if (textures.get(key) !== 'loading') {
    return;
  }
  if (!url || !ground) {
    textures.set(key, null);
    return;
  }
  void ground.loadTexture(url).then((texture) => {
    if (textures.get(key) !== 'loading') {
      if (texture) {
        viewer.gl?.deleteTexture(texture);
      }
      return;
    }
    textures.set(key, texture);
    viewer.showStatus('');
  });
};

export const forgetDecals = (): void => {
  textures.forEach((texture) => {
    if (texture && texture !== 'loading') {
      viewer.gl?.deleteTexture(texture);
    }
  });
  textures.clear();
};

const requestTexture = (name: string) => {
  const key = name.toLowerCase();

  if (!textures.has(key)) {
    textures.set(key, 'loading');
    post({ kind: 'loadDecal', name });
  }
  const found = textures.get(key);

  return found === 'loading' ? undefined : (found ?? undefined);
};

const getOpacity = (id: string, { opacity, fadeIn, texture }: DecalShadow) => {
  if (!fadeIn) {
    return opacity;
  }

  const key = `${id}|${texture}`;
  const now = performance.now();

  if (!appeared.has(key)) {
    appeared.set(key, now);
  }

  const done = Math.min(1, (now - appeared.get(key)!) / fadeIn.milliseconds);

  return fadeIn.from + (opacity - fadeIn.from) * done;
};

const listCasters = (): Caster[] => {
  const main = viewer.getModel();

  return [
    ...(shadows.main && (main || shadows.main.kind === 'decal')
      ? [
          {
            id: 'main',
            shadow: shadows.main,
            at: toTranslation(getModelOrigin()),
            bounds: main?.bounds,
            drawCast: (matrix: Matrix4) =>
              viewer.drawModelShadow(matrix, getHeightPlane(toTranslation(getModelOrigin()))),
          },
        ]
      : []),
    ...getPlacedParts().flatMap(({ part, at, bounds, drawShadow }) =>
      part.shadow
        ? [{ id: part.id, shadow: part.shadow, at, bounds, drawCast: drawShadow }]
        : [],
    ),
  ];
};

const drawGround = ({ matrix }: ViewerCamera) => {
  if (!ground || !shadows.isOn || !shadows.hasObject) {
    return;
  }

  const bounds = viewer.getModel()?.bounds;
  const size = bounds ? Math.hypot(...bounds.max.map((max, axis) => max - bounds.min[axis])) / 2 : 0;
  const [x, y] = getModelOrigin();

  const rgb = [1, 3, 5].map(
    (at) => parseInt(shadows.groundColour.slice(at, at + 2), 16) / 255,
  ) as Vec3;

  ground.drawGround(
    Array.from(matrix),
    [x, y],
    Math.max(SMALLEST_GROUND, size * GROUND_REACH),
    rgb,
  );
};

const drawShadows = ({ matrix }: ViewerCamera) => {
  const { gl } = viewer;

  if (!gl || !ground || !shadows.hasObject) {
    return;
  }

  const view = Array.from(matrix);
  const casters = listCasters().filter(
    ({ shadow }) => shadows.isOn || (shadow.kind === 'decal' && shadow.isCustom),
  );

  if (!casters.length) {
    return;
  }

  gl.enable(gl.STENCIL_TEST);
  gl.stencilMask(0xff);
  gl.clearStencil(0);
  gl.clear(gl.STENCIL_BUFFER_BIT);
  gl.stencilFunc(gl.EQUAL, 0, 0xff);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
  for (const { shadow, at, drawCast } of casters) {
    if (shadow.kind === 'cast') {
      const onGround = multiplyMatrices(
        toTranslation([0, 0, CAST_LIFT]),
        computeGroundProjection(shadows.sun, shadow.minSunAngle),
      );

      drawCast(multiplyMatrices(multiplyMatrices(view, onGround), at));
    }
  }
  gl.disable(gl.STENCIL_TEST);

  for (const { id, shadow, at, bounds } of casters) {
    if (shadow.kind !== 'decal') {
      continue;
    }

    const texture = requestTexture(shadow.texture);
    const width = shadow.width || (bounds ? bounds.max[0] - bounds.min[0] : 0);
    const depth = shadow.depth || (bounds ? bounds.max[1] - bounds.min[1] : 0);

    if (!texture || !width || !depth) {
      continue;
    }

    const facing = Math.atan2(at[1], at[0]);
    const [x, y] = shadow.offset;

    ground.drawDecal(view, {
      blend: shadow.blend,
      texture,
      centre: [
        at[12] + x * Math.cos(facing) - y * Math.sin(facing),
        at[13] + x * Math.sin(facing) + y * Math.cos(facing),
      ],
      facing,
      width,
      depth,
      opacity: getOpacity(id, shadow),
    });
  }
};

viewer.addLayer({ drawUnder: drawGround, draw: drawShadows });
