import {
  BACKDROP_CALL,
  BACKDROP_KEY,
  findEngineImage,
} from '../../game/apt/engineImages';
import {
  findBindingSuggestion,
  findExternSuggestion,
  findImageSuggestion,
  findParameterSuggestion,
} from '../../game/apt/engineSuggestions';
import { toPathKey } from './avm/engine';
import type { FunctionEntry, ReadValue, Seen } from './avm/engine';
import { AsObject } from './avm/value';
import type { Value } from './avm/value';
import { createButton, byId, createHeading, createInput, createRow } from './dom';
import { createSoundButton } from '../shared/createSoundButton';
import { pageSoundPlayer } from '../shared/pageSoundPlayer';
import { engine, onEngineChange, postSoundRequest, saveAnswers } from './engineState';
import { currentGadgets } from './gadgets';
import { listBindings, writeBinding } from './gadgetModel';
import { getImageKey } from './imageSurface';
import { currentPlayer, play, render, view } from './stage';
import { suggestFrom } from './suggestingInput';

const panel = byId('engine');
const count = byId('engine-count');
let restart = () => {};
let filter = '';
const drafts = new Map<string, string>();
let isPressing = false;
const MAX_ROWS = 150;

export const onEngineRestart = (run: () => void): void => {
  restart = run;
};

const text = (value: string, className = '') => {
  const element = document.createElement('span');

  element.textContent = value;
  element.className = className;
  return element;
};

const preview = (value: Value): string => {
  if (value instanceof AsObject) {
    return value.kind.type === 'clip'
      ? `clip ${value.kind.instance.name ?? value.kind.instance.path}`
      : value.kind.type === 'array'
        ? 'array'
        : value.kind.type === 'plain'
          ? 'object'
          : 'function';
  }

  const shown =
    typeof value === 'string' ? JSON.stringify(value) : String(value);

  return shown.length > 40 ? `${shown.slice(0, 40)}…` : shown;
};

const changed = (apply: () => void) => {
  apply();
  saveAnswers();
  render();
};

const callRow = (entry: FunctionEntry) => {
  const called = engine.repeatedCalls.get(entry.path.toLowerCase());
  const fields = entry.params.map((param, at) => {
    const draftKey = `${entry.path}#${at}`;
    const field = createInput(
      drafts.get(draftKey) ?? called?.[at] ?? '',
      () => {},
      'line',
    );

    field.addEventListener('input', () => drafts.set(draftKey, field.value));

    const suggestion = findParameterSuggestion(entry.name, param);

    field.placeholder = param;
    field.classList.add('short');
    if (suggestion) {
      suggestFrom(field, suggestion);
    }
    return field;
  });

  const row = document.createElement('div');
  const name = text(entry.path, 'name');
  const parameters = document.createElement('span');

  row.className = 'engine-call';
  name.title = `${entry.path}(${entry.params.join(', ')})`;
  parameters.className = 'arguments';
  parameters.append(...fields);
  row.append(
    name,
    parameters,
    createButton('Call', () => {
      const result = engine.invokeAndRepeat(
        entry,
        fields.map((field) => field.value),
      );

      saveAnswers();
      if (!view.playing) {
        play(true);
      }
      render();
      panel
        .querySelector('.engine-result')
        ?.replaceChildren(
          result === undefined
            ? ''
            : `${entry.name} returned ${preview(result)}`,
        );
    }),
  );
  return row;
};

const overrideField = (
  current: string,
  placeholder: string,
  set: (value: string) => void,
) => {
  const field = createInput(current, (value) => changed(() => set(value)), 'line');

  field.placeholder = placeholder;
  return field;
};

const valueRow = (read: ReadValue) =>
  createRow(
    read.name,
    overrideField(
      engine.overrides.get(toPathKey(read.name)) ?? '',
      preview(read.value),
      (value) => engine.override(read.name, value),
    ),
    text(
      read.found ? `read ${read.count}×` : `read ${read.count}×, never set`,
      'muted',
    ),
  );

const externField = (name: string, placeholder: string) => {
  const field = overrideField(
    engine.externOverrides.get(name.toLowerCase()) ?? '',
    placeholder,
    (value) => engine.overrideExtern(name, value),
  );
  const suggestion = findExternSuggestion(name);

  if (suggestion) {
    suggestFrom(field, suggestion);
  }
  return field;
};

const externRow = (seen: Seen) =>
  createRow(
    seen.name,
    externField(
      seen.name,
      engine.externWrites.get(seen.name.toLowerCase())?.value ?? 'not set',
    ),
    text(`extern · read ${seen.count}×`, 'muted'),
  );

const callReturnRow = (seen: Seen) => {
  const field = createInput(
    engine.returns.get(seen.name.toLowerCase()) ?? '',
    (value) =>
      changed(() =>
        value.trim()
          ? engine.returns.set(seen.name.toLowerCase(), value)
          : engine.returns.delete(seen.name.toLowerCase()),
      ),
    'line',
  );

  field.placeholder = 'returns';
  return createRow(
    seen.name,
    field,
    text(
      `${seen.count}× · last (${(seen.last ?? []).map((arg) => JSON.stringify(arg)).join(', ')})`,
      'muted',
    ),
  );
};

const imageFields = (key: string) => {
  const supplied = findEngineImage(key);
  const suggestion = findImageSuggestion(key);
  const field = overrideField(
    engine.imageOverrides.get(key.toLowerCase()) ?? '',
    supplied?.image ?? 'MappedImage, or file.tga',
    (value) => engine.overrideImage(key, value),
  );

  if (suggestion) {
    suggestFrom(field, suggestion);
  }
  return [field, text(supplied ? `${key}: ${supplied.basis}` : key, 'muted')];
};

const gadgetRows = () => {
  const gadgets = currentGadgets().filter((each) =>
    matches(`${each.path ?? each.instance.path} ${each.kind} ${each.type ?? ''}`),
  );

  return [
    createHeading('Gadgets'),
    ...(gadgets.length
      ? limited(gadgets, (gadget) => {
          const where = gadget.path ?? `${gadget.instance.path} (unnamed)`;
          const bound = listBindings(currentPlayer(), engine, gadget);

          return createRow(
            where,
            text(
              gadget.kind === 'unknown'
                ? `unknown _type ${gadget.type}`
                : gadget.kind === 'image'
                  ? `image ${gadget.imageName || gadget.imageMap}`
                  : gadget.kind,
              'muted',
            ),
            ...bound.map(({ binding, value, overridden }) => {
              const field = overrideField(
                overridden
                  ? (engine.overrides.get(
                      toPathKey(`${gadget.path}.${binding.name}`),
                    ) ?? '')
                  : '',
                `${binding.name} = ${value}`,
                (typed) =>
                  writeBinding(currentPlayer(), engine, gadget, binding.name, typed),
              );

              const suggestion = findBindingSuggestion(binding.name);

              field.title = binding.name;
              if (suggestion) {
                suggestFrom(field, suggestion);
              }
              return field;
            }),
            ...(gadget.kind === 'image' ? imageFields(getImageKey(gadget)) : []),
          );
        })
      : [text('No gadget surface (_type, _Load, _imageName) yet.', 'muted')]),
    ...(engine.calls.has(BACKDROP_CALL.toLowerCase())
      ? [createRow('Shell background', ...imageFields(BACKDROP_KEY))]
      : []),
  ];
};

const soundRows = () => {
  const toggle = document.createElement('input');

  toggle.type = 'checkbox';
  toggle.checked = engine.playMovieSounds;
  toggle.onchange = () => {
    engine.playMovieSounds = toggle.checked;
    if (toggle.checked) {
      pageSoundPlayer.unlock();
    }
  };

  const label = document.createElement('label');

  label.append(toggle, ' Play movie sounds');
  return [
    createHeading('Sounds the movie asks for'),
    createRow('', label),
    ...(engine.sounds.size
      ? [...engine.sounds.values()].map((each) =>
          createRow(
            each.event,
            createSoundButton(each.event, postSoundRequest),
            text(`${each.count}×`, 'muted'),
          ),
        )
      : [text('No PlaySound call yet.', 'muted')]),
  ];
};

const addRow = () => {
  const name = createInput('', () => {}, 'line');
  const value = createInput('', () => {}, 'line');

  name.placeholder = 'path from _root, or extern.Key';
  value.placeholder = 'value';
  return createRow(
    'Override',
    name,
    value,
    createButton('Set', () => {
      if (name.value.trim()) {
        changed(() => engine.override(name.value.trim(), value.value));
      }
    }),
  );
};

const matches = (name: string) =>
  !filter || name.toLowerCase().includes(filter);

const limited = <T>(items: T[], make: (item: T) => HTMLElement) => [
  ...items.slice(0, MAX_ROWS).map(make),
  ...(items.length > MAX_ROWS
    ? [
        text(
          `… and ${items.length - MAX_ROWS} more; narrow them with the filter`,
          'muted',
        ),
      ]
    : []),
];

export const showEngine = (): void => {
  const active = document.activeElement;

  if (
    isPressing ||
    (active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement) &&
    panel.contains(active)
  ) {
    return;
  }

  const functions = [...engine.functions.values()].filter((each) =>
    matches(each.path),
  );
  const entries = functions.filter((each) => each.engineOnly);
  const others = functions.filter((each) => !each.engineOnly);
  const overridden = (name: string) => engine.overrides.has(toPathKey(name));
  const reads = [...engine.reads.values()]
    .filter((each) => matches(each.name))
    .sort(
      (a, b) =>
        Number(overridden(b.name)) - Number(overridden(a.name)) ||
        Number(a.found) - Number(b.found) ||
        a.name.localeCompare(b.name),
    );
  const externs = [...engine.externs.values()].filter((each) =>
    matches(each.name),
  );
  const calls = [...engine.calls.values()].filter((each) => matches(each.name));
  const unseen = [...engine.overrides.keys()].filter(
    (key) => !engine.reads.has(key) && matches(key),
  );
  const unseenExterns = [...engine.externOverrides.keys()].filter(
    (key) => !engine.externs.has(key) && matches(key),
  );
  const written = [...engine.externWrites.values()].filter((each) =>
    matches(each.name),
  );
  const more = document.createElement('details');
  const summary = document.createElement('summary');

  summary.textContent = `Other functions the movie defines (${others.length})`;
  more.append(summary, ...limited(others, callRow));

  const search = createInput(filter, () => {}, 'line');

  search.placeholder = 'filter by name';
  search.oninput = () => {
    filter = search.value.trim().toLowerCase();
  };
  search.onchange = () => {
    search.blur();
    showEngine();
  };

  const found = `${engine.overrides.size + engine.externOverrides.size + engine.imageOverrides.size} overrides · ${entries.length} entry points · ${engine.reads.size} values read · ${engine.calls.size} calls`;

  count.textContent = entries.length ? String(entries.length) : '';
  count.parentElement!.title = `What the movie's code reached for in the engine: ${found}`;

  const foundLine = text(found, 'muted');

  foundLine.id = 'engine-summary';
  panel.replaceChildren(
    foundLine,
    createRow('', search),
    createHeading('Called by the engine'),
    ...(entries.length
      ? limited(entries, callRow)
      : [
          text(
            'No function only the engine calls has been defined yet.',
            'muted',
          ),
        ]),
    ...(others.length ? [more] : []),
    text('', 'engine-result muted'),
    createHeading('Values'),
    text(
      'An override wins over what the movie holds, from the next read.',
      'muted',
    ),
    addRow(),
    ...unseen.map((key) =>
      createRow(
        key,
        overrideField(engine.overrides.get(key) ?? '', '', (value) =>
          engine.override(key, value),
        ),
        text('not read yet', 'muted'),
      ),
    ),
    ...unseenExterns.map((key) =>
      createRow(key, externField(key, ''), text('extern · not read yet', 'muted')),
    ),
    ...limited(externs, externRow),
    ...limited(written, (each) =>
      createRow(
        each.name,
        text(each.value),
        text('extern · written by the movie', 'muted'),
      ),
    ),
    ...limited(reads, valueRow),
    ...gadgetRows(),
    ...soundRows(),
    createHeading('Calls to the engine'),
    ...(calls.length
      ? limited(calls, callReturnRow)
      : [text('No call to the engine yet.', 'muted')]),
    createRow(
      '',
      createButton('Restart with these overrides', () => {
        restart();
        if (engine.repeatedCalls.size && !view.playing) {
          play(true);
        }
      }),
      createButton('Clear overrides', () => changed(() => engine.clear())),
    ),
  );
};

onEngineChange(showEngine);
panel.addEventListener('pointerdown', () => {
  isPressing = true;
});
window.addEventListener('pointerup', () => {
  if (isPressing) {
    isPressing = false;
    setTimeout(showEngine, 0);
  }
});
panel.addEventListener('focusout', () => setTimeout(showEngine, 0));
