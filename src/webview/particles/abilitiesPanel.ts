import type { AbilityEffect, AbilityGroup, AbilityPlace, ObjectAbility } from '../../game/objects/objectAbilities';
import { createSoundButton } from '../shared/createSoundButton';
import { element } from '../shared/element';
import { isAbilityPlaying, playAbility, stopAbility } from './abilityPlayback';
import { $, post } from './page';

const FILTERED_FROM = 8;
const PLACE_WORDS: Record<AbilityPlace, string> = {
  self: '',
  target: 'where it aims',
  flight: 'in flight',
};

let groups: AbilityGroup[] = [];
const folds = new Map<string, boolean>();
const opened = new Set<string>();

const getKey = (group: AbilityGroup, ability: ObjectAbility) =>
  `${group.title}|${ability.name}`.toLowerCase();

const describeEffect = ({ source, place, bone, delay, repeat }: AbilityEffect) =>
  [
    source,
    bone && `on ${bone}`,
    PLACE_WORDS[place],
    delay && `after ${delay} s`,
    repeat && `${repeat.count} more time${repeat.count === 1 ? '' : 's'} every ${repeat.every} s`,
  ]
    .filter(Boolean)
    .join(', ');

const createRow = (group: AbilityGroup, ability: ObjectAbility) => {
  const key = getKey(group, ability);
  const row = element('div', undefined, 'ability');
  const play = element('button', undefined, 'ability-play');
  const text = element('div', undefined, 'ability-text');
  const isPlaying = isAbilityPlaying(key);
  const canPlay = ability.effects.length > 0 || ability.phases.length > 0;

  play.textContent = isPlaying ? '■' : '▶';
  play.disabled = !canPlay;
  play.setAttribute('aria-pressed', String(isPlaying));
  play.title = canPlay
    ? isPlaying
      ? 'Stop it and go back to what was shown'
      : 'Play it once on the model, its animation and its effects'
    : 'It plays nothing the preview can show';
  play.onclick = () => {
    if (isAbilityPlaying(key)) {
      stopAbility();
    } else {
      playAbility(ability, key, renderAbilities);
    }
    renderAbilities();
  };

  const title = element('div', ability.title, 'ability-title');

  title.title = [ability.name, ability.description].filter(Boolean).join('\n\n');
  text.append(title, element('div', ability.trigger, 'muted ability-trigger'));
  if (ability.effects.length || ability.creates.length) {
    const details = element('details', undefined, 'ability-effects');

    details.open = opened.has(key);
    details.ontoggle = () => (details.open ? opened.add(key) : opened.delete(key));

    const counts = [
      ability.effects.length && `${ability.effects.length} effect${ability.effects.length === 1 ? '' : 's'}`,
      ability.creates.length && `creates ${ability.creates.join(', ')}`,
    ].filter(Boolean);

    details.append(
      element('summary', counts.join(' · ')),
      ...ability.effects.map((effect) => {
        const line = element('div', undefined, 'ability-effect');

        line.append(element('span', effect.name), element('span', describeEffect(effect), 'muted'));
        return line;
      }),
    );
    text.append(details);
  }
  for (const sound of ability.sounds) {
    const line = element('div', undefined, 'ability-sound');

    line.append(createSoundButton(sound, post), element('span', sound, 'muted'));
    text.append(line);
  }
  row.append(play, text);
  return row;
};

const isMatching = (ability: ObjectAbility, query: string) =>
  [ability.title, ability.name, ability.trigger, ...ability.effects.map((effect) => effect.name), ...ability.sounds]
    .join(' ')
    .toLowerCase()
    .includes(query);

const renderAbilities = () => {
  const filter = $<HTMLInputElement>('objectAbilityFilter');
  const query = filter.value.trim().toLowerCase();
  const shown = groups
    .map((group) => ({ group, abilities: group.abilities.filter((ability) => isMatching(ability, query)) }))
    .filter(({ abilities }) => abilities.length);

  $('objectAbilities').replaceChildren(
    ...shown.map(({ group, abilities }) => {
      const fold = element('details', undefined, 'ability-group');
      const summary = element('summary', group.title);

      fold.open =
        !!query ||
        abilities.some((ability) => isAbilityPlaying(getKey(group, ability))) ||
        (folds.get(group.title) ?? group === groups[0]);
      summary.append(element('span', ` ${abilities.length}`, 'muted'));
      summary.onclick = () => {
        folds.set(group.title, !fold.open);
      };
      fold.append(summary, ...abilities.map((ability) => createRow(group, ability)));
      return fold;
    }),
    ...(shown.length ? [] : [element('div', 'Nothing matches', 'muted')]),
  );
};

export const showAbilities = (next: AbilityGroup[]): void => {
  const filter = $<HTMLInputElement>('objectAbilityFilter');
  const count = next.reduce((sum, group) => sum + group.abilities.length, 0);

  groups = next;
  stopAbility();
  $('objectAbilitiesSection').hidden = !count;
  $('objectAbilitiesCount').textContent = count ? String(count) : '';
  filter.hidden = count < FILTERED_FROM;
  filter.oninput = renderAbilities;
  renderAbilities();
};
