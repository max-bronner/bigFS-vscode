import * as assert from 'assert';
import type { LogOutputChannel, Uri } from 'vscode';
import type { Archive, EntryChange } from '../../services/archives/archive';
import type { ArchivePolicy } from '../../services/archives/archivePolicy';
import type { ArchiveOperations } from '../../services/archives/archiveOperations';
import type { ArchiveRegistry } from '../../services/archives/archiveRegistry';
import type { ArchiveSource } from '../../services/archives/archiveSource';
import type { VirtualNode } from '../../services/archives/virtualNode';
import { requireWithVscode } from './requireWithVscode';

class FakeFileSystemError extends Error {
  constructor(
    readonly code: string,
    message: unknown,
  ) {
    super(String(message));
  }
}

const fakeVscode = {
  FileType: { File: 1, Directory: 2 },
  FileSystemError: {
    NoPermissions: (message: unknown) =>
      new FakeFileSystemError('NoPermissions', message),
    FileNotFound: (message: unknown) =>
      new FakeFileSystemError('FileNotFound', message),
    FileNotADirectory: (message: unknown) =>
      new FakeFileSystemError('FileNotADirectory', message),
    FileIsADirectory: (message: unknown) =>
      new FakeFileSystemError('FileIsADirectory', message),
  },
  EventEmitter: class {
    event = () => ({ dispose: () => undefined });
    fire(): void {}
  },
};

/* eslint-disable @typescript-eslint/no-require-imports */
const { policies, operationsModule, registries, nodes } = requireWithVscode(fakeVscode, () => ({
  policies: require('../../services/archives/archivePolicy') as typeof import('../../services/archives/archivePolicy'),
  operationsModule: require('../../services/archives/archiveOperations') as typeof import('../../services/archives/archiveOperations'),
  registries: require('../../services/archives/archiveRegistry') as typeof import('../../services/archives/archiveRegistry'),
  nodes: require('../../services/archives/virtualTree') as typeof import('../../services/archives/virtualTree'),
}));
/* eslint-enable @typescript-eslint/no-require-imports */

const log = {
  info: () => undefined,
  error: () => undefined,
} as unknown as LogOutputChannel;

const uriOf = (path: string) => ({ path }) as unknown as Uri;

const sourceOf = (id: string, external: boolean, kind = 'mod'): ArchiveSource =>
  ({ id, label: id, external, base: external, kind }) as unknown as ArchiveSource;

const fakeArchive = (sourceId: string, entryPaths: string[]) => {
  const applied: (readonly EntryChange[])[] = [];
  const rootPath = `/${sourceId}/data.big`;
  const archive = {
    name: 'data.big',
    sourceId,
    pathInSource: 'data.big',
    archivePath: `${sourceId}/data.big`,
    rootPath,
    rootKey: rootPath.toLowerCase(),
    isLoaded: true,
    applyChanges: async (changes: readonly EntryChange[]) => {
      applied.push(changes);
    },
    readFileNodes: async <T extends { node: VirtualNode }>(
      items: readonly T[],
      onFile: (item: T, content: Uint8Array) => Promise<void>,
    ) => {
      for (const item of items) {
        await onFile(item, new Uint8Array([1, 2, 3]));
      }
    },
  } as unknown as Archive & { root: VirtualNode };

  archive.root = nodes.buildVirtualTree(archive, entryPaths);

  return { archive, applied };
};

const childOf = (archive: Archive, entryPath: string): VirtualNode => {
  const node = nodes.findChild(archive.root, entryPath);

  assert.ok(node, `no node at ${entryPath}`);

  return node;
};

const recordPolicy = (inner: ArchivePolicy) => {
  const asked: string[] = [];
  const policy: ArchivePolicy = {
    isReadOnly: (sourceId) => {
      asked.push(sourceId);
      return inner.isReadOnly(sourceId);
    },
    ensureWritable: (sourceId) => {
      asked.push(sourceId);
      inner.ensureWritable(sourceId);
    },
    isArchiveReadOnly: (archive) => {
      asked.push(archive.sourceId);
      return inner.isArchiveReadOnly(archive);
    },
    ensureArchiveWritable: (archive) => {
      asked.push(archive.sourceId);
      inner.ensureArchiveWritable(archive);
    },
  };

  return { policy, asked };
};

const setUp = () => {
  const registry: ArchiveRegistry = registries.createArchiveRegistry(log, {
    whenReady: async () => undefined,
    discover: async () => undefined,
    retryLater: () => undefined,
  });
  const base = fakeArchive('base', ['data/ini/a.ini', 'data/ini/b.ini']);
  const mod = fakeArchive('mod', ['data/ini/c.ini']);

  registry.sources = [sourceOf('mod', false), sourceOf('base', true)];
  registry.archives = new Map([
    [base.archive.rootKey, base.archive],
    [mod.archive.rootKey, mod.archive],
  ]);

  const { policy, asked } = recordPolicy(
    policies.createArchivePolicy(() => registry.sources),
  );
  const operations = operationsModule.createArchiveOperations(
    registry,
    policy,
    log,
  );

  return { base, mod, operations, asked };
};

type Setup = ReturnType<typeof setUp>;

const WRITES_INTO_BASE: Record<
  keyof ArchiveOperations,
  (setup: Setup) => Promise<unknown>
> = {
  writeFile: ({ operations }) =>
    operations.writeFile(uriOf('/base/data.big/data/new.ini'), new Uint8Array()),
  writeFiles: ({ operations }) =>
    operations.writeFiles([
      { uri: uriOf('/base/data.big/data/new.ini'), content: new Uint8Array() },
    ]),
  createDirectory: ({ operations }) =>
    operations.createDirectory(uriOf('/base/data.big/data/new')),
  delete: ({ operations }) =>
    operations.delete(uriOf('/base/data.big/data/ini/a.ini')),
  deleteNodes: ({ operations, base }) =>
    operations.deleteNodes([childOf(base.archive, 'data/ini/a.ini')]),
  rename: ({ operations }) =>
    operations.rename(
      uriOf('/base/data.big/data/ini/a.ini'),
      uriOf('/base/data.big/data/ini/z.ini'),
    ),
  moveNodes: ({ operations, base }) =>
    operations.moveNodes(
      [childOf(base.archive, 'data/ini/a.ini')],
      childOf(base.archive, 'data'),
    ),
  copyNodes: ({ operations, base }) =>
    operations.copyNodes(
      [{ source: childOf(base.archive, 'data/ini/a.ini'), targetName: 'z.ini' }],
      childOf(base.archive, 'data'),
    ),
  addFiles: ({ operations, base }) =>
    operations.addFiles(childOf(base.archive, 'data'), [
      { name: 'new.ini', size: 0, content: new Uint8Array() },
    ]),
  transferNodes: ({ operations, base, mod }) =>
    operations.transferNodes(
      [childOf(mod.archive, 'data/ini/c.ini')],
      childOf(base.archive, 'data'),
      true,
      async () => 'replace',
    ),
};

suite('archive policy', () => {
  test('a base game source is read-only and a workspace source is not', () => {
    const policy = policies.createArchivePolicy(() => [
      sourceOf('mod', false),
      sourceOf('base', true),
    ]);

    assert.strictEqual(policy.isReadOnly('base'), true);
    assert.strictEqual(policy.isReadOnly('mod'), false);
    assert.strictEqual(policy.isReadOnly('unknown'), false);
    assert.throws(
      () => policy.ensureWritable('base'),
      (error: unknown) =>
        error instanceof FakeFileSystemError &&
        error.code === 'NoPermissions' &&
        error.message.includes('base is read-only'),
    );
    assert.doesNotThrow(() => policy.ensureWritable('mod'));
    assert.doesNotThrow(() => policy.ensureWritable('unknown'));
  });

  test("the game's own archives in an install of the workspace are read-only while protected", () => {
    let isProtecting = true;
    const policy = policies.createArchivePolicy(
      () => [sourceOf('install', false, 'rotwk')],
      () => isProtecting,
    );
    const game = { sourceId: 'install', pathInSource: 'INI.big', name: 'INI.big' };
    const mod = { sourceId: 'install', pathInSource: '___mymod.big', name: '___mymod.big' };

    assert.deepStrictEqual(
      [policy.isArchiveReadOnly(game), policy.isArchiveReadOnly(mod), policy.isReadOnly('install')],
      [true, false, false],
    );
    assert.throws(
      () => policy.ensureArchiveWritable(game),
      (error: unknown) =>
        error instanceof FakeFileSystemError &&
        error.code === 'NoPermissions' &&
        error.message.includes('bigfs.protectGameArchives'),
    );
    assert.doesNotThrow(() => policy.ensureArchiveWritable(mod));

    isProtecting = false;
    assert.strictEqual(policy.isArchiveReadOnly(game), false);
    assert.doesNotThrow(() => policy.ensureArchiveWritable(game));
  });

  for (const [name, write] of Object.entries(WRITES_INTO_BASE)) {
    test(`${name} asks the policy and leaves a base game archive untouched`, async () => {
      const setup = setUp();

      await assert.rejects(
        write(setup),
        (error: unknown) =>
          error instanceof FakeFileSystemError &&
          error.code === 'NoPermissions',
      );
      assert.ok(setup.asked.includes('base'));
      assert.deepStrictEqual(setup.base.applied, []);
    });
  }

  test('every operation is a write path the table above covers', () => {
    const { operations } = setUp();

    assert.deepStrictEqual(
      Object.keys(operations).sort(),
      Object.keys(WRITES_INTO_BASE).sort(),
    );
  });

  test('a move out of a base game archive copies and leaves the source in place', async () => {
    const { operations, base, mod, asked } = setUp();

    const result = await operations.transferNodes(
      [childOf(base.archive, 'data/ini/a.ini')],
      childOf(mod.archive, 'data'),
      true,
      async () => 'replace',
    );

    assert.deepStrictEqual(result, { transferred: 1, removed: 0 });
    assert.ok(asked.includes('base'));
    assert.deepStrictEqual(base.applied, []);
    assert.strictEqual(mod.applied.length, 1);
  });

  test('the same writes reach an archive of the workspace', async () => {
    const { operations, mod, asked } = setUp();

    await operations.writeFile(
      uriOf('/mod/data.big/data/new.ini'),
      new Uint8Array(),
    );
    await operations.deleteNodes([childOf(mod.archive, 'data/ini/c.ini')]);

    assert.deepStrictEqual(asked, ['mod', 'mod']);
    assert.strictEqual(mod.applied.length, 2);
  });
});
