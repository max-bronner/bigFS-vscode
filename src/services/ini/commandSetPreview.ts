import type { Uri } from 'vscode';
import { readWorkspaceText } from './workspaceText';
import type { SageIniIndex } from './sageIniIndex';
import type { SageDefinition } from './sageIniTables';
import { findHotkeyClashes, readHotkey } from '../../game/ini-tools/hotkeys';

const COLUMNS = 5;
const ICON_SIZE = 40;

const readFields = (lines: string[]): Map<string, string> =>
  new Map(
    lines.flatMap((line) => {
      const match = /^\s*([\w]+)\s*=\s*([^;]*?)\s*(?:;.*)?$/.exec(line);

      return match ? [[match[1].toLowerCase(), match[2].trim()] as const] : [];
    }),
  );

export interface CommandSetSlot {
  slot: number;
  button: string;
}

export const readCommandSetSlots = (lines: string[]): CommandSetSlot[] =>
  [...readFields(lines)]
    .filter(([key, value]) => /^\d+$/.test(key) && value)
    .map(([key, value]) => ({
      slot: Number(key),
      button: value.split(/\s+/)[0],
    }))
    .sort((a, b) => a.slot - b.slot);

export interface ResolvedSlot extends CommandSetSlot {
  defined: boolean;
  text?: string;
  hotkey?: string;
  command?: string;
  imageName?: string;
  grants?: string[];
  needs?: string[];
  needsAny?: boolean;
}

export const createLineReader = () => {
  const texts = new Map<string, Promise<string[]>>();

  return (place: SageDefinition): Promise<string[]> => {
    const key = place.uri.toString();
    let text = texts.get(key);

    if (!text) {
      text = readWorkspaceText(place.uri)
        .then((content) => content.split(/\r?\n/))
        .catch(() => []);
      texts.set(key, text);
    }
    return text.then((lines) => lines.slice(place.line + 1, place.endLine));
  };
};

const splitNames = (value: string | undefined): string[] =>
  (value ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((name) => name && name !== 'none');

export const resolveSlots = async (
  index: SageIniIndex,
  slots: CommandSetSlot[],
  linesOf: (place: SageDefinition) => Promise<string[]>,
  from?: Uri,
): Promise<ResolvedSlot[]> =>
  Promise.all(
    slots.map(async (slot) => {
      const [place] = index.findDefinitions('CommandButton', slot.button, from);

      if (!place) {
        return { ...slot, defined: false };
      }

      const fields = readFields(await linesOf(place));
      const label = fields.get('textlabel');
      const text = label ? index.findString(label, from)?.text : undefined;

      const gated = /\bNEED_UPGRADE\b/i.test(fields.get('options') ?? '');

      return {
        ...slot,
        defined: true,
        grants: [
          ...splitNames(fields.get('upgrade')),
          ...splitNames(fields.get('science')),
        ],
        needs: gated ? splitNames(fields.get('neededupgrade')) : [],
        needsAny: /^(yes|true|1)$/i.test(fields.get('neededupgradeany') ?? ''),
        text,
        hotkey: text ? readHotkey(text) : undefined,
        command: fields.get('command'),
        imageName: fields.get('buttonimage'),
      };
    }),
  );

const escapeMarkdown = (text: string) => text.replace(/[|<>*_`[\]\\]/g, '\\$&');

export const createCommandSetPreview = (
  index: SageIniIndex,
  previewImage?: (definition: SageDefinition) => Promise<string | undefined>,
) => {
  return async (definition: SageDefinition): Promise<string> => {
    const linesOf = createLineReader();
    const slots = await resolveSlots(
      index,
      readCommandSetSlots(await linesOf(definition)),
      linesOf,
      definition.uri,
    );
    const clashes = findHotkeyClashes(slots);
    const cells = await Promise.all(
      slots.map(async (slot) => {
        if (!slot.defined) {
          return `**${slot.slot}**<br>${escapeMarkdown(slot.button)}<br>*not defined*`;
        }

        const [image] = slot.imageName
          ? index.findDefinitions('MappedImage', slot.imageName, definition.uri)
          : [];
        const picture = image && previewImage && (await previewImage(image));
        const uri =
          picture && /\((data:image\/png;base64,[^)]+)\)/.exec(picture)?.[1];
        const icon = uri
          ? `![${escapeMarkdown(slot.imageName!)}](${uri}|width=${ICON_SIZE},height=${ICON_SIZE})`
          : '▫';
        const text = escapeMarkdown((slot.text ?? slot.button).replace(/&(?!&)/, ''));
        const key = slot.hotkey
          ? clashes.has(slot.slot)
            ? ` ⚠ **${slot.hotkey}**, as slot ${clashes.get(slot.slot)!.join(', ')}`
            : ` [${slot.hotkey}]`
          : '';

        return `${icon}<br>**${slot.slot}** ${text}${key}<br><sub>${escapeMarkdown(slot.command ?? '')}</sub>`;
      }),
    );

    if (!cells.length) {
      return `\`${definition.name}\` — CommandSet with no slots`;
    }

    const rows: string[] = [];

    for (let start = 0; start < cells.length; start += COLUMNS) {
      const row = cells.slice(start, start + COLUMNS);

      rows.push(
        `| ${[...row, ...Array(COLUMNS - row.length).fill(' ')].join(' | ')} |`,
      );
    }

    return [
      `\`${definition.name}\` — CommandSet, ${slots.length} button${slots.length === 1 ? '' : 's'}`,
      '',
      `|${' |'.repeat(COLUMNS)}`,
      `|${' --- |'.repeat(COLUMNS)}`,
      ...rows,
    ].join('\n');
  };
};
