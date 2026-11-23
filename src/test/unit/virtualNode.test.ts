import * as assert from 'assert';
import type { VirtualNode } from '../../services/archives/virtualNode';
import { requireWithVscode } from './requireWithVscode';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodes = requireWithVscode({ FileType: { File: 1, Directory: 2 } }, () => require('../../services/archives/virtualTree') as typeof import('../../services/archives/virtualTree'));

const archive = {} as VirtualNode['archive'];
const otherArchive = {} as VirtualNode['archive'];

const nodeAt = (
  entryPath: string,
  inArchive: VirtualNode['archive'] = archive,
): VirtualNode => ({
  name: entryPath.slice(entryPath.lastIndexOf('/') + 1),
  type: 2,
  entryPath,
  archive: inArchive,
});

suite('Virtual node containment', () => {
  test('a node is inside the directories above it', () => {
    assert.ok(
      nodes.isBelow(nodeAt('data/ini/object.ini'), nodeAt('data/ini')),
    );
    assert.ok(nodes.isBelow(nodeAt('data/ini/object.ini'), nodeAt('data')));
  });

  test('a sibling whose name starts with the same prefix is not inside', () => {
    assert.ok(!nodes.isBelow(nodeAt('data/ini2'), nodeAt('data/ini')));
    assert.ok(!nodes.isBelow(nodeAt('data/ini2/a.ini'), nodeAt('data/ini')));
    assert.ok(!nodes.isBelow(nodeAt('data/ini'), nodeAt('data/ini2')));
  });

  test('a node is not inside itself or below itself', () => {
    assert.ok(!nodes.isBelow(nodeAt('data/ini'), nodeAt('data/ini')));
    assert.ok(!nodes.isBelow(nodeAt('data'), nodeAt('data/ini')));
  });

  test('the same path in another archive is not inside', () => {
    assert.ok(
      !nodes.isBelow(
        nodeAt('data/ini/object.ini', otherArchive),
        nodeAt('data/ini'),
      ),
    );
  });

  test('the archive root holds every other node of its archive', () => {
    assert.ok(nodes.isBelow(nodeAt('data'), nodeAt('')));
    assert.ok(nodes.isBelow(nodeAt('data/ini/object.ini'), nodeAt('')));
    assert.ok(!nodes.isBelow(nodeAt(''), nodeAt('')));
    assert.ok(!nodes.isBelow(nodeAt('data', otherArchive), nodeAt('')));
  });

  test('a selection holding a root and its descendants collapses to the root', () => {
    const root = nodeAt('');
    const folder = nodeAt('data');
    const sibling = nodeAt('data2');

    assert.deepStrictEqual(nodes.getTopLevelNodes([folder, root]), [root]);
    assert.deepStrictEqual(nodes.getTopLevelNodes([folder, sibling]), [
      folder,
      sibling,
    ]);
  });
});
