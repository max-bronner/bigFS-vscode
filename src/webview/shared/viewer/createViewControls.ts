import { findHidingSources } from '../../../formats/w3d/w3dScene';
import type { SubObjectRule } from '../../../formats/w3d/w3dScene';
import { element } from '../element';
import type { ViewerModel } from './describeModel';

const SKIES: [string, string][] = [
  ['dark', '#1b1c1f'],
  ['day', '#7a8ea6'],
  ['black', '#000000'],
  ['light', '#c8c8c8'],
];
const CUSTOM_SKY = 'custom';
const COLOUR = /^#[0-9a-f]{6}$/i;

export interface ViewChoices {
  showBones: boolean;
  showBoneNames: boolean;
  showMeshes: boolean;
  showHidden: boolean;
  showBoxes: boolean;
  showGrid: boolean;
  lod: number | undefined;
  sky: string;
}

export interface SkyMemory {
  initial?: string;
  onChange?(sky: string): void;
}

export interface ViewControls {
  controls: HTMLElement[];
  choices: ViewChoices;
  setModel(model: ViewerModel | undefined, rules: readonly SubObjectRule[]): void;
  toggleBones(): void;
}

const pressedButton = (text: string, title: string, pressed: boolean) => {
  const button = element('button', text);

  button.title = title;
  button.setAttribute('aria-pressed', String(pressed));
  return button;
};

const describeLevel = (
  { meshes, maxScreenSize }: { meshes: unknown[]; maxScreenSize?: number },
  at: number,
) =>
  `LOD ${at}: ${meshes.length} meshes, ${
    maxScreenSize === undefined ? 'finest' : `max screen size ${maxScreenSize}`
  }`;

export const createViewControls = (
  onChange: (status: string) => void,
  skyMemory: SkyMemory = {},
): ViewControls => {
  const choices: ViewChoices = {
    showBones: false,
    showBoneNames: false,
    showMeshes: true,
    showHidden: false,
    showBoxes: false,
    showGrid: true,
    lod: undefined,
    sky: SKIES[0][1],
  };
  const bones = pressedButton(
    'Bones',
    'B: show the skeleton, attachment points in blue; hover a joint for its name',
    false,
  );
  const names = pressedButton('Names', 'Name every bone beside its joint', false);
  const model = pressedButton('Model', 'Draw the meshes', true);
  const hidden = pressedButton('Show hidden', 'Draw the meshes marked hidden', false);
  const boxes = pressedButton('Show boxes', 'Draw the collision boxes as wireframes', false);
  const grid = pressedButton('Grid', 'Draw the ground grid', true);
  const levels = element('select');
  const sky = element('select');
  const customSky = element('input');
  let hiddenCount = 0;
  let boxCount = 0;

  levels.title = 'HLOD level of detail';
  sky.title = 'Background';
  sky.append(
    ...SKIES.map(([label, value]) => new Option(label, value)),
    new Option('Custom…', CUSTOM_SKY),
  );
  customSky.type = 'color';
  customSky.title = 'Background colour';
  customSky.hidden = true;

  const toggle = (
    button: HTMLButtonElement,
    key:
      | 'showBones'
      | 'showBoneNames'
      | 'showMeshes'
      | 'showHidden'
      | 'showBoxes'
      | 'showGrid',
    describe: (on: boolean) => string,
  ) => {
    const flip = () => {
      choices[key] = !choices[key];
      button.setAttribute('aria-pressed', String(choices[key]));
      onChange(describe(choices[key]));
    };

    button.onclick = flip;
    return flip;
  };
  const toggleBones = toggle(
    bones,
    'showBones',
    (on) => `bones ${on ? 'shown' : 'hidden'}`,
  );

  const toggleNames = toggle(
    names,
    'showBoneNames',
    (on) => `bone names ${on ? 'shown' : 'on hover'}`,
  );

  names.onclick = () => {
    toggleNames();
    if (choices.showBoneNames && !choices.showBones) {
      toggleBones();
    }
  };
  toggle(model, 'showMeshes', (on) => `model ${on ? 'shown' : 'hidden'}`);
  toggle(
    hidden,
    'showHidden',
    (on) => `hidden meshes ${on ? 'shown' : 'not drawn'} (${hiddenCount})`,
  );
  toggle(boxes, 'showBoxes', (on) => `boxes ${on ? 'shown' : 'hidden'} (${boxCount})`);
  toggle(grid, 'showGrid', (on) => `grid ${on ? 'shown' : 'hidden'}`);
  levels.onchange = () => {
    choices.lod = Number(levels.value);
    onChange(`LOD ${choices.lod}`);
  };
  const setSky = (colour: string) => {
    choices.sky = colour;
    skyMemory.onChange?.(colour);
    onChange('');
  };

  sky.onchange = () => {
    const isCustom = sky.value === CUSTOM_SKY;

    customSky.hidden = !isCustom;
    if (!isCustom) {
      setSky(sky.value);
      return;
    }
    customSky.value = choices.sky;
    try {
      customSky.showPicker();
    } catch {
    }
  };
  customSky.oninput = () => setSky(customSky.value);

  const initialSky = skyMemory.initial;

  if (initialSky && COLOUR.test(initialSky)) {
    const isListed = SKIES.some(([, value]) => value === initialSky.toLowerCase());

    choices.sky = initialSky.toLowerCase();
    sky.value = isListed ? choices.sky : CUSTOM_SKY;
    customSky.value = choices.sky;
    customSky.hidden = isListed;
  }

  const setLevels = (lods: NonNullable<ViewerModel['hlod']>['lods']) => {
    levels.replaceChildren(
      ...(lods.length
        ? lods.map((lod, at) => new Option(describeLevel(lod, at), String(at)))
        : [new Option('LOD', '')]),
    );
    levels.value = lods.length ? String(lods.length - 1) : '';
    levels.disabled = lods.length < 2;
    choices.lod = undefined;
  };

  setLevels([]);

  return {
    controls: [bones, names, model, hidden, boxes, grid, levels, sky, customSky],
    choices,
    setModel: (shown, rules) => {
      const meshes = shown?.meshes ?? [];

      hiddenCount = findHidingSources(meshes, rules, shown?.skeleton?.parents).filter(
        Boolean,
      ).length;
      boxCount = shown?.boxes.length ?? 0;
      bones.hidden = !shown?.skeleton;
      names.hidden = !shown?.skeleton;
      model.disabled = !meshes.length;
      hidden.disabled = !hiddenCount;
      boxes.disabled = !boxCount;
      if (shown?.skeleton && !meshes.length && !choices.showBones) {
        toggleBones();
      }
      setLevels(shown?.hlod?.lods ?? []);
    },
    toggleBones,
  };
};
