import * as assert from 'assert';
import type { Uri } from 'vscode';
import type { Archive } from '../../services/archives/archive';
import type { ArchiveSource } from '../../services/archives/archiveSource';
import { describeFileLocation } from '../../services/archives/describeFileLocation';
import type { LocatedArchives } from '../../services/archives/describeFileLocation';

const toUri = (scheme: string, path: string, fsPath = path): Uri =>
  ({ scheme, path, fsPath, toString: () => `${scheme}:${path}` }) as unknown as Uri;

const install = {
  id: 'rotwk',
  label: 'Base game: ROTWK',
  baseUri: toUri('file', '/games/rotwk'),
} as ArchiveSource;

const archives: LocatedArchives = {
  getSources: () => [install],
  resolveUri: (uri) =>
    uri.path.startsWith('/rotwk/___mod.big/')
      ? {
          archive: { sourceId: 'rotwk', pathInSource: '___mod.big' } as Archive,
          entryPath: uri.path.slice('/rotwk/___mod.big/'.length),
        }
      : undefined,
};

suite('File locations', () => {
  test("a mod's copy names its own archive, with source, entry and uri to hover", () => {
    assert.deepStrictEqual(
      describeFileLocation(archives, toUri('bigfs', '/rotwk/___mod.big/data/ini/mappedimages/a.ini')),
      {
        container: '___mod.big',
        detail:
          'Base game: ROTWK › ___mod.big\ndata/ini/mappedimages/a.ini\nbigfs:/rotwk/___mod.big/data/ini/mappedimages/a.ini',
      },
    );
  });

  test('a loose file names its source, and a file outside every source nothing', () => {
    assert.strictEqual(
      describeFileLocation(archives, toUri('file', '/games/rotwk/data/ini/a.ini'))?.container,
      'Base game: ROTWK (loose)',
    );
    assert.strictEqual(describeFileLocation(archives, toUri('file', '/elsewhere/a.ini')), undefined);
  });
});
