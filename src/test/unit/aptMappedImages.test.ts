import * as assert from 'assert';
import Module from 'module';
import type { Uri } from 'vscode';
import type { EntryLocator } from '../../services/entryLocator';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';

type Loader = (request: string, ...rest: unknown[]) => unknown;

const internals = Module as unknown as { _load: Loader };
const original = internals._load;

internals._load = (request, ...rest) =>
  request === 'vscode'
    ? { FileType: { File: 1, Directory: 2 }, EventEmitter: class {} }
    : original.call(Module, request, ...rest);

let mapped: typeof import('../../features/apt/aptMappedImages');

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mapped = require('../../features/apt/aptMappedImages');
} finally {
  internals._load = original;
}

const jpeg = (): Buffer =>
  Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x04, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11,
  ]);

suite('apt mapped images', () => {
  test('a JPEG texture is answered as a plain Uint8Array, not a Buffer', async () => {
    const locator = {
      read: async (name: string) => (/\.jpg$/i.test(name) ? jpeg() : undefined),
    } as unknown as EntryLocator;
    const index = { findDefinitions: () => [] } as unknown as SageIniIndex;
    const answer = await mapped.resolveMappedImages(
      ['Load.tga'],
      index,
      locator,
      new Set(),
      {} as Uri,
    );
    const sent = answer.jpegs['mapped:load.tga'];

    assert.ok(sent);
    assert.ok(!Buffer.isBuffer(sent));
    assert.strictEqual(Object.getPrototypeOf(sent), Uint8Array.prototype);
    assert.deepStrictEqual([...sent], [...jpeg()]);
  });
});
