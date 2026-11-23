import * as assert from 'assert';
import type * as vscode from 'vscode';
import { renderAptPage } from '../../features/apt/aptPage';
import { ZOOMS } from '../../webview/apt/protocol';
import { DEFAULT_TOOLBAR, readToolbar } from '../../webview/apt/readToolbar';

suite('APT toolbar', () => {
  test('a first movie opens with origin and boxes off, as the game draws it', () => {
    assert.deepStrictEqual(readToolbar(undefined), DEFAULT_TOOLBAR);
    assert.strictEqual(DEFAULT_TOOLBAR.origin || DEFAULT_TOOLBAR.boxes, false);
  });

  test('choices kept are taken, and those the toolbar does not offer keep their defaults', () => {
    assert.deepStrictEqual(
      readToolbar({ zoom: '2', speed: 0.5, origin: true, masks: false, wireframe: 'yes', interact: 1 }),
      { ...DEFAULT_TOOLBAR, zoom: '2', speed: 0.5, origin: true, masks: false },
    );
    assert.deepStrictEqual(readToolbar({ zoom: '7', speed: 5 }), DEFAULT_TOOLBAR);
  });

  test('the zoom list offers the zooms a kept choice is read against, labelled as scales', () => {
    const html = renderAptPage(
      { cspSource: 'vscode-resource:' } as vscode.Webview,
      { toString: () => 'main.js' } as vscode.Uri,
    );
    const zoom = /<select id="zoom"[^>]*>(.*?)<\/select>/.exec(html)?.[1] ?? '';

    assert.deepStrictEqual([...zoom.matchAll(/value="([^"]*)"/g)].map((match) => match[1]), ZOOMS);
    assert.deepStrictEqual([...zoom.matchAll(/>([^<]+)</g)].map((match) => match[1]), ['Fit', '50%', '100%', '200%']);
    assert.ok(ZOOMS.includes(DEFAULT_TOOLBAR.zoom));
  });
});
