import type { FixedSet, NamedRule, ParameterRule } from './suggestionKinds';

const set = (
  id: string,
  values: readonly string[],
  isPartial = false,
): FixedSet => ({
  id,
  options: values.map((value) => ({ value })),
  isPartial,
});

const SHOW_HIDE = set('showHide', ['_show', '_hide']);
const SLOT_STATES = set('slotStates', ['_empty', '_selected', '_up']);
const POWER_STATES = set('powerStates', [
  '_unused',
  '_avail',
  '_needPrereq',
  '_levelLow',
  '_selected',
  '_palantirFull',
]);
const SCREEN_MODES = set('screenModes', [
  'OtherSingle',
  'OtherOnlineLan',
  'WOTRSingle',
  'WOTROnlineLan',
]);
const SAVE_LOAD_MODES = set('saveLoadModes', ['Save', 'Load']);
const GAME_TYPES = set('gameTypes', [
  'Campaign',
  'Skirmish',
  'Replay',
  'WOTRSP',
  'WOTRMP',
]);
const BOOLEANS = set('booleans', ['true', 'false']);

const ANIMATION_MODES: FixedSet = {
  id: 'animationModes',
  options: [
    { value: 'MANUAL' },
    { value: 'LOOP' },
    { value: 'PLAY_TO_FRAME' },
    { value: 'ONCE', label: 'held in the preview' },
    { value: 'LOOP_PINGPONG', label: 'held in the preview' },
    { value: 'LOOP_BACKWARDS', label: 'held in the preview' },
    { value: 'ONCE_BACKWARDS', label: 'held in the preview' },
  ],
};

export const FIXED_PARAMETER_RULES: readonly ParameterRule[] = [
  {
    call: /^UpdateSelectPowerIcon$/i,
    parameter: /^state$/i,
    fixed: POWER_STATES,
    basis: "mint binds the power cell's state to one of these frames",
  },
  {
    call: /^Set(InProgress|Queued)?IconSlotState$/i,
    parameter: /^state$/i,
    fixed: SLOT_STATES,
    basis: 'mint binds an icon slot as _empty, _selected or _up',
  },
  {
    call:
      /^Set(ArmyName|CommandPoints|MemberName|MemberRank|UnitName|BuildTime|BuildingName|UpgradeOverlay|IconSlotProgress|ResourceIcon|ButtonFlashEffect|FlashEffect|ButtonSelectedHighlight)State$/i,
    parameter: /^state$/i,
    fixed: SHOW_HIDE,
    basis: 'mint binds these as _show or _hide',
  },
];

export const FIXED_EXTERN_RULES: readonly NamedRule[] = [
  {
    name: /^TimeLine:ScreenMode$/i,
    fixed: SCREEN_MODES,
    basis: "mint binds the score screen's mode as one of these strings",
  },
  {
    name: /^SaveLoadMode$/i,
    fixed: SAVE_LOAD_MODES,
    basis: 'mint binds the save and load screen as Save or Load',
  },
  {
    name: /^CurrentGameType$/i,
    fixed: GAME_TYPES,
    basis:
      "the movie tests these names; mint's save list uses the same ones",
  },
  {
    name: /^(InGame|AptMpGameRules::Show(Chat|Clans)|CampaignMenu:Victorious|TimeLine:(LocalPlayerIsObserver|ShowSaveReplay|StrategicEnd))$/i,
    fixed: BOOLEANS,
    basis: 'mint binds a true or false value',
  },
];

export const FIXED_BINDING_RULES: readonly NamedRule[] = [
  {
    name: /^_AnimMode$/,
    fixed: ANIMATION_MODES,
    basis: "the animation modes in mint's enum",
  },
];
