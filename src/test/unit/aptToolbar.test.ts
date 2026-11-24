import * as assert from 'assert';
import type * as vscode from 'vscode';
import { renderAptPage } from '../../features/apt/aptPage';
import { ZOOMS } from '../../webview/apt/protocol';
import { TOOLBAR_SETTINGS } from '../../webview/apt/toolbarSettings';
import { readSettings } from '../../webview/shared/createPreviewSettings';

suite('APT toolbar', () => {
  test('a first movie opens with origin and boxes off, as the game draws it', () => {
    const toolbar = readSettings(undefined, TOOLBAR_SETTINGS);

    assert.strictEqual(toolbar.origin || toolbar.boxes, false);
  });

  test('choices kept are taken, and those the toolbar does not offer keep their defaults', () => {
    const defaults = readSettings(undefined, TOOLBAR_SETTINGS);

    assert.deepStrictEqual(
      readSettings({ zoom: '2', speed: 0.5, origin: true, masks: false, wireframe: 'yes', interact: 1 }, TOOLBAR_SETTINGS),
      { ...defaults, zoom: '2', speed: 0.5, origin: true, masks: false },
    );
    assert.deepStrictEqual(readSettings({ zoom: '7', speed: 5 }, TOOLBAR_SETTINGS), defaults);
  });

  test('the zoom list offers the zooms a kept choice is read against, labelled as scales', () => {
    const html = renderAptPage(
      { cspSource: 'vscode-resource:' } as vscode.Webview,
      { toString: () => 'main.js' } as vscode.Uri,
    );
    const zoom = /<select id="zoom"[^>]*>(.*?)<\/select>/.exec(html)?.[1] ?? '';

    assert.deepStrictEqual([...zoom.matchAll(/value="([^"]*)"/g)].map((match) => match[1]), ZOOMS);
    assert.deepStrictEqual([...zoom.matchAll(/>([^<]+)</g)].map((match) => match[1]), ['Fit', '50%', '100%', '200%']);
    assert.ok(ZOOMS.includes(TOOLBAR_SETTINGS.zoom.fallback));
  });
});
