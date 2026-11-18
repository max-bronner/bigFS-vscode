import type {
  ButtonRecord,
  Character,
  FrameItem,
  TextRecord,
} from '../../formats/apt/aptMovie';
import { PLACE_FLAGS } from '../../formats/apt/aptMovie';
import type {
  AptEdit,
  PlacementChange,
  PlacementField,
  TextRecordChange,
} from '../../formats/apt/writer/aptEdit';
import { send } from './details';
import { getVsCodeApi } from '../shared/vscodeApi';
import type { FromPage } from './protocol';

import { addMenu } from './blocks/addMenu';
import { blockCard } from './blocks/blockCard';
import {
  buttonRecordSummary,
  bytesToFloats,
  floatsToBytes,
  itemKind,
  itemSummary,
  itemTitle,
} from './blocks/blockModel';
import {
  characterPicker,
  colourField,
  field,
  flagToggles,
  hexField,
  listField,
  numberField,
  placementColour,
  textField,
  tupleFields,
} from './blocks/controls';
import { scriptBlock } from './blocks/scriptBlock';
import { BUTTON_CONDITIONS, CLIP_EVENTS, bitNames } from './scriptSites';
import { movie } from './state';

const vscode = getVsCodeApi<FromPage>();

export const BUTTON_STATES: [string, number][] = [
  ['up', 0x1],
  ['over', 0x2],
  ['down', 0x4],
  ['hit test', 0x8],
];

const PLACE_FLAG_NAMES: [string, number][] = [
  ['move', PLACE_FLAGS.move],
  ['character', PLACE_FLAGS.hasCharacter],
  ['matrix', PLACE_FLAGS.hasMatrix],
  ['colour', PLACE_FLAGS.hasColorTransform],
  ['ratio', PLACE_FLAGS.hasRatio],
  ['name', PLACE_FLAGS.hasName],
  ['clip depth', PLACE_FLAGS.hasClipDepth],
  ['clip actions', PLACE_FLAGS.hasClipActions],
];

type PlaceItem = Extract<FrameItem, { type: 'placeObject' }>;

const turnedOn = (item: PlaceItem, bit: number): PlacementChange => {
  switch (bit) {
    case PLACE_FLAGS.hasCharacter:
      return { character: item.character ?? 1 };
    case PLACE_FLAGS.hasMatrix:
      return { matrix: item.matrix ?? [1, 0, 0, 1], translate: item.translate };
    case PLACE_FLAGS.hasColorTransform:
      return { colorTransform: item.colorTransform ?? 0xffffffff };
    case PLACE_FLAGS.hasRatio:
      return { ratio: item.ratio ?? 0 };
    case PLACE_FLAGS.hasClipDepth:
      return { clipDepth: item.clipDepth ?? item.depth };
    default:
      return {};
  }
};

const FLAG_FIELDS: [number, PlacementField][] = [
  [PLACE_FLAGS.hasCharacter, 'character'],
  [PLACE_FLAGS.hasMatrix, 'matrix'],
  [PLACE_FLAGS.hasColorTransform, 'colorTransform'],
  [PLACE_FLAGS.hasRatio, 'ratio'],
  [PLACE_FLAGS.hasName, 'name'],
  [PLACE_FLAGS.hasClipDepth, 'clipDepth'],
];

export interface ItemSite {
  timeline: number;
  frame: number;
  index: number;
  count: number;
  flow?: (block: number) => HTMLElement | undefined;
}

const moveItemBy =
  (site: ItemSite) =>
  (by: -1 | 1): void => {
    const to = site.index + by;

    if (to >= 0 && to < site.count) {
      send({
        kind: 'moveItem',
        timeline: site.timeline,
        frame: site.frame,
        from: site.index,
        to,
      });
    }
  };

const placementBody = (item: PlaceItem): Node[] => {
  const placement = (change: PlacementChange) =>
    send({ kind: 'placement', offset: item.offset, change });
  const flagChange = (word: number) => {
    const changed = (word ^ item.flags) >>> 0;
    const change: PlacementChange = {};

    if (changed & PLACE_FLAGS.move) {
      change.isMove = (word & PLACE_FLAGS.move) !== 0;
    }
    for (const [bit, name] of FLAG_FIELDS) {
      if (changed & bit) {
        if (word & bit) {
          Object.assign(change, turnedOn(item, bit));
        } else {
          change.clear = [...(change.clear ?? []), name];
        }
      }
    }
    placement(change);
  };
  const clips = (item.clipActions ?? []).map((clip, index) =>
    scriptBlock({
      label: `on ${bitNames(clip.events, CLIP_EVENTS)}`,
      block: clip.block,
      tab: `${movie().name} @${item.depth} on ${bitNames(clip.events, CLIP_EVENTS)}`,
      remove: { kind: 'removeClipAction', offset: item.offset, index },
      when: () =>
        flagToggles(CLIP_EVENTS, clip.events, (events) =>
          send({ kind: 'clipAction', offset: item.offset, index, events }),
        ),
    }),
  );

  return [
    field(
      'Flags',
      flagToggles(PLACE_FLAG_NAMES, item.flags, flagChange, (bit) =>
        [PLACE_FLAGS.hasClipActions, PLACE_FLAGS.hasName].includes(bit),
      ),
    ),
    field(
      'Depth',
      numberField(item.depth, (depth) => placement({ depth })),
    ),
    field(
      'Character',
      characterPicker(item.character, (character) => placement({ character })),
    ),
    field(
      'Matrix',
      tupleFields(
        [...(item.matrix ?? [1, 0, 0, 1]), ...(item.translate ?? [0, 0])],
        ['a', 'b', 'c', 'd', 'x', 'y'],
        (values) =>
          placement({
            matrix: [values[0], values[1], values[2], values[3]],
            translate: [values[4], values[5]],
          }),
      ),
    ),
    field(
      'Multiply',
      placementColour(
        'colorTransform',
        item.colorTransform ?? 0xffffffff,
        placement,
      ),
    ),
    field('Add', placementColour('colorAdd', item.colorAdd ?? 0, placement)),
    field(
      'Ratio',
      numberField(item.ratio ?? 0, (ratio) => placement({ ratio })),
    ),
    field(
      'Name',
      textField(item.name ?? '', (name) => placement({ name })),
    ),
    field(
      'Clip depth',
      numberField(item.clipDepth ?? 0, (clipDepth) => placement({ clipDepth })),
    ),
    ...clips,
    addMenu(
      'Clip script',
      CLIP_EVENTS.map(([name, bit]) => ({
        id: String(bit),
        label: name,
        icon: '{ }',
      })),
      (events) =>
        vscode.postMessage({
          kind: 'addScript',
          label: `${movie().name} @${item.depth} on ${bitNames(Number(events), CLIP_EVENTS)}`,
          to: { kind: 'clip', offset: item.offset, events: Number(events) },
        }),
    ),
  ];
};

export const frameItemBlock = (
  item: FrameItem,
  site: ItemSite,
): HTMLElement => {
  const key = `item:${site.timeline}:${site.frame}:${item.offset}`;
  const remove = () =>
    send({
      kind: 'removeItem',
      timeline: site.timeline,
      frame: site.frame,
      offset: item.offset,
    });
  const common = {
    key,
    kind: itemKind(item),
    title: itemTitle(item),
    summary: itemSummary(item),
    onRemove: remove,
    onMove: moveItemBy(site),
  };
  const at = { timeline: site.timeline, frame: site.frame };

  switch (item.type) {
    case 'placeObject':
      return blockCard({
        ...common,
        body: () => placementBody(item),
        onDuplicate: () =>
          send({
            kind: 'placeObject',
            ...at,
            depth: item.depth + 1,
            character: item.character ?? 1,
            matrix: item.matrix,
            translate: item.translate,
            name: item.name,
          }),
      });
    case 'frameLabel':
      return blockCard({
        ...common,
        body: () => [
          field(
            'Label',
            textField(item.label, (label) =>
              send({ kind: 'frameLabel', offset: item.offset, label }),
            ),
          ),
          field(
            'Flags',
            numberField(item.flags, (flags) =>
              send({ kind: 'frameLabel', offset: item.offset, flags }),
            ),
          ),
          field(
            'Frame',
            numberField(
              item.frame,
              (frame) =>
                send({ kind: 'frameLabel', offset: item.offset, frame }),
              'The frame the label names',
            ),
          ),
        ],
        onDuplicate: () =>
          send({ kind: 'addFrameLabel', ...at, label: item.label }),
      });
    case 'removeObject':
      return blockCard({
        ...common,
        body: () => [
          field(
            'Depth',
            numberField(item.depth, (depth) =>
              send({ kind: 'removeObjectDepth', offset: item.offset, depth }),
            ),
          ),
        ],
      });
    case 'backgroundColor':
      return blockCard({
        ...common,
        body: () => [
          field(
            'Colour',
            colourField(
              [
                (item.color >>> 16) & 255,
                (item.color >>> 8) & 255,
                item.color & 255,
                (item.color >>> 24) & 255,
              ],
              ([r, g, b, a]) =>
                send({
                  kind: 'backgroundColor',
                  offset: item.offset,
                  color: ((a << 24) | (r << 16) | (g << 8) | b) >>> 0,
                }),
            ),
          ),
          field(
            'ARGB',
            hexField(item.color, (color) =>
              send({ kind: 'backgroundColor', offset: item.offset, color }),
            ),
          ),
        ],
        onDuplicate: () =>
          send({ kind: 'addBackgroundColor', ...at, color: item.color }),
      });
    case 'initAction':
      return blockCard({
        ...common,
        open: true,
        body: () => [
          field(
            'Sprite',
            characterPicker(item.sprite, (sprite) =>
              send({ kind: 'initAction', offset: item.offset, sprite }),
            ),
          ),
          scriptBlock({
            label: `init #${item.sprite}`,
            block: item.block,
            tab: `${movie().name} #${site.timeline} frame ${site.frame} init #${item.sprite}`,
            open: true,
          }),
        ],
      });
    case 'action': {
      const flow = site.flow?.(item.block);

      return scriptBlock({
        label: `frame ${site.frame} script`,
        block: item.block,
        tab: `${movie().name} #${site.timeline} frame ${site.frame}`,
        remove: {
          kind: 'removeItem',
          timeline: site.timeline,
          frame: site.frame,
          offset: item.offset,
        },
        onMove: moveItemBy(site),
        open: true,
        whenLabel: 'Does',
        when: flow && (() => flow),
      });
    }
    default:
      return blockCard({ ...common, body: () => [] });
  }
};

export const buttonRecordBlock = (
  id: number,
  record: ButtonRecord,
  index: number,
  count: number,
): HTMLElement => {
  const write = (
    change: Omit<Extract<AptEdit, { kind: 'buttonRecord' }>, 'kind' | 'offset'>,
  ) => send({ kind: 'buttonRecord', offset: record.offset, ...change });

  return blockCard({
    key: `record:${id}:${record.offset}`,
    kind: 'buttonRecord',
    title: `Record ${index}`,
    summary: buttonRecordSummary(record),
    onRemove: () => send({ kind: 'removeButtonRecord', id, index }),
    onDuplicate: () =>
      send({
        kind: 'addButtonRecord',
        id,
        flags: record.flags,
        character: record.character,
        depth: record.depth + 1,
        matrix: record.matrix,
        translate: record.translate,
        color: record.color,
        unknown: record.unknown,
      }),
    onMove: (by) => {
      const to = index + by;

      if (to >= 0 && to < count) {
        send({ kind: 'moveButtonRecord', id, from: index, to });
      }
    },
    body: () => [
      field(
        'States',
        flagToggles(BUTTON_STATES, record.flags, (flags) => write({ flags })),
      ),
      field(
        'Character',
        characterPicker(record.character, (character) => write({ character })),
      ),
      field(
        'Depth',
        numberField(record.depth, (depth) => write({ depth })),
      ),
      field(
        'Matrix',
        tupleFields(
          [...record.matrix, ...record.translate],
          ['a', 'b', 'c', 'd', 'x', 'y'],
          (values) =>
            write({
              matrix: [values[0], values[1], values[2], values[3]],
              translate: [values[4], values[5]],
            }),
        ),
      ),
      field(
        'Colour',
        colourField(floatsToBytes(record.color), (bytes) =>
          write({ color: bytesToFloats(bytes) }),
        ),
      ),
      field(
        'Unknown',
        tupleFields(record.unknown, ['+52', '+56', '+60', '+64'], (unknown) =>
          write({ unknown }),
        ),
      ),
    ],
  });
};

export const textRunBlock = (
  character: Extract<Character, { type: 'text' }>,
  record: TextRecord,
  index: number,
): HTMLElement => {
  const write = (change: TextRecordChange) =>
    send({ kind: 'textRecord', id: character.id, index, change });

  return blockCard({
    key: `run:${character.id}:${record.offset}`,
    kind: 'textRun',
    title: `Run ${index}`,
    summary: `font #${record.font} · ${record.glyphs.length} glyphs`,
    onRemove: () => send({ kind: 'removeTextRecord', id: character.id, index }),
    onDuplicate: () =>
      send({ kind: 'addTextRecord', id: character.id, font: record.font }),
    body: () => [
      field(
        'Font',
        characterPicker(record.font, (font) => write({ font })),
      ),
      field(
        'Colour',
        colourField(floatsToBytes(record.color), (bytes) =>
          write({ color: bytesToFloats(bytes) }),
        ),
      ),
      field(
        'Pen',
        tupleFields(record.penOffset, ['x', 'y'], (penOffset) =>
          write({ penOffset }),
        ),
      ),
      field(
        'Height',
        numberField(record.textHeight, (textHeight) => write({ textHeight })),
      ),
      field(
        'Unknown',
        tupleFields(record.unknown, ['+20', '+24', '+28', '+32'], (unknown) =>
          write({ unknown }),
        ),
      ),
      field(
        'Glyphs',
        listField(
          record.glyphs
            .map((glyph) => `${glyph.index}:${glyph.advance}`)
            .join(', '),
          2,
          (pairs) =>
            write({
              glyphs: pairs.map(([glyph, advance]) => ({
                index: glyph,
                advance,
              })),
            }),
        ),
      ),
    ],
  });
};

export const buttonConditionToggles = (
  id: number,
  index: number,
  condition: number,
): HTMLSpanElement =>
  flagToggles(BUTTON_CONDITIONS, condition, (value) =>
    send({ kind: 'buttonAction', id, index, condition: value }),
  );
