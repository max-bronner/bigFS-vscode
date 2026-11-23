import { poseAt } from '../../formats/w3d/w3dPose';
import type { Pose, Vec3 } from '../../formats/w3d/w3dPose';
import type { W3dAnimation } from '../../formats/w3d/w3dAnimation';
import { findHidingSources, isSubObjectNamed } from '../../formats/w3d/w3dScene';
import type { ModelScene, SceneSkeleton } from '../../formats/w3d/w3dScene';
import { groupComposedParts } from '../../game/objects/groupComposedParts';
import type { PartGroup } from '../../game/objects/groupComposedParts';
import type {
  ComposedPart,
  ObjectComposition,
  PartStateOption,
} from '../../game/objects/objectComposition';
import {
  invertAffine,
  multiplyMatrices,
  placePart,
  toTranslation,
} from '../../game/objects/placeComposedParts';
import { getHeightPlane } from '../../game/objects/objectShadows';
import type { Matrix4, PlacedModel } from '../../game/objects/placeComposedParts';
import { getPlacedBonePoint } from '../../game/objects/placeComposedParts';
import type { ListedEffect } from '../../game/objects/listStateEffects';
import { showPartEffects } from './effectsPanel';
import { describeUpgrade, removeObjectPrefix } from '../../game/objects/appearanceControls';
import { describeCondition } from '../../game/objects/objectEffects';
import type { PartRole } from '../../game/objects/partBindings';
import {
  changeBoundAppearance,
  isFollowingAppearance,
  setComposedOptions,
} from './appearancePanel';
import { listOwnChanges, listSwitchChanges } from './boundSwitches';
import { listEarlierDraws } from './listEarlierDraws';
import { describePartGroup } from './describePartGroup';
import { getDetail, offerDetail, onDetailPicked } from './detailLevel';
import { createDisclosureRow, getGroupCheckState } from '../shared/createDisclosureRow';
import { element } from '../shared/element';
import { createModelRenderer } from '../shared/modelRenderer';
import type { ModelRenderer } from '../shared/modelRenderer';
import { getClipFrame } from '../shared/viewer/clipTiming';
import type { ViewerCamera } from '../shared/viewer/createViewer';
import { getModelOrigin } from './emitterOrigin';
import { findClip, findModel, getLookKey, loadClip, loadModel, onStoreChanged } from './modelStore';
import { $, post, viewer } from './page';

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
  partStates: {} as Record<string, PartStateOption[]>,
};

const statePicks = new Map<string, PartStateOption>();

const ROLE_TITLES: readonly [PartRole, string][] = [
  ['always', 'Always part of it'],
  ['upgrade', 'Added by upgrades'],
  ['state', 'Only in some states'],
];

const openGroups = new Set<string>();
const meshSwitches = new Map<string, Map<number, boolean>>();
const groupKeys = new Map<string, string>();

const renderers = new Map<string, { renderer: ModelRenderer; scene: ModelScene }>();
const MAX_RENDERERS = 80;
const lastDrawn = new Map<string, ComposedPart>();

interface PosedPart {
  frame: number;
  skeleton: SceneSkeleton | undefined;
  pose: Pose | undefined;
}

const NO_CLIP = -1;
let framedParts = '';
const posedParts = new Map<string, PosedPart>();
const skinnedFrames = new Map<string, number>();

const isPartOn = (part: ComposedPart) =>
  composition.switched.get(part.id) ?? part.isShown;

const isMainDraw = (part: ComposedPart) =>
  part.parent === undefined && !!part.draw && part.draw === composition.shownDraw;

const toLook = ({ model, textures, hasDetailModels }: ComposedPart) => ({
  name: model ?? '',
  textures,
  detail: getDetail(hasDetailModels),
});

interface PartKeys {
  detail: ReturnType<typeof getDetail>;
  model: string;
  animated: string;
  still: string;
}

const partKeys = new WeakMap<ComposedPart, PartKeys>();

const getPartKeys = (part: ComposedPart): PartKeys => {
  const detail = getDetail(part.hasDetailModels);
  const known = partKeys.get(part);

  if (known && known.detail === detail) {
    return known;
  }

  const model = getLookKey(toLook(part));
  const keys = {
    detail,
    model,
    animated: `${model}|${part.animation ?? ''}${part.holdsLastFrame ? '#end' : ''}`.toLowerCase(),
    still: `${model}|`,
  };

  partKeys.set(part, keys);
  return keys;
};

const getPartModelKey = (part: ComposedPart) => getPartKeys(part).model;

const getSwitchKey = (group: string, { model, hasDetailModels }: ComposedPart) =>
  `${group}|${model ?? ''}|${getDetail(hasDetailModels) ?? ''}`.toLowerCase();

const getRendererKey = (part: ComposedPart, isAnimated: boolean) =>
  isAnimated ? getPartKeys(part).animated : getPartKeys(part).still;

let earlierDraws = new Map<string, ComposedPart[]>();

const requestModel = (part: ComposedPart) => {
  if (!part.model) {
    return undefined;
  }

  const found = findModel(getPartModelKey(part));

  if (found === undefined) {
    loadModel(toLook(part));
  }
  return found ?? undefined;
};

const requestAnimation = (name: string): PartAnimation | undefined => {
  const found = findClip(name);

  if (found === undefined) {
    loadClip(name);
  }
  return found ?? undefined;
};

const getRenderer = (key: string, scene: ModelScene) => {
  let kept = renderers.get(key);

  if (!kept && viewer.gl) {
    kept = { renderer: createModelRenderer(viewer.gl), scene };
    kept.renderer.setModel(scene);
    skinnedFrames.delete(key);
  } else if (kept && kept.scene !== scene) {
    kept.renderer.setModel(scene);
    kept.scene = scene;
    skinnedFrames.delete(key);
  }
  if (kept) {
    renderers.delete(key);
    renderers.set(key, kept);
  }
  return kept?.renderer;
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
  holdsLastFrame = false,
): PosedPart => {
  const frame = !clip
    ? NO_CLIP
    : holdsLastFrame
      ? Math.max(0, clip.animation.frameCount - 1)
      : getFrame(clip.animation, seconds);
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

const isPartLoading = (part: ComposedPart) =>
  (!!part.model && findModel(getPartModelKey(part)) === undefined) ||
  (!!part.animation && findClip(part.animation) === undefined);

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

const hasEmptyMain = () =>
  !viewer.getModel()?.meshes.some((mesh) => !mesh.hidden && !mesh.pickProxy);

const framePlaced = (placed: readonly { id: string; at: Matrix4; scene: ModelScene }[]) => {
  const key = placed.map(({ id }) => id).join('|');

  if (!key || key === framedParts) {
    return;
  }
  framedParts = key;

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (const { at, scene } of placed) {
    for (let corner = 0; corner < 8; corner++) {
      const local = [0, 1, 2].map(
        (axis) => (corner & (1 << axis) ? scene.bounds.max : scene.bounds.min)[axis],
      );

      for (let axis = 0; axis < 3; axis++) {
        const value =
          at[axis] * local[0] + at[axis + 4] * local[1] + at[axis + 8] * local[2] + at[axis + 12];

        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
  }

  const centre = min.map((value, axis) => (value + max[axis]) / 2) as Vec3;

  viewer.orbit.frame(
    centre,
    Math.max(1, Math.hypot(...min.map((value, axis) => max[axis] - value)) / 2),
  );
};

export interface DrawnPart {
  part: ComposedPart;
  at: Matrix4;
  bounds: ModelScene['bounds'] | undefined;
  drawShadow(matrix: Matrix4): void;
}

let drawnParts: DrawnPart[] = [];
let placedParts = new Map<string | undefined, PlacedModel>();

export const getPartBonePoint = (part: string, bone: string | undefined) => {
  const placed = placedParts.get(part);

  return placed && getPlacedBonePoint(placed, bone);
};

const listPartEffects = (): ListedEffect[] =>
  listDrawnParts().flatMap(({ id, object, draw, effects }) =>
    (effects ?? []).map((effect) => ({
      ...effect,
      part: id,
      detail: `${effect.detail}, of ${object ?? draw ?? 'a part'}`,
    })),
  );

export const getPlacedParts = (): readonly DrawnPart[] => drawnParts;

const drawParts = ({ matrix, basis }: ViewerCamera) => {
  const shown = listDrawnParts();

  drawnParts = [];
  placedParts = new Map();
  if (!shown.length || !viewer.gl) {
    return;
  }

  const root: PlacedModel = {
    matrix: toTranslation(getModelOrigin()),
    skeleton: viewer.getModel()?.skeleton,
    pose: viewer.getPose(),
  };
  const placed = new Map<string | undefined, PlacedModel>([[undefined, root]]);

  placedParts = placed;
  const seconds = viewer.getTime();
  const light = basis.forward.map((axis) => -axis) as Vec3;
  const framed: { id: string; at: Matrix4; scene: ModelScene }[] = [];

  for (const part of [...shown.filter((each) => !each.isFloor), ...shown.filter((each) => each.isFloor)]) {
    const owner = placed.get(part.parent);

    requestModel(part);
    if (part.animation) {
      requestAnimation(part.animation);
    }

    const isWaiting = isPartLoading(part);
    const look = (isWaiting && lastDrawn.get(part.id)) || part;
    const scene = requestModel(look);
    const clip = look.animation ? requestAnimation(look.animation) : undefined;

    if (!isWaiting) {
      lastDrawn.set(part.id, part);
    }
    const earlier = (earlierDraws.get(part.id) ?? [])
      .filter((each) => !isMainDraw(each))
      .flatMap((each) => placed.get(each.id)?.skeleton ?? requestModel(each)?.skeleton ?? []);
    const at = owner && placePart(part.placement, owner, earlier);

    if (!at) {
      continue;
    }

    const skeleton = scene?.skeleton;
    const key = getRendererKey(look, !!clip);
    const { frame, pose } = getPosedPart(key, skeleton, clip, seconds, look.holdsLastFrame);

    placed.set(part.id, { matrix: at, skeleton, pose });
    if (scene) {
      framed.push({ id: part.id, at, scene });
    }

    const renderer = scene && !isPartLoading(look) && getRenderer(key, scene);
    const inverse = invertAffine(at);

    if (!renderer || !inverse) {
      continue;
    }
    if (skinnedFrames.get(key) !== frame) {
      renderer.setPose(pose);
      skinnedFrames.set(key, frame);
    }
    const overrides = meshSwitches.get(getSwitchKey(groupKeys.get(part.id) ?? '', part));

    drawnParts.push({
      part,
      at,
      bounds: scene?.bounds,
      drawShadow: (onGround) =>
        renderer.drawShadow(onGround, {
          heightPlane: getHeightPlane(at),
          subObjectRules: look.subObjectRules,
          partOverrides: overrides,
        }),
    });
    renderer.draw(multiplyMatrices(Array.from(matrix), at), {
      light: toLocalDirection(inverse, light),
      showBones: false,
      ...viewer.getDrawLook(),
      isFloor: part.isFloor,
      subObjectRules: look.subObjectRules,
      partOverrides: overrides,
      seconds,
      camera: {
        eye: toLocalPoint(inverse, basis.eye),
        up: toLocalDirection(inverse, [0, 0, 1]),
        rotation: [0, 1, 2].flatMap((column) => {
          const axis = [at[column * 4], at[column * 4 + 1], at[column * 4 + 2]];
          const project = (direction: Vec3) =>
            axis[0] * direction[0] + axis[1] * direction[1] + axis[2] * direction[2];

          return [project(basis.right), project(basis.up), -project(basis.forward)];
        }),
      },
    });
  }
  if (hasEmptyMain() && !shown.some((part) => part.model && findModel(getPartModelKey(part)) === undefined)) {
    framePlaced(framed);
  }
};

const createCheckbox = (checked: boolean, key: string, change: (on: boolean) => void) => {
  const box = element('input');

  box.type = 'checkbox';
  box.checked = checked;

  box.dataset.key = key;
  box.onchange = () => change(box.checked);
  return box;
};

const createToggle = (
  text: string,
  checked: boolean,
  key: string,
  change: (on: boolean) => void,
) => {
  const label = element('label');

  label.append(createCheckbox(checked, key, change), ` ${text}`);
  return label;
};

const describePlacement = ({ placement }: ComposedPart) => {
  switch (placement.kind) {
    case 'passengerBone':
    case 'spawnPoint':
      return `on ${placement.prefix}${String(placement.slot + 1).padStart(2, '0')}`;
    case 'slot':
      return `in the slot at ${placement.x}, ${placement.y}`;
    case 'attachBone':
      return `on ${placement.bone}`;
    case 'offset':
      return `at ${placement.x}, ${placement.y}, ${placement.z}`;
    case 'origin':
      return 'at the origin';
  }
};

const describeBinding = ({ binding }: ComposedPart, previewed: string) => {
  const added = binding?.addedBy;
  const nameUpgrade = (name: string) => removeObjectPrefix(describeUpgrade(name), previewed);
  const names = [
    ...(added?.give ?? []).map(nameUpgrade),
    ...(added?.hold ?? []).map(describeCondition),
    ...(added?.level === undefined ? [] : [`level ${added.level + 1}`]),
  ];
  const needs = (binding?.needs ?? []).map(nameUpgrade);

  return names.length
    ? `with ${names.join(' and ')}${needs.length ? `, needs ${needs.join(' and ')}` : ''}`
    : '';
};

export const holdParts = (): void => {
  for (const part of composition.parts) {
    composition.switched.set(part.id, isPartOn(part));
  }
};

const switchParts = (parts: readonly ComposedPart[], on: boolean) => {
  const changes = listOwnChanges(
    parts.flatMap((part) => (on ? part.binding?.show : part.binding?.hide) ?? []),
    composition.parts.flatMap((part) =>
      !parts.includes(part) && isPartOn(part) ? (part.binding?.hide ?? []) : [],
    ),
  );

  parts.forEach((part) => composition.switched.set(part.id, on));
  if (changes.length) {
    holdParts();
  }
  renderComposition();
  changeBoundAppearance(changes);
};

const renderSubObjects = (group: PartGroup) => {
  const [first] = group.parts;
  const loaded = first.model ? findModel(getPartModelKey(first)) : null;

  if (!loaded) {
    const isAsked = loaded === undefined && isPartOn(first);

    return [
      element('div', isAsked ? 'Sub-objects: the model is loading' : '', 'muted'),
    ];
  }

  const switchKey = getSwitchKey(group.key, first);
  const switches = meshSwitches.get(switchKey) ?? new Map<number, boolean>();
  const hiding = findHidingSources(loaded.meshes, first.subObjectRules, loaded.skeleton?.parents);

  meshSwitches.set(switchKey, switches);
  return [
    element('div', `Sub-objects of ${first.model}`, 'muted'),
    ...loaded.meshes.map((mesh, at) => {
      const row = element('div', undefined, 'row composition-sub');

      row.append(
        createToggle(
          `${mesh.name}${hiding[at] ? ` (off by ${hiding[at]})` : ''}`,
          switches.get(at) ?? !hiding[at],
          `${switchKey}#${at}`,
          (on) => {
            const bound = first.subObjectSwitches ?? [];
            const others = loaded.meshes.filter(
              (_, other) => other !== at && (switches.get(other) ?? !hiding[other]),
            );
            const changes = listOwnChanges(
              listSwitchChanges(bound.filter((each) => isSubObjectNamed(mesh, each.pattern)), on),
              bound.flatMap((each) =>
                each.hide && others.some((other) => isSubObjectNamed(other, each.pattern))
                  ? [each.hide]
                  : [],
              ),
            );

            switches.set(at, on);
            if (changes.length) {
              holdParts();
              loaded.meshes.forEach((_, other) =>
                switches.set(other, switches.get(other) ?? !hiding[other]),
              );
            }
            changeBoundAppearance(changes);
          },
        ),
      );
      return row;
    }),
  ];
};

const isSameOption = (a: PartStateOption, b: PartStateOption) =>
  a.title === b.title && a.conditions.join(' ') === b.conditions.join(' ');

const postStatePicks = () =>
  post({
    kind: 'setPartStates',
    states: Object.fromEntries([...statePicks].map(([key, option]) => [key, option.conditions])),
  });

const renderStatePicker = (group: PartGroup) => {
  const options = composition.partStates[group.key];

  if (!options) {
    return [];
  }

  const row = element('label', undefined, 'row composition-part');
  const select = element('select');
  const folds = new Map<string, HTMLOptGroupElement>();
  const picked = statePicks.get(group.key);

  select.dataset.key = `${group.key}#state`;
  select.append(new Option('As it stands', ''));
  options.forEach((option, at) => {
    let fold = folds.get(option.group);

    if (!fold) {
      fold = element('optgroup');
      fold.label = option.group;
      folds.set(option.group, fold);
      select.append(fold);
    }
    fold.append(new Option(option.title, String(at)));
  });

  const at = picked ? options.findIndex((option) => isSameOption(option, picked)) : -1;

  select.value = at < 0 ? '' : String(at);
  select.onchange = () => {
    const option = options[Number(select.value)];

    if (select.value === '' || !option) {
      statePicks.delete(group.key);
    } else {
      statePicks.set(group.key, option);
    }
    postStatePicks();
  };
  row.title = 'The state its parts are shown in, held beside what they hold as they stand';
  row.append('State ', select);
  return [row];
};

const renderGroup = (group: PartGroup, depth: number, previewed: string) => {
  const on = group.parts.filter(isPartOn).length;
  const count = group.parts.length;
  const [first] = group.parts;
  const label = describePartGroup(group, previewed);
  const addedBy = [...new Set(group.parts.map((part) => describeBinding(part, previewed)))].filter(Boolean);
  const missing =
    first.model && findModel(getPartModelKey(first)) === null ? ' (model not found)' : '';
  const title = `${count > 1 ? `${count} × ` : ''}${label.title}${missing}`;
  const { root, members, box } = createDisclosureRow({
    text: [
      title,
      ...(addedBy.length === 1 ? [element('span', addedBy[0], 'composition-binding')] : []),
      element('span', label.detail, 'muted composition-source'),
    ],
    name: `Show the parts of ${title}`,
    isOpen: openGroups.has(group.key),
    key: group.key,
    onToggleOpen: (isOpen) => {
      if (isOpen) {
        openGroups.add(group.key);
      } else {
        openGroups.delete(group.key);
      }
    },
    onSwitch: (checked) => switchParts(group.parts, checked),
  });

  Object.assign(box, getGroupCheckState(on, count));
  root.classList.add('composition-group');
  root.style.marginLeft = `${depth}em`;
  root.title = [group.name, group.source, first.note].filter(Boolean).join('\n');
  members.append(
    ...renderStatePicker(group),
    ...(count > 1
      ? group.parts.map((part, at) => {
          const row = element('div', undefined, 'row composition-part');

          row.append(
            createToggle(
              [
                `#${at + 1} ${describePlacement(part)}`,
                addedBy.length > 1 ? describeBinding(part, previewed) : '',
              ]
                .filter(Boolean)
                .join(', '),
              isPartOn(part),
              `${group.key}/${part.id}`,
              (checked) => switchParts([part], checked),
            ),
          );
          return row;
        })
      : []),
    ...renderSubObjects(group),
  );
  return root;
};

const renderComposition = () => {
  const list = $('objectComposition');

  showPartEffects(listPartEffects());
  const parts = composition.parts.filter((part) => !isMainDraw(part));
  const groups = groupComposedParts(parts);
  const depths = new Map<string, number>();

  groupKeys.clear();
  for (const group of groups) {
    group.parts.forEach((part) => groupKeys.set(part.id, group.key));
  }
  const { notes } = composition;
  const focused = (document.activeElement as HTMLElement | null)?.dataset.key;
  const roles = new Map<string, PartRole>();
  const rows = new Map<PartRole, HTMLElement[]>(ROLE_TITLES.map(([role]) => [role, []]));

  const previewed = composition.parts.find((part) => part.parent === undefined)?.source.owner ?? '';

  for (const group of groups) {
    const { parent, key, parts: members } = group;
    const depth = parent === undefined ? 0 : (depths.get(parent) ?? 0) + 1;
    const role =
      (parent === undefined ? members[0].binding?.role : roles.get(parent)) ?? 'always';

    depths.set(key, depth);
    roles.set(key, role);
    rows.get(role)!.push(renderGroup(group, depth, previewed));
  }

  const isTitled = !!(rows.get('upgrade')!.length || rows.get('state')!.length);

  $('objectCompositionSection').hidden = !parts.length && !notes.length;
  $('objectCompositionCount').textContent = parts.length ? String(parts.length) : '';
  list.replaceChildren(
    ...(parts.length
      ? [
          createToggle(
            `Draw the composition: ${parts.length} part${parts.length === 1 ? '' : 's'}`,
            composition.isShown,
            'all',
            (on) => {
              composition.isShown = on;
            },
          ),
        ]
      : []),
    ...ROLE_TITLES.flatMap(([role, title]) => {
      const listed = rows.get(role)!;

      return isTitled && listed.length
        ? [element('div', title, 'viewer-part-group'), ...listed]
        : listed;
    }),
    ...notes.map((note) => element('div', note, 'muted')),
  );
  if (focused !== undefined) {
    [...list.querySelectorAll<HTMLElement>('[data-key]')]
      .find((box) => box.dataset.key === focused)
      ?.focus();
  }
};

const followChanges = (next: readonly ComposedPart[]) => {
  const changed = new Map<string, Set<number>>();

  next.forEach((part, at) => {
    const before = composition.parts[at];

    if (part.isShown !== before.isShown) {
      composition.switched.delete(part.id);
    }

    const key = getSwitchKey(groupKeys.get(part.id) ?? '', part);
    const loaded = before.model ? findModel(getPartModelKey(before)) : undefined;

    if (
      !meshSwitches.get(key)?.size ||
      !loaded ||
      part.model !== before.model
    ) {
      return;
    }

    const parents = loaded.skeleton?.parents;
    const was = findHidingSources(loaded.meshes, before.subObjectRules, parents);
    const is = findHidingSources(loaded.meshes, part.subObjectRules, parents);
    const meshes = changed.get(key) ?? new Set<number>();

    is.forEach((hidden, mesh) => {
      if (!hidden !== !was[mesh]) {
        meshes.add(mesh);
      }
    });
    changed.set(key, meshes);
  });
  for (const [key, meshes] of changed) {
    meshes.forEach((mesh) => meshSwitches.get(key)?.delete(mesh));
  }
};

const releaseUnused = (parts: readonly ComposedPart[]): void => {
  const keys = new Set(
    parts.flatMap((part) => [getRendererKey(part, !!part.animation), getRendererKey(part, false)]),
  );

  for (const [key, { renderer }] of renderers) {
    if (renderers.size <= MAX_RENDERERS) {
      break;
    }
    if (!keys.has(key)) {
      renderer.setModel(undefined);
      renderers.delete(key);
      posedParts.delete(key);
      skinnedFrames.delete(key);
    }
  }
};

export const showComposition = (next: ObjectComposition): void => {
  const isSameObject =
    next.parts.length === composition.parts.length &&
    next.parts.every((part, at) => part.id === composition.parts[at].id);

  if (isSameObject && isFollowingAppearance()) {
    followChanges(next.parts);
  }
  releaseUnused(next.parts);

  composition.parts = next.parts;
  composition.notes = next.notes;
  composition.partStates = next.partStates ?? {};
  earlierDraws = listEarlierDraws(next.parts);
  offerDetail('partsHave', next.parts.some((part) => part.hasDetailModels));
  setComposedOptions(next.appearance);
  if (!isSameObject) {
    composition.switched.clear();
    lastDrawn.clear();
    framedParts = '';
    openGroups.clear();
    meshSwitches.clear();
  }
  renderComposition();
};

export const setShownDraw = (draw: string | undefined): void => {
  if (draw === composition.shownDraw) {
    return;
  }
  composition.shownDraw = draw;
  renderComposition();
};

const describeLoaded = () =>
  composition.parts
    .map((part) => {
      const found = part.model ? findModel(getPartModelKey(part)) : null;

      return found === undefined ? '?' : found ? '+' : '-';
    })
    .join('');
let listedLoaded = '';

viewer.addLayer({ draw: drawParts });
onStoreChanged(() => {
  const loaded = describeLoaded();

  if (loaded !== listedLoaded) {
    listedLoaded = loaded;
    renderComposition();
  }
});
onDetailPicked(() => {
  releaseUnused(composition.parts);
  renderComposition();
});
