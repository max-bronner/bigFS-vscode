import type { Vec3 } from '../../formats/w3d/w3dPose';
import type { ListedEffect, StateEffects } from '../../game/objects/listStateEffects';
import { createDisclosureRow, getGroupCheckState } from '../shared/createDisclosureRow';
import { element } from '../shared/element';
import { createEffectSwitches } from './effectSwitches';
import { groupEffects } from './groupEffects';
import type { EffectGroup } from './groupEffects';
import { $, viewer } from './page';

export interface Effect {
  kind: 'fxList' | 'system';
  name: string;
  bone?: string;
  frame?: number;
  part?: string;
  offset?: Vec3;
  delay?: number;
}

const switches = createEffectSwitches();
let objectEffects: StateEffects = { playing: [], others: [] };
let lastFocus: { fx?: string; system?: string } = {};
let partEffects: ListedEffect[] = [];
let partEffectsKey = '';
const opened = new Set<string>();

const getEffectKey = ({ part, kind, name, bone, frame }: ListedEffect) =>
  `${part ?? ''}|${kind}|${name}|${bone ?? ''}|${frame ?? ''}`;

const switchEffects = (effects: readonly ListedEffect[], on: boolean) => {
  effects.forEach((effect) => switches.pick(effect, on));
  renderEffects();
  viewer.restart();
};

const createRow = (effect: ListedEffect, detail = effect.detail) => {
  const row = element('label', undefined, 'effect');
  const box = element('input');
  const text = element('span', undefined, 'effect-text');

  box.type = 'checkbox';
  box.checked = switches.isOn(effect);
  box.dataset.key = getEffectKey(effect);
  box.onchange = () => switchEffects([effect], box.checked);
  text.append(element('span', effect.name), element('span', detail, 'effect-detail'));
  row.append(box, text);
  return row;
};

const createGroupRow = ({ effects, detail }: EffectGroup) => {
  if (effects.length === 1) {
    return createRow(effects[0], detail);
  }

  const [first] = effects;
  const key = `group|${getEffectKey({ ...first, bone: detail })}`;
  const name = element('span', `${first.name} `);
  const text = element('span', undefined, 'effect-text');
  const { root, members, box } = createDisclosureRow({
    text: [text],
    name: `Show ${first.name} on each of its ${effects.length} bones`,
    isOpen: opened.has(key),
    key,
    onToggleOpen: (isOpen) => (isOpen ? opened.add(key) : opened.delete(key)),
    onSwitch: (on) => switchEffects(effects, on),
  });

  Object.assign(box, getGroupCheckState(effects.filter(switches.isOn).length, effects.length));
  box.title = `Switch it on all ${effects.length} bones; the arrow shows each bone`;
  name.append(element('span', `× ${effects.length}`, 'effect-count'));
  text.append(name, element('span', detail, 'effect-detail'));
  root.classList.add('effect-group');
  members.append(
    ...effects.map((effect) => createRow(effect, effect.bone ? `on ${effect.bone}` : effect.detail)),
  );
  return root;
};

export const showEffects = (
  effects: StateEffects,
  focus: { fx?: string; system?: string } = {},
): void => {
  objectEffects = effects;
  lastFocus = focus;
  renderEffects();
};

export const showPartEffects = (effects: readonly ListedEffect[]): void => {
  const key = effects.map((each) => `${each.part}|${each.kind}|${each.name}|${each.bone}|${each.frame}`).join(',');

  if (key === partEffectsKey) {
    return;
  }
  partEffectsKey = key;
  partEffects = [...effects];
  renderEffects();
  viewer.restart();
};

const renderEffects = () => {
  const { others } = objectEffects;
  const playing = [...objectEffects.playing, ...partEffects];
  const focus = lastFocus;

  switches.list(
    playing,
    others.flatMap(({ effects }) => effects),
    focus.fx ?? focus.system,
  );

  const waiting = others.reduce((sum, { effects }) => sum + effects.length, 0);
  const rest = element('details', undefined, 'effect-rest');
  const focused = (document.activeElement as HTMLElement | null)?.dataset.key;
  const list = $('objectElements');

  rest.open = opened.has('') || others.some(({ effects }) => effects.some(switches.isOn));
  rest.ontoggle = () => (rest.open ? opened.add('') : opened.delete(''));
  rest.append(
    element('summary', `On other occasions (${waiting})`),
    ...others.map(({ title, effects }) => {
      const group = element('details', undefined, 'effect-occasion');

      group.open = opened.has(title) || effects.some(switches.isOn);
      group.ontoggle = () => (group.open ? opened.add(title) : opened.delete(title));
      group.append(
        element('summary', `${title} (${effects.length})`),
        ...groupEffects(effects).map(createGroupRow),
      );
      return group;
    }),
  );

  const onCount = switches.getOn().length;

  $('objectEffectsSection').hidden = !playing.length && !others.length;
  $('objectEffectsCount').textContent = onCount ? `${onCount} on` : '';
  list.replaceChildren(
    ...(playing.length
      ? groupEffects(playing).map(createGroupRow)
      : [element('div', 'No effect plays in this state', 'muted')]),
    ...(others.length ? [rest] : []),
  );
  if (focused !== undefined) {
    [...list.querySelectorAll<HTMLElement>('[data-key]')]
      .find((box) => box.dataset.key === focused)
      ?.focus();
  }
};

export const listEnabledEffects = (): Effect[] =>
  switches.getOn().map(({ kind, name, bone, frame, part }) => ({ kind, name, bone, frame, part }));
