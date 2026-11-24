import { DEFAULT_HOUSE_COLOUR } from '../../../formats/w3d/w3dHouseColour';
import type { PlayerColour } from '../../../formats/w3d/w3dHouseColour';
import type { Rgb } from '../../../formats/w3d/w3dMaterialChunks';
import { element } from '../element';
import type { SettingsSection } from '../createPreviewSettings';
import type { ViewerModel } from './describeModel';
import { SKIES } from './viewerSettings';
import type { ViewerSettings } from './viewerSettings';

const CUSTOM_SKY = 'custom';
const NO_HOUSE_COLOUR = 'none';
const CUSTOM_HOUSE_COLOUR = 'custom';

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
  settings: SettingsSection<ViewerSettings>,
): ViewControls => {
  const kept = settings.values;
  const choices: ViewChoices = {
    showBones: false,
    showBoneNames: kept.boneNames,
    showMeshes: kept.meshes,
    showTextures: kept.textures,
    houseColour: DEFAULT_HOUSE_COLOUR,
    showBoxes: kept.boxes,
    showGrid: kept.grid,
    lod: undefined,
    sky: kept.sky.toLowerCase(),
  };
  const bones = pressedButton(
    'Bones',
    'Bones (B): show the skeleton, attachment points in blue; hover a joint for its name',
    false,
  );
  const names = pressedButton(
    'Bone names',
    'Name every bone beside its joint, not only the one under the pointer',
    choices.showBoneNames,
  );
  const model = pressedButton('Model', 'Draw the meshes', choices.showMeshes);
  const textures = pressedButton(
    'Textures',
    'Draw the textures; off, every part is one plain colour',
    choices.showTextures,
  );
  const house = element('select');
  const customHouse = element('input');
  const boxes = pressedButton('Boxes', 'Draw the collision boxes as wireframes', choices.showBoxes);
  const grid = pressedButton('Grid', 'Draw the ground grid', choices.showGrid);
  const levels = element('select');
  const sky = element('select');
  const customSky = element('input');
  let boxCount = 0;
  let pickedBones = kept.bones ?? undefined;
  let pickedLevel = kept.lod ?? undefined;

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
    keptAs?: 'boneNames' | 'meshes' | 'textures' | 'boxes' | 'grid',
  ) => {
    const flip = () => {
      choices[key] = !choices[key];
      button.setAttribute('aria-pressed', String(choices[key]));
      if (keptAs) {
        settings.set(keptAs, choices[key]);
      }
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
    settings.set('bones', pickedBones);
  };

  bones.onclick = pickBones;

  const toggleNames = toggle(
    names,
    'showBoneNames',
    (on) => `bone names ${on ? 'shown' : 'on hover'}`,
    'boneNames',
  );

  names.onclick = () => {
    toggleNames();
    if (choices.showBoneNames && !choices.showBones) {
      pickBones();
    }
  };
  toggle(model, 'showMeshes', (on) => `model ${on ? 'shown' : 'hidden'}`, 'meshes');
  toggle(textures, 'showTextures', (on) => `textures ${on ? 'shown' : 'off'}`, 'textures');

  let playerColours: PlayerColour[] = [];
  const setHouseColour = (colour: Rgb | null, label: string) => {
    choices.houseColour = colour;
    onChange(`house colour ${label}`);
  };

  const setPlayerColours = (next: PlayerColour[]) => {
    const picked = kept.house;

    playerColours = next.length ? next : [{ name: 'Blue', colour: DEFAULT_HOUSE_COLOUR }];
    house.replaceChildren(
      new Option('No house colour', NO_HOUSE_COLOUR),
      ...playerColours.map(({ name }, at) => new Option(`House: ${name}`, String(at))),
      new Option('House: custom…', CUSTOM_HOUSE_COLOUR),
    );
    house.value = [...house.options].some((option) => option.value === picked) ? picked : '0';
    if (house.value === NO_HOUSE_COLOUR) {
      choices.houseColour = null;
    } else if (house.value === CUSTOM_HOUSE_COLOUR) {
      customHouse.value = kept.customHouse ?? toHex(DEFAULT_HOUSE_COLOUR);
      choices.houseColour = fromHex(customHouse.value);
    } else {
      choices.houseColour = playerColours[Number(house.value)].colour;
    }
  };

  house.onchange = () => {
    const isCustom = house.value === CUSTOM_HOUSE_COLOUR;

    customHouse.hidden = !isCustom;
    settings.set('house', house.value);
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
  customHouse.onchange = () => settings.set('customHouse', customHouse.value);
  setPlayerColours([]);
  toggle(boxes, 'showBoxes', (on) => `boxes ${on ? 'shown' : 'hidden'} (${boxCount})`, 'boxes');
  toggle(grid, 'showGrid', (on) => `grid ${on ? 'shown' : 'hidden'}`, 'grid');
  levels.onchange = () => {
    choices.lod = Number(levels.value);
    pickedLevel = choices.lod;
    settings.set('lod', pickedLevel);
    onChange(`LOD ${choices.lod}`);
  };
  const setSky = (colour: string) => {
    choices.sky = colour;
    onChange('');
  };

  sky.onchange = () => {
    const isCustom = sky.value === CUSTOM_SKY;

    customSky.hidden = !isCustom;
    if (!isCustom) {
      setSky(sky.value);
      settings.set('sky', sky.value);
      return;
    }
    customSky.value = choices.sky;
    try {
      customSky.showPicker();
    } catch {
    }
  };
  customSky.oninput = () => setSky(customSky.value);
  customSky.onchange = () => settings.set('sky', customSky.value);

  const isListedSky = SKIES.some(([, value]) => value === choices.sky);

  sky.value = isListedSky ? choices.sky : CUSTOM_SKY;
  customSky.value = choices.sky;
  customSky.hidden = isListedSky;

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
