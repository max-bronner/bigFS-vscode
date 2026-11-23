import * as assert from 'assert';
import type { LocationLink, MarkdownString, Position, TextDocument } from 'vscode';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import type { SageIniDocuments } from '../../services/ini/sageIniDocuments';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';
import type { SageStringPlace } from '../../services/ini/sageIniTables';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { localise, mergeGameText, setGameText } from '../../webview/apt/gameText';
import { loadSageIniSchema } from './loadSageIniSchema';
import { requireWithVscode } from './requireWithVscode';

class StubPosition {
  public constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

class StubRange {
  public readonly start: StubPosition;
  public readonly end: StubPosition;

  public constructor(...args: [StubPosition, StubPosition] | number[]) {
    const [a, b, c, d] = args as unknown[];

    this.start = a instanceof StubPosition ? a : new StubPosition(a as number, b as number);
    this.end =
      a instanceof StubPosition ? (b as StubPosition) : new StubPosition(c as number, d as number);
  }
}

class StubMarkdown {
  public value = '';
  public appendMarkdown(text: string) {
    this.value += text;
    return this;
  }
  public appendText(text: string) {
    this.value += text;
    return this;
  }
  public appendCodeblock(text: string) {
    this.value += `\n${text}\n`;
    return this;
  }
}

class StubEmitter<T> {
  private listeners: ((value: T) => void)[] = [];
  public readonly event = (listener: (value: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => undefined };
  };
  public fire(value: T) {
    this.listeners.forEach((listener) => listener(value));
  }
  public dispose() {
    this.listeners = [];
  }
}

const configuration = new Map<string, unknown>();
let onConfiguration: (() => void) | undefined;

const vscodeStub = {
  Position: StubPosition,
  Range: StubRange,
  MarkdownString: StubMarkdown,
  Hover: class {
    public constructor(
      public readonly contents: StubMarkdown,
      public readonly range: StubRange,
    ) {}
  },
  EventEmitter: StubEmitter,
  FileType: { File: 1, Directory: 2 },
  window: { showQuickPick: async () => undefined },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: unknown) => configuration.get(key) ?? fallback,
      update: async (key: string, value: unknown) => {
        configuration.set(key, value);
        onConfiguration?.();
      },
    }),
    onDidChangeConfiguration: (listener: (event: unknown) => void) => {
      onConfiguration = () => listener({ affectsConfiguration: () => true });
      return { dispose: () => undefined };
    },
  },
};

/* eslint-disable @typescript-eslint/no-require-imports */
const { hovers, definitions, languages } = requireWithVscode(vscodeStub, () => ({
  hovers: require('../../features/iniLanguage/providers/sageIniHoverProvider') as typeof import('../../features/iniLanguage/providers/sageIniHoverProvider'),
  definitions: require('../../features/iniLanguage/providers/sageIniDefinitionProvider') as typeof import('../../features/iniLanguage/providers/sageIniDefinitionProvider'),
  languages: require('../../services/ini/gameLanguage') as typeof import('../../services/ini/gameLanguage'),
}));
/* eslint-enable @typescript-eslint/no-require-imports */

const schema = loadSageIniSchema();

const TABLE_URI = { toString: () => 'bigfs:/lang/English.big/data/lotr.str' };

const createIndex = () => {
  let isReady = false;
  const record: SageStringPlace = {
    label: 'OBJECT:GondorFighter',
    text: 'Gondor Soldiers',
    line: 6,
    uri: TABLE_URI as unknown as SageStringPlace['uri'],
    language: 'english',
  };

  return {
    whenReady: async () => {
      isReady = true;
    },
    findString: (value: string) =>
      isReady && value.toLowerCase() === 'object:gondorfighter' ? record : undefined,
    findMacro: (name: string) =>
      isReady && name === 'GONDOR_COST'
        ? { name: 'GONDOR_COST', value: '300', uri: TABLE_URI, line: 0 }
        : undefined,
    findDefinitions: () => [],
  } as unknown as SageIniIndex;
};

const INI = ['Object GondorFighter', '  DisplayName = OBJECT:GondorFighter', '  BuildCost = GONDOR_COST', 'End'];

const documents = {
  parse: async () => parseSageIni(INI, schema),
  getSchema: async () => schema,
} as unknown as SageIniDocuments;

const at = (line: number, character: number) => new StubPosition(line, character) as unknown as Position;
const document = { uri: { path: '/data/ini/object.ini' } } as unknown as TextDocument;

suite('Game text lookups', () => {
  test('a string label hovers as its text even before the index finished reading', async () => {
    const provider = hovers.createSageIniHoverProvider(documents, createIndex());
    const hover = await provider.provideHover(document, at(1, 20), undefined as never);
    const contents = (hover as unknown as { contents: MarkdownString }).contents;

    assert.match(contents.value, /Gondor Soldiers/);
  });

  test('a macro use hovers as its value even before the index finished reading', async () => {
    const provider = hovers.createSageIniHoverProvider(documents, createIndex());
    const hover = await provider.provideHover(document, at(2, 18), undefined as never);
    const contents = (hover as unknown as { contents: MarkdownString }).contents;

    assert.match(contents.value, /#define GONDOR_COST 300/);
  });

  test('go to definition on a string label leads to its record in the string table', async () => {
    const provider = definitions.createSageIniDefinitionProvider(documents, createIndex());
    const links = (await provider.provideDefinition(
      document,
      at(1, 20),
      undefined as never,
    )) as LocationLink[];

    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].targetUri, TABLE_URI);
    assert.strictEqual(links[0].targetSelectionRange?.start.line, 6);
    assert.strictEqual(links[0].originSelectionRange?.start.character, 16);
  });

  test('the language holder tells listeners only when the language changes', async () => {
    const remembered = new Map<string, unknown>();
    const applied: (string | undefined)[] = [];
    const archives = {
      whenReady: async () => undefined,
      getArchiveRoots: () =>
        ['C:/Game/lang/English.big', 'C:/Game/lang/German.big'].map((archivePath) => ({
          archive: { archivePath },
        })),
    } as unknown as ArchiveModel;
    const index = { setLanguage: () => undefined } as unknown as SageIniIndex;

    configuration.set('bigfs.language', 'german');
    const language = new languages.GameLanguage(
      archives,
      {
        get: (key: string) => remembered.get(key),
        update: async (key: string, value: unknown) => void remembered.set(key, value),
      } as never,
      index,
    );

    language.onDidChange((chosen) => applied.push(chosen));
    await language.ensure();
    await language.ensure();
    configuration.set('bigfs.language', 'english');
    await language.ensure();
    language.dispose();
    configuration.delete('bigfs.language');

    assert.deepStrictEqual(applied, ['german', 'english']);
  });

  test('the page keeps the text of a loaded movie when the shown one is sent again', () => {
    setGameText({ $soloplay: 'SOLO PLAY' });
    mergeGameText({ $loaded: 'FROM A LOADED MOVIE' });
    setGameText({ $soloplay: 'EINZELSPIELER' });

    assert.strictEqual(localise('$SoloPlay'), 'EINZELSPIELER');
    assert.strictEqual(localise('$Loaded'), 'FROM A LOADED MOVIE');

    setGameText(undefined);
    assert.strictEqual(localise('$SoloPlay'), '$SoloPlay');
  });
});
