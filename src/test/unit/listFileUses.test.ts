import * as assert from 'assert';
import { listFileUses } from '../../webview/preview/listFileUses';
import type { FileUse } from '../../webview/preview/protocol';

interface FakeElement {
  tagName: string;
  textContent: string;
  className: string;
  title: string;
  href: string;
  children: (FakeElement | string)[];
  append(...nodes: (FakeElement | string)[]): void;
  onclick?: (event: { preventDefault(): void }) => void;
}

const createElement = (tagName: string): FakeElement => ({
  tagName,
  textContent: '',
  className: '',
  title: '',
  href: '',
  children: [],
  append(...nodes) {
    this.children.push(...nodes);
  },
});

const toText = (node: FakeElement | string): string =>
  typeof node === 'string' ? node : node.textContent + node.children.map(toText).join('');

const USES: FileUse[] = [
  {
    uri: 'bigfs:/mod/ini.big/data/ini/object/unit.ini',
    line: 4,
    field: 'model',
    owner: 'Object SampleUnit',
    location: { container: 'ini.big', detail: 'Mod › ini.big' },
  },
  { uri: 'file:///mod/data/ini/sound.ini', line: 0, field: 'sound' },
];

suite('Used in INI lists', () => {
  const scope = globalThis as unknown as Record<string, unknown>;
  const realDocument = scope.document;

  setup(() => {
    scope.document = { createElement };
  });
  teardown(() => {
    scope.document = realDocument;
  });

  test('each use takes a row, its link with its archive greyed beside it and opening its line', () => {
    const revealed: FileUse[] = [];
    const nodes = listFileUses(USES, (use) => revealed.push(use)) as unknown as FakeElement[];
    const first = nodes[0].children[0] as FakeElement;

    assert.deepStrictEqual(
      nodes.map((row) => [row.tagName, toText(row)]),
      [
        ['div', 'Object SampleUnit (model, line 5)ini.big'],
        ['div', 'sound.ini (sound, line 1)'],
      ],
    );
    assert.strictEqual((first.children[0] as FakeElement).className, 'where');
    assert.strictEqual(first.title, 'Open the line in the INI\nMod › ini.big');
    first.onclick?.({ preventDefault: () => undefined });
    assert.deepStrictEqual(revealed, [USES[0]]);
  });

  test('what is added after a use follows its link in the row', () => {
    const nodes = listFileUses(
      USES,
      () => undefined,
      (use) => (use.owner ? [' ', 'button'] : []),
    ) as unknown as FakeElement[];

    assert.deepStrictEqual(
      nodes.map((row) => [row.tagName, toText(row)]),
      [
        ['div', 'Object SampleUnit (model, line 5)ini.big button'],
        ['div', 'sound.ini (sound, line 1)'],
      ],
    );
  });

  test('no uses say so, with or without something to add', () => {
    assert.deepStrictEqual(listFileUses([], () => undefined), ['No INI file the index holds uses this file']);
    assert.deepStrictEqual(listFileUses([], () => undefined, () => []), [
      'No INI file the index holds uses this file',
    ]);
  });
});
