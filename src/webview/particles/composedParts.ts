import { poseAt } from '../../formats/w3d/w3dPose';
import type { Pose, Vec3 } from '../../formats/w3d/w3dPose';
import type { W3dAnimation } from '../../formats/w3d/w3dAnimation';
import type { ModelScene, SceneSkeleton } from '../../formats/w3d/w3dScene';
import { describePartSource } from '../../game/objects/objectComposition';
import type {
  ComposedPart,
  ObjectComposition,
} from '../../game/objects/objectComposition';
import {
  invertAffine,
  multiplyMatrices,
  placePart,
  toTranslation,
} from '../../game/objects/placeComposedParts';
import type { Matrix4, PlacedModel } from '../../game/objects/placeComposedParts';
import { createModelRenderer } from '../shared/modelRenderer';
import type { ModelRenderer } from '../shared/modelRenderer';
import { getClipFrame } from '../shared/viewer/clipTiming';
import type { ViewerCamera } from '../shared/viewer/createViewer';
import { getModelOrigin } from './emitterOrigin';
import { $, post, viewer } from './page';

type Loaded<T> = T | null | 'loading';

interface PartAnimation {
  animation: W3dAnimation;
  skeleton?: SceneSkeleton;
}

const composition = {
  parts: [] as ComposedPart[],
  notes: [] as string[],
  switched: new Map<string, boolean>(),
  isShown: true,
  shownDraw: undefined as string | undefined,
};

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  properties: Partial<HTMLElementTagNameMap[K]> = {},
): HTMLElementTagNameMap[K] =>
  Object.assign(document.createElement(tag), properties);

const models = new Map<string, Loaded<ModelScene>>();
const animations = new Map<string, Loaded<PartAnimation>>();
const renderers = new Map<string, ModelRenderer>();

interface PosedPart {
  frame: number;
  skeleton: SceneSkeleton | undefined;
  pose: Pose | undefined;
}

const NO_CLIP = -1;
const posedParts = new Map<string, PosedPart>();
const skinnedFrames = new Map<string, number>();

const isPartOn = (part: ComposedPart) =>
  composition.switched.get(part.id) ?? part.isShown;

const isMainDraw = (part: ComposedPart) =>
  part.parent === undefined && !!part.draw && part.draw === composition.shownDraw;

const requestModel = (name: string) => {
  const key = name.toLowerCase();

  if (!models.has(key)) {
    models.set(key, 'loading');
    post({ kind: 'loadPartModel', name });
  }
  const found = models.get(key);

  return found === 'loading' ? undefined : (found ?? undefined);
};

const requestAnimation = (name: string) => {
  const key = name.toLowerCase();

  if (!animations.has(key)) {
    animations.set(key, 'loading');
    post({ kind: 'loadPartAnimation', name });
  }
  const found = animations.get(key);

  return found === 'loading' ? undefined : (found ?? undefined);
};

export const receivePartModel = (name: string, scene: ModelScene | undefined): void => {
  models.set(name.toLowerCase(), scene ?? null);
  if (!scene) {
    renderComposition();
  }
};

export const receivePartAnimation = (
  name: string,
  animation: W3dAnimation | undefined,
  skeleton: SceneSkeleton | undefined,
): void => {
  animations.set(name.toLowerCase(), animation ? { animation, skeleton } : null);
};

const getRenderer = (key: string, scene: ModelScene) => {
  let renderer = renderers.get(key);

  if (!renderer && viewer.gl) {
    renderer = createModelRenderer(viewer.gl);
    renderer.setModel(scene);
    renderers.set(key, renderer);
  }
  return renderer;
};

const getFrame = (animation: W3dAnimation, seconds: number) => {
  const frame = getClipFrame(animation, seconds);

  return animation.playsWholeFrames ? Math.floor(frame) : frame;
};

const getPosedPart = (
  key: string,
  skeleton: SceneSkeleton | undefined,
  clip: PartAnimation | undefined,
  seconds: number,
): PosedPart => {
  const frame = clip ? getFrame(clip.animation, seconds) : NO_CLIP;
  const cached = posedParts.get(key);

  if (cached && cached.frame === frame && cached.skeleton === skeleton) {
    return cached;
  }

  const posed = {
    frame,
    skeleton,
    pose: skeleton && clip ? poseAt(skeleton, clip.animation, frame) : undefined,
  };

  posedParts.set(key, posed);
  return posed;
};

const isAnimationLoading = (part: ComposedPart) =>
  !!part.animation && animations.get(part.animation.toLowerCase()) === 'loading';

const toLocalDirection = (inverse: Matrix4, [x, y, z]: Vec3): Vec3 => {
  const local: Vec3 = [
    inverse[0] * x + inverse[4] * y + inverse[8] * z,
    inverse[1] * x + inverse[5] * y + inverse[9] * z,
    inverse[2] * x + inverse[6] * y + inverse[10] * z,
  ];
  const length = Math.hypot(...local) || 1;

  return local.map((axis) => axis / length) as Vec3;
};

const toLocalPoint = (inverse: Matrix4, [x, y, z]: Vec3): Vec3 => [
  inverse[0] * x + inverse[4] * y + inverse[8] * z + inverse[12],
  inverse[1] * x + inverse[5] * y + inverse[9] * z + inverse[13],
  inverse[2] * x + inverse[6] * y + inverse[10] * z + inverse[14],
];

const listDrawnParts = () => {
  const drawn = new Set<string>();

  return composition.parts.filter((part) => {
    const isDrawn =
      composition.isShown &&
      isPartOn(part) &&
      (part.parent === undefined || drawn.has(part.parent)) &&
      !isMainDraw(part);

    if (isDrawn) {
      drawn.add(part.id);
    }
    return isDrawn;
  });
};

const drawParts = ({ matrix, basis }: ViewerCamera) => {
  const shown = listDrawnParts();

  if (!shown.length || !viewer.gl) {
    return;
  }

  const root: PlacedModel = {
    matrix: toTranslation(getModelOrigin()),
    skeleton: viewer.getModel()?.skeleton,
    pose: viewer.getPose(),
  };
  const placed = new Map<string | undefined, PlacedModel>([[undefined, root]]);
  const seconds = viewer.getTime();
  const light = basis.forward.map((axis) => -axis) as Vec3;

  for (const part of shown) {
    const owner = placed.get(part.parent);
    const scene = part.model ? requestModel(part.model) : undefined;
    const clip = part.animation ? requestAnimation(part.animation) : undefined;
    const earlier = shown
      .slice(0, shown.indexOf(part))
      .filter((each) => each.parent === part.parent && each.draw)
      .flatMap((each) => placed.get(each.id)?.skeleton ?? []);
    const at = owner && placePart(part.placement, owner, earlier);

    if (!at) {
      continue;
    }

    const skeleton = scene?.skeleton;
    const key = `${part.model ?? ''}|${clip ? part.animation : ''}`.toLowerCase();
    const { frame, pose } = getPosedPart(key, skeleton, clip, seconds);

    placed.set(part.id, { matrix: at, skeleton, pose });

    const renderer = scene && !isAnimationLoading(part) && getRenderer(key, scene);
    const inverse = invertAffine(at);

    if (!renderer || !inverse) {
      continue;
    }
    if (skinnedFrames.get(key) !== frame) {
      renderer.setPose(pose);
      skinnedFrames.set(key, frame);
    }
    renderer.draw(multiplyMatrices(Array.from(matrix), at), {
      light: toLocalDirection(inverse, light),
      showBones: false,
      seconds,
      camera: {
        eye: toLocalPoint(inverse, basis.eye),
        rotation: [0, 1, 2].flatMap((column) => {
          const axis = [at[column * 4], at[column * 4 + 1], at[column * 4 + 2]];
          const project = (direction: Vec3) =>
            axis[0] * direction[0] + axis[1] * direction[1] + axis[2] * direction[2];

          return [project(basis.right), project(basis.up), -project(basis.forward)];
        }),
      },
    });
  }
};

const renderComposition = () => {
  const list = $('objectComposition');
  const parts = composition.parts.filter((part) => !isMainDraw(part));
  const { notes } = composition;
  const depthOf = (part: ComposedPart): number => {
    const parent = parts.find((each) => each.id === part.parent);

    return parent ? depthOf(parent) + 1 : 0;
  };
  const toggle = (text: string, checked: boolean, change: (on: boolean) => void) => {
    const box = element('input', { type: 'checkbox', checked });
    const label = element('label');

    box.onchange = () => change(box.checked);
    label.append(box, ` ${text}`);
    return label;
  };
  const missing = (part: ComposedPart) =>
    part.model && models.get(part.model.toLowerCase()) === null ? ' (model not found)' : '';

  list.hidden = !parts.length && !notes.length;
  list.replaceChildren(
    ...(parts.length
      ? [
          toggle(`Composition: ${parts.length} part${parts.length === 1 ? '' : 's'}`, composition.isShown, (on) => {
            composition.isShown = on;
          }),
        ]
      : [element('div', { className: 'muted', textContent: 'Composition' })]),
    ...parts.map((part) => {
      const row = element('div', { className: 'row' });

      row.style.paddingLeft = `${depthOf(part) + 1}em`;
      row.title = [describePartSource(part), part.note].filter(Boolean).join('\n');
      row.append(
        toggle(
          `${part.object ?? part.model ?? part.draw ?? part.id}${missing(part)}: ${describePartSource(part)}`,
          isPartOn(part),
          (on) => composition.switched.set(part.id, on),
        ),
      );
      return row;
    }),
    ...notes.map((note) => element('div', { className: 'muted', textContent: note })),
  );
};

const releaseUnused = (parts: readonly ComposedPart[]): void => {
  const modelNames = new Set(parts.flatMap((part) => (part.model ? [part.model.toLowerCase()] : [])));
  const animationNames = new Set(
    parts.flatMap((part) => (part.animation ? [part.animation.toLowerCase()] : [])),
  );
  const keys = new Set(
    parts.flatMap((part) => {
      const model = part.model?.toLowerCase() ?? '';
      const animation = part.animation?.toLowerCase() ?? '';

      return [`${model}|${animation}`, `${model}|`];
    }),
  );

  for (const [key, renderer] of renderers) {
    if (!keys.has(key)) {
      renderer.setModel(undefined);
      renderers.delete(key);
    }
  }
  for (const key of [...posedParts.keys(), ...skinnedFrames.keys()]) {
    if (!keys.has(key)) {
      posedParts.delete(key);
      skinnedFrames.delete(key);
    }
  }
  for (const [name, loaded] of models) {
    if (loaded !== 'loading' && !modelNames.has(name)) {
      models.delete(name);
    }
  }
  for (const [name, loaded] of animations) {
    if (loaded !== 'loading' && !animationNames.has(name)) {
      animations.delete(name);
    }
  }
};

export const showComposition = (next: ObjectComposition): void => {
  releaseUnused(next.parts);

  const isSameObject =
    next.parts.length === composition.parts.length &&
    next.parts.every((part, at) => part.id === composition.parts[at].id);

  composition.parts = next.parts;
  composition.notes = next.notes;
  if (!isSameObject) {
    composition.switched.clear();
  }
  renderComposition();
};

export const setShownDraw = (draw: string | undefined): void => {
  composition.shownDraw = draw;
  renderComposition();
};

viewer.addLayer({ draw: drawParts });
