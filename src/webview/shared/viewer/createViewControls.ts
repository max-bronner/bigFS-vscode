import { DEFAULT_HOUSE_COLOUR } from '../../../formats/w3d/w3dHouseColour';
import type { PlayerColour } from '../../../formats/w3d/w3dHouseColour';
import type { Rgb } from '../../../formats/w3d/w3dMaterialChunks';
import { element } from '../element';
import type { ViewerModel } from './describeModel';

const SKIES: [string, string][] = [
  ['dark', '#1b1c1f'],
  ['day', '#7a8ea6'],
  ['black', '#000000'],
  ['light', '#c8c8c8'],
];
const CUSTOM_SKY = 'custom';
const NO_HOUSE_COLOUR = 'none';
const CUSTOM_HOUSE_COLOUR = 'custom';
const COLOUR = /^#[0-9a-f]{6}$/i;

export interface ViewChoices {
  showBones: boolean;
  showBoneNames: boolean;
  showMeshes: boolean;
  showTextures: boolean;
  houseColour: Rgb | null;
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
  basicControls: HTMLElement[];
  settingsControls: HTMLElement[];
  choices: ViewChoices;
  setModel(model: ViewerModel | undefined, showsBareSkeleton?: boolean): void;
  toggleBones(): void;
}

const pressedButton = (text: string, title: string, pressed: boolean) => {
  const button = element('button', text);

  button.title = title;
  button.setAttribute('aria-pressed', String(pressed));
  return button;
};

const toHex = (colour: Rgb) =>
  `#${colour.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;

const fromHex = (hex: string): Rgb =>
  [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as Rgb;

const hasHouseColour = (model: ViewerModel | undefined) =>
  !!model?.meshes.some((mesh) => mesh.draws?.some((draw) => draw.houseMask !== undefined));

const describeLevel = (
  { meshes, maxScreenSize }: { meshes: unknown[]; maxScreenSize?: number },
  at: number,
) =>
  `LOD ${at}: ${meshes.length} meshes, ${
    maxScreenSize === undefined ? 'finest' : `max screen size ${maxScreenSize}`
  }`;

export const isShowingBones = (
  picked: boolean | undefined,
  model: ViewerModel | undefined,
  showsBareSkeleton: boolean,
): boolean => picked ?? (showsBareSkeleton && !!model?.skeleton && !model.meshes.length);

export const getKeptLevel = (levelCount: number, picked: number | undefined): number | undefined =>
  levelCount > 1 && picked !== undefined && picked < levelCount ? picked : undefined;

export const createViewControls = (
  onChange: (status: string) => void,
  skyMemory: SkyMemory = {},
): ViewControls => {
  const choices: ViewChoices = {
    showBones: false,
    showBoneNames: false,
    showMeshes: true,
    showTextures: true,
    houseColour: DEFAULT_HOUSE_COLOUR,
    showBoxes: false,
    showGrid: true,
    lod: undefined,
    sky: SKIES[0][1],
  };
  const bones = pressedButton(
    'Bones',
    'Bones (B): show the skeleton, attachment points in blue; hover a joint for its name',
    false,
  );
  const names = pressedButton('Bone names', 'Name every bone beside its joint, not only the one under the pointer', false);
  const model = pressedButton('Model', 'Draw the meshes', true);
  const textures = pressedButton('Textures', 'Draw the textures; off, every part is one plain colour', true);
  const house = element('select');
  const customHouse = element('input');
  const boxes = pressedButton('Boxes', 'Draw the collision boxes as wireframes', false);
  const grid = pressedButton('Grid', 'Draw the ground grid', true);
  const levels = element('select');
  const sky = element('select');
  const customSky = element('input');
  let boxCount = 0;
  let pickedBones: boolean | undefined;
  let pickedLevel: number | undefined;

  levels.title = 'HLOD level of detail';
  sky.title = 'Background colour of the view';
  sky.append(
    ...SKIES.map(([label, value]) => new Option(`Background: ${label}`, value)),
    new Option('Background: custom…', CUSTOM_SKY),
  );
  customSky.type = 'color';
  customSky.title = 'Background colour';
  customSky.hidden = true;
  house.title = 'House colour: the player colour house-coloured parts take';
  customHouse.type = 'color';
  customHouse.title = 'House colour';
  customHouse.hidden = true;
  house.hidden = true;

  const toggle = (
    button: HTMLButtonElement,
    key:
      | 'showBones'
      | 'showBoneNames'
      | 'showMeshes'
      | 'showTextures'
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

  const pickBones = () => {
    toggleBones();
    pickedBones = choices.showBones;
  };

  bones.onclick = pickBones;

  const toggleNames = toggle(
    names,
    'showBoneNames',
    (on) => `bone names ${on ? 'shown' : 'on hover'}`,
  );

  names.onclick = () => {
    toggleNames();
    if (choices.showBoneNames && !choices.showBones) {
      pickBones();
    }
  };
  toggle(model, 'showMeshes', (on) => `model ${on ? 'shown' : 'hidden'}`);
  toggle(textures, 'showTextures', (on) => `textures ${on ? 'shown' : 'off'}`);

  let playerColours: PlayerColour[] = [];
  const setHouseColour = (colour: Rgb | null, label: string) => {
    choices.houseColour = colour;
    onChange(`house colour ${label}`);
  };

  const setPlayerColours = (next: PlayerColour[]) => {
    const picked = house.value;

    playerColours = next.length ? next : [{ name: 'Blue', colour: DEFAULT_HOUSE_COLOUR }];
    house.replaceChildren(
      new Option('No house colour', NO_HOUSE_COLOUR),
      ...playerColours.map(({ name }, at) => new Option(`House: ${name}`, String(at))),
      new Option('House: custom…', CUSTOM_HOUSE_COLOUR),
    );
    house.value = [...house.options].some((option) => option.value === picked) ? picked : '0';
    if (house.value === '0' && picked !== '0') {
      choices.houseColour = playerColours[0].colour;
    }
  };

  house.onchange = () => {
    const isCustom = house.value === CUSTOM_HOUSE_COLOUR;

    customHouse.hidden = !isCustom;
    if (house.value === NO_HOUSE_COLOUR) {
      setHouseColour(null, 'off');
    } else if (isCustom) {
      customHouse.value = toHex(choices.houseColour ?? DEFAULT_HOUSE_COLOUR);
      try {
        customHouse.showPicker();
      } catch {
      }
    } else {
      const { name, colour } = playerColours[Number(house.value)];

      setHouseColour(colour, name);
    }
  };
  customHouse.oninput = () => setHouseColour(fromHex(customHouse.value), customHouse.value);
  setPlayerColours([]);
  toggle(boxes, 'showBoxes', (on) => `boxes ${on ? 'shown' : 'hidden'} (${boxCount})`);
  toggle(grid, 'showGrid', (on) => `grid ${on ? 'shown' : 'hidden'}`);
  levels.onchange = () => {
    choices.lod = Number(levels.value);
    pickedLevel = choices.lod;
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
    const kept = getKeptLevel(lods.length, pickedLevel);

    levels.value = lods.length ? String(kept ?? lods.length - 1) : '';
    levels.hidden = lods.length < 2;
    choices.lod = kept;
  };

  setLevels([]);

  return {
    basicControls: [bones],
    settingsControls: [names, model, textures, boxes, grid, levels, house, customHouse, sky, customSky],
    choices,
    setModel: (shown, showsBareSkeleton = false) => {
      const meshes = shown?.meshes ?? [];

      boxCount = shown?.boxes.length ?? 0;
      bones.hidden = !shown?.skeleton;
      names.hidden = !shown?.skeleton;
      model.hidden = !meshes.length;
      textures.hidden = !meshes.length;
      house.hidden = !hasHouseColour(shown);
      customHouse.hidden = house.hidden || house.value !== CUSTOM_HOUSE_COLOUR;
      if (shown?.playerColours?.length) {
        setPlayerColours(shown.playerColours);
      }
      boxes.hidden = !boxCount;
      if (isShowingBones(pickedBones, shown, showsBareSkeleton) !== choices.showBones) {
        toggleBones();
      }
      setLevels(shown?.hlod?.lods ?? []);
    },
    toggleBones: pickBones,
  };
};
