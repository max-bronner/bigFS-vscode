import { groupObjectSounds } from '../../game/audio/groupObjectSounds';
import type { LabelledSound } from '../../game/audio/groupObjectSounds';
import type { ObjectScene } from '../../game/objects/objectScene';
import { createSoundButton } from '../shared/createSoundButton';
import { element } from '../shared/element';
import { $, post } from './page';

const FILTERED_FROM = 8;

const folds = new Map<string, boolean>();

const createRow = ({ field, name, label }: LabelledSound) => {
  const row = element('div', undefined, 'voice');
  const text = element('div', undefined, 'voice-text');

  text.title = `${field} = ${name}`;
  text.append(element('div', label), element('div', name, 'muted voice-name'));
  row.append(createSoundButton(name, post), text);
  return row;
};

export const showVoices = (scene: ObjectScene): void => {
  const filter = $<HTMLInputElement>('objectVoiceFilter');
  const list = $('objectVoices');

  const render = () => {
    const query = filter.value.trim().toLowerCase();
    const matching = scene.voices.filter((voice) =>
      `${voice.field} ${voice.name}`.toLowerCase().includes(query),
    );

    list.replaceChildren(
      ...groupObjectSounds(matching).map(({ title, sounds }) => {
        const group = element('details', undefined, 'voice-group');
        const summary = element('summary', title);

        group.open = !!query || (folds.get(title) ?? title === 'Selected');
        summary.append(element('span', ` ${sounds.length}`, 'muted'));
        summary.onclick = () => {
          folds.set(title, !group.open);
        };
        group.append(summary, ...sounds.map(createRow));
        return group;
      }),
      ...(matching.length ? [] : [element('div', 'No sound matches', 'muted')]),
    );
  };

  $('objectVoicesSection').hidden = !scene.voices.length;
  $('objectVoicesCount').textContent = scene.voices.length ? String(scene.voices.length) : '';
  filter.hidden = scene.voices.length < FILTERED_FROM;
  filter.oninput = render;
  render();
};
