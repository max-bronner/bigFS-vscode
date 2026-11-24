import * as assert from 'assert';
import type * as vscode from 'vscode';
import { readSettingsBlock } from '../../core/settingsBlock';
import { createPreviewSettingsStore } from '../../platform/webview/createPreviewSettingsStore';
import type { PreviewKind } from '../../platform/webview/createPreviewSettingsStore';
import { createPreviewSettings, readSettings } from '../../webview/shared/createPreviewSettings';
import { VIEWER_SECTION, VIEWER_SETTINGS } from '../../webview/shared/viewer/viewerSettings';
import { PARTICLE_PAGE_SETTINGS } from '../../webview/particles/pageSettings';

const createMemento = (): vscode.Memento => {
  const values = new Map<string, unknown>();

  return {
    keys: () => [...values.keys()],
    get: (key: string, fallback?: unknown) => (values.has(key) ? values.get(key) : fallback),
    update: (key: string, value: unknown) => {
      values.set(key, value);
      return Promise.resolve();
    },
  } as vscode.Memento;
};

const openPage = (state: vscode.Memento, kind: PreviewKind) => {
  const store = createPreviewSettingsStore(state, kind);
  const block = store.renderBlock();
  const settings = createPreviewSettings(
    readSettingsBlock(/>(.*)<\/script>$/s.exec(block)?.[1]),
    (kept) => void store.keep(kept),
  );

  return { block, viewer: settings.section(VIEWER_SECTION, VIEWER_SETTINGS) };
};

suite('Preview settings', () => {
  test('a setting changed on one page opens the next page of its kind, and no other kind', () => {
    const state = createMemento();

    openPage(state, 'model').viewer.set('grid', false);

    assert.strictEqual(openPage(state, 'model').viewer.values.grid, false);
    assert.strictEqual(openPage(state, 'object').viewer.values.grid, true);
  });

  test('only the settings a section names are kept, so nothing of the file on show rides along', () => {
    const state = createMemento();
    const store = createPreviewSettingsStore(state, 'object');
    let sent: Record<string, unknown> = {};

    void store.keep({ viewer: { grid: false, clip: 'walk', appearance: { upgrades: ['x'] } } });
    createPreviewSettings({ viewer: { clip: 'walk' } }, (kept) => (sent = kept))
      .section(VIEWER_SECTION, VIEWER_SETTINGS)
      .set('sky', '#000000');

    assert.deepStrictEqual(Object.keys(sent.viewer as object).sort(), Object.keys(VIEWER_SETTINGS).sort());
    assert.strictEqual('clip' in openPage(state, 'object').viewer.values, false);
  });

  test('a kept value of an older or broken shape falls back to its default', () => {
    const defaults = readSettings(undefined, VIEWER_SETTINGS);

    assert.deepStrictEqual(
      readSettings({ grid: 'no', speed: 3, sky: 'red', lod: -1, bones: 'yes', house: '2' }, VIEWER_SETTINGS),
      { ...defaults, house: '2' },
    );
    assert.deepStrictEqual(readSettings(['grid'], VIEWER_SETTINGS), defaults);
    assert.strictEqual(readSettingsBlock('{"viewer": '), undefined);

    const state = createMemento();

    void state.update('bigfs.previewSettings.model', { viewer: { sky: '</script><b>' } });
    assert.strictEqual(openPage(state, 'model').block.split('</script>').length, 2);
  });

  test('emitter shapes are off on a first effect, and on once turned on', () => {
    assert.strictEqual(readSettings(undefined, PARTICLE_PAGE_SETTINGS).emitterShapes, false);
    assert.strictEqual(readSettings({ emitterShapes: true }, PARTICLE_PAGE_SETTINGS).emitterShapes, true);
  });
});
