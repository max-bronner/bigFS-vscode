import * as assert from 'assert';
import type { Uri } from 'vscode';
import type { EntryLocator } from '../../services/entryLocator';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';
import { requireWithVscode } from './requireWithVscode';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const library = requireWithVscode({ FileType: { File: 1, Directory: 2 }, EventEmitter: class {} }, () => require('../../services/effectLibrary') as typeof import('../../services/effectLibrary'));

const toTga = (blue: number) =>
  Buffer.from([0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 32, 0x28, blue, 2, 3, 255]);

const createLocator = () => {
  const files = { blue: 1, revision: 0, reads: 0 };
  const locator = {
    get revision() {
      return files.revision;
    },
    read: async (name: string) => {
      files.reads++;
      return /\.tga$/i.test(name) ? toTga(files.blue) : undefined;
    },
  } as unknown as EntryLocator;

  return { files, locator };
};

suite('Effect library', () => {
  const index = {} as SageIniIndex;
  const near = {} as Uri;

  test('a texture is decoded once while its files stay as they were', async () => {
    const { files, locator } = createLocator();
    const effects = new library.EffectLibrary(index, locator, near);
    const first = await effects.getTexture('Smoke.tga');

    assert.strictEqual(await effects.getTexture('SMOKE.tga'), first);
    assert.strictEqual(files.reads, 2);
  });

  test('a texture is read again once the locator says files changed', async () => {
    const { files, locator } = createLocator();
    const effects = new library.EffectLibrary(index, locator, near);
    const first = await effects.getTexture('Smoke.tga');

    files.blue = 7;
    files.revision++;
    assert.notStrictEqual(await effects.getTexture('Smoke.tga'), first);
  });

  test('a texture forgotten by hand is read again, as after a loose file is saved', async () => {
    const { files, locator } = createLocator();
    const effects = new library.EffectLibrary(index, locator, near);
    const first = await effects.getTexture('Smoke.tga');

    files.blue = 7;
    effects.forgetTextures();
    assert.notStrictEqual(await effects.getTexture('Smoke.tga'), first);
  });
});
