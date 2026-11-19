export interface WndField {
  key: string;
  value: string;
  start: number;
  end: number;
  keyEnd: number;
}

export interface WndWindow {
  fields: WndField[];
  children: WndWindow[];
  start: number;
  end: number;
}

export interface WndProblem {
  start: number;
  end: number;
  message: string;
}

export interface WndLayout {
  fields: WndField[];
  windows: WndWindow[];
  problems: WndProblem[];
}

const KEYWORDS = new Set([
  'WINDOW',
  'END',
  'CHILD',
  'ENDALLCHILDREN',
  'STARTLAYOUTBLOCK',
  'ENDLAYOUTBLOCK',
]);

const MAX_DEPTH = 16;

type Statement =
  | { kind: 'keyword'; word: string; start: number; end: number }
  | { kind: 'field'; field: WndField };

const tokenize = (text: string, problems: WndProblem[]): Statement[] => {
  const statements: Statement[] = [];
  let at = 0;

  for (;;) {
    while (at < text.length && /\s/.test(text[at])) {
      at++;
    }

    if (at >= text.length) {
      return statements;
    }

    let wordEnd = at;

    while (wordEnd < text.length && !/\s/.test(text[wordEnd])) {
      wordEnd++;
    }

    const word = text.slice(at, wordEnd);

    if (KEYWORDS.has(word)) {
      statements.push({ kind: 'keyword', word, start: at, end: wordEnd });
      at = wordEnd;
      continue;
    }

    const semicolon = text.indexOf(';', at);

    if (semicolon < 0) {
      problems.push({
        start: at,
        end: wordEnd,
        message: `${word} has no closing ;`,
      });

      return statements;
    }

    const body = text.slice(at, semicolon);
    const equals = body.indexOf('=');

    if (equals < 0) {
      problems.push({
        start: at,
        end: semicolon + 1,
        message: `${body.trim().slice(0, 40)} is neither a keyword nor KEY = value;`,
      });
    } else {
      const key = body.slice(0, equals).trim();

      statements.push({
        kind: 'field',
        field: {
          key,
          value: body
            .slice(equals + 1)
            .trim()
            .split(/\s+/)
            .join(' '),
          start: at,
          end: semicolon + 1,
          keyEnd: at + key.length,
        },
      });
    }

    at = semicolon + 1;
  }
};

export const parseWnd = (text: string): WndLayout => {
  const problems: WndProblem[] = [];
  const statements = tokenize(text, problems);
  const layout: WndLayout = { fields: [], windows: [], problems };
  let index = 0;
  let inLayoutBlock = false;
  const misplaced = (statement: Extract<Statement, { kind: 'keyword' }>) =>
    problems.push({
      start: statement.start,
      end: statement.end,
      message: `${statement.word} is out of place here`,
    });

  const readWindow = (
    open: Extract<Statement, { kind: 'keyword' }>,
    depth: number,
  ): WndWindow => {
    const window: WndWindow = {
      fields: [],
      children: [],
      start: open.start,
      end: text.length,
    };
    let inChildren = false;

    if (depth > MAX_DEPTH) {
      problems.push({
        start: open.start,
        end: open.end,
        message: `Windows nest more than ${MAX_DEPTH} deep`,
      });
    }

    while (index < statements.length) {
      const statement = statements[index++];

      if (statement.kind === 'field') {
        window.fields.push(statement.field);
        continue;
      }

      switch (statement.word) {
        case 'END':
          window.end = statement.end;

          return window;
        case 'CHILD':
          inChildren = true;
          break;
        case 'ENDALLCHILDREN':
          if (!inChildren) {
            misplaced(statement);
          }
          inChildren = false;
          break;
        case 'WINDOW':
          if (!inChildren) {
            misplaced(statement);
          }
          if (depth <= MAX_DEPTH) {
            window.children.push(readWindow(statement, depth + 1));
          }
          break;
        default:
          misplaced(statement);
      }
    }

    problems.push({
      start: open.start,
      end: open.end,
      message: 'This WINDOW is never closed by END',
    });

    return window;
  };

  while (index < statements.length) {
    const statement = statements[index++];

    if (statement.kind === 'field') {
      layout.fields.push(statement.field);
    } else if (statement.word === 'WINDOW') {
      layout.windows.push(readWindow(statement, 1));
    } else if (statement.word === 'STARTLAYOUTBLOCK' && !inLayoutBlock) {
      inLayoutBlock = true;
    } else if (statement.word === 'ENDLAYOUTBLOCK' && inLayoutBlock) {
      inLayoutBlock = false;
    } else {
      misplaced(statement);
    }
  }

  problems.sort((a, b) => a.start - b.start);

  return layout;
};

export const findField = (
  window: { fields: WndField[] },
  key: string,
): WndField | undefined => {
  for (let index = window.fields.length - 1; index >= 0; index--) {
    if (window.fields[index].key.toUpperCase() === key) {
      return window.fields[index];
    }
  }

  return undefined;
};

export const splitLabelledItems = (value: string): [string, string[]][] => {
  const items: [string, string[]][] = [];
  const pattern = /"[^"]*"?|[^\s,:]+|:/g;
  const words = value.match(pattern) ?? [];

  for (let index = 0; index < words.length; index++) {
    const word = words[index];

    if (word === ':') {
      continue;
    }

    if (words[index + 1] === ':') {
      items.push([word.toUpperCase(), []]);
    } else if (items.length) {
      items[items.length - 1][1].push(word);
    } else {
      items.push(['', [word]]);
    }
  }

  return items;
};

const parseNumbers = (values: string[] | undefined) =>
  (values ?? []).map(Number).filter((value) => Number.isFinite(value));

export type Rgba = [number, number, number, number];

export interface WndDrawItem {
  image?: string;
  color: Rgba;
  border: Rgba;
}

const unquote = (value: string) => value.trim().replace(/^"(.*)"$/, '$1');

const parseRgba = (values: string[] | undefined): Rgba => {
  const [r = 0, g = 0, b = 0, a = 0] = parseNumbers(values);

  return [r, g, b, a];
};

export const readDrawItems = (value: string): WndDrawItem[] => {
  const items: WndDrawItem[] = [];

  for (const [label, words] of splitLabelledItems(value)) {
    if (label === 'IMAGE') {
      const name = unquote(words[0] ?? '');

      items.push({
        image: name && name.toUpperCase() !== 'NOIMAGE' ? name : undefined,
        color: [0, 0, 0, 0],
        border: [0, 0, 0, 0],
      });
    } else if (items.length && label === 'COLOR') {
      items[items.length - 1].color = parseRgba(words);
    } else if (items.length && label === 'BORDERCOLOR') {
      items[items.length - 1].border = parseRgba(words);
    }
  }

  return items;
};

export interface WndPart {
  role: string;
  image?: string;
  color?: Rgba;
  border?: Rgba;
}

export type WndState = 'enabled' | 'hilite' | 'disabled';

export type WndLookKey = WndState | `${WndState}+checked`;

export const WND_STATES: readonly WndState[] = [
  'enabled',
  'hilite',
  'disabled',
];

type DrawData = ReadonlyMap<string, WndDrawItem[]>;

const readDrawData = (window: { fields: WndField[] }): DrawData => {
  const data = new Map<string, WndDrawItem[]>();

  for (const field of window.fields) {
    const key = field.key.toUpperCase();

    if (key.endsWith('DRAWDATA')) {
      data.set(key, readDrawItems(field.value));
    }
  }

  return data;
};

const buildParts = (role: string, item: WndDrawItem | undefined) => {
  if (!item) {
    return [];
  }

  if (item.image) {
    return [{ role, image: item.image }];
  }

  return item.color[3] > 0 || item.border[3] > 0
    ? [{ role, color: item.color, border: item.border }]
    : [];
};

export const listWindowParts = (
  data: DrawData,
  type: string,
  state: WndState,
  checked = false,
): WndPart[] => {
  const slot = (key: string, index: number) => data.get(key)?.[index];
  const word = state.toUpperCase();
  const own = `${word}DRAWDATA`;
  const pointer = state === 'hilite' ? 'HILITE' : 'ENABLED';

  switch (type.toUpperCase()) {
    case 'CHECKBOX':
      return buildParts('box', slot(own, checked ? 2 : 1));
    case 'HORZSLIDER':
    case 'VERTSLIDER':
      return [
        ...buildParts('bar-filled', slot('DISABLEDDRAWDATA', 0)),
        ...buildParts('bar-empty', slot('DISABLEDDRAWDATA', 1)),
        ...(state === 'hilite'
          ? buildParts('outline', slot('HILITEDRAWDATA', 0))
          : []),
        ...buildParts('thumb', slot(`SLIDERTHUMB${pointer}DRAWDATA`, 0)),
      ];
    case 'SCROLLLISTBOX': {
      const body = `${pointer}DRAWDATA`;
      const thumb = `SLIDERTHUMB${pointer}DRAWDATA`;
      const selected = slot(body, 1);

      return [
        ...buildParts('body', slot(body, 0)),
        ...buildParts(
          'selection',
          selected && { ...selected, image: slot(body, 3)?.image },
        ),
        ...buildParts('up', slot(`LISTBOX${pointer}UPBUTTONDRAWDATA`, 0)),
        ...buildParts('down', slot(`LISTBOX${pointer}DOWNBUTTONDRAWDATA`, 0)),
        ...buildParts('track', slot('LISTBOXENABLEDSLIDERDRAWDATA', 0)),
        ...buildParts('thumb-top', slot(thumb, 0)),
        ...buildParts('thumb-middle', slot(thumb, 5)),
        ...buildParts('thumb-bottom', slot(thumb, 6)),
      ];
    }
    case 'COMBOBOX':
      return [
        ...buildParts('body', slot(own, 0)),
        ...buildParts('button', slot(`COMBOBOXDROPDOWNBUTTON${word}DRAWDATA`, 0)),
      ];
    default:
      return buildParts('body', slot(own, 0));
  }
};

export interface WndFont {
  name: string;
  size: number;
  bold: boolean;
}

export interface WndBox {
  name: string;
  type: string;
  rect?: [number, number, number, number];
  resolution?: [number, number];
  text?: string;
  shown?: string;
  hidden: boolean;
  laidOut?: boolean;
  font?: WndFont;
  textColors?: Record<WndState, Rgba>;
  wrapCentered: boolean;
  looks: Partial<Record<WndLookKey, WndPart[]>>;
  color?: Rgba;
  image?: string;
  start: number;
  children: WndBox[];
}

export interface BoxOptions {
  text?: (value: string) => string | undefined;
}

const hasFlag = (field: WndField | undefined, flag: string) =>
  new RegExp(`(^|\\+)\\s*${flag}\\s*($|\\+)`, 'i').test(field?.value ?? '');

const overlaps = (a: number[], b: number[]) =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

const toBox = (window: WndWindow, options: BoxOptions): WndBox => {
  const rect = findField(window, 'SCREENRECT');
  const items = new Map(rect ? splitLabelledItems(rect.value) : []);
  const upperLeft = parseNumbers(items.get('UPPERLEFT'));
  const bottomRight = parseNumbers(items.get('BOTTOMRIGHT'));
  const resolution = parseNumbers(items.get('CREATIONRESOLUTION'));
  const type = findField(window, 'WINDOWTYPE')?.value.trim() ?? '';
  const data = readDrawData(window);
  const looks: WndBox['looks'] = {};

  for (const state of WND_STATES) {
    looks[state] = listWindowParts(data, type, state);

    if (type.toUpperCase() === 'CHECKBOX') {
      looks[`${state}+checked`] = listWindowParts(data, type, state, true);
    }
  }

  const font = findField(window, 'FONT');
  const fontItems = new Map(font ? splitLabelledItems(font.value) : []);
  const fontSize = parseNumbers(fontItems.get('SIZE'))[0];
  const colors = findField(window, 'TEXTCOLOR');
  const colorItems = new Map(colors ? splitLabelledItems(colors.value) : []);
  const text = findField(window, 'TEXT');
  const written = text && unquote(text.value);
  const enabled = looks.enabled ?? [];

  return {
    name: unquote(findField(window, 'NAME')?.value ?? ''),
    type,
    rect:
      upperLeft.length >= 2 && bottomRight.length >= 2
        ? [upperLeft[0], upperLeft[1], bottomRight[0], bottomRight[1]]
        : undefined,
    resolution:
      resolution.length >= 2 ? [resolution[0], resolution[1]] : undefined,
    text: written,
    shown:
      written === undefined ? undefined : (options.text?.(written) ?? written),
    hidden: hasFlag(findField(window, 'STATUS'), 'HIDDEN'),
    font:
      font && fontSize
        ? {
            name: unquote(fontItems.get('NAME')?.[0] ?? ''),
            size: fontSize,
            bold: parseNumbers(fontItems.get('BOLD'))[0] > 0,
          }
        : undefined,
    textColors: colors && {
      enabled: parseRgba(colorItems.get('ENABLED')),
      hilite: parseRgba(colorItems.get('HILITE')),
      disabled: parseRgba(colorItems.get('DISABLED')),
    },
    wrapCentered: hasFlag(findField(window, 'STATUS'), 'WRAP_CENTERED'),
    looks,
    color: enabled.find((part) => part.color)?.color,
    image: enabled.find((part) => part.image)?.image,
    start: window.start,
    children: [],
  };
};

const settle = (box: WndBox, parent: WndBox | undefined) => {
  if (!box.rect) {
    return;
  }

  const [left, top, right, bottom] = box.rect;

  if (right <= left || bottom <= top) {
    box.hidden = true;

    return;
  }

  if (
    !parent?.rect ||
    left !== 0 ||
    top !== 0 ||
    overlaps(box.rect, parent.rect)
  ) {
    return;
  }

  const [pl, pt, pr, pb] = parent.rect;

  box.laidOut = true;

  if (right - left <= pr - pl && bottom - top <= pb - pt) {
    box.rect = [pl, pt, pl + right - left, pt + bottom - top];
  } else {
    box.hidden = true;
  }
};

export const toBoxes = (
  windows: WndWindow[],
  options: BoxOptions = {},
  parent?: WndBox,
): WndBox[] =>
  windows.map((window) => {
    const box = toBox(window, options);

    settle(box, parent);
    box.children = toBoxes(window.children, options, box);

    return box;
  });
