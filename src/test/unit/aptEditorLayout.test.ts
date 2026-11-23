import * as assert from 'assert';
import type * as vscode from 'vscode';
import { renderAptPage } from '../../features/apt/aptPage';
import type { Character } from '../../formats/apt/aptMovie';
import { listCharacterRows, matchesFilter } from '../../webview/apt/characterGroups';
import type { MenuAction, MenuEntry } from '../../webview/apt/popupMenu';
import { buildTimelineContextMenu, buildTimelineMenus } from '../../webview/apt/timelineMenus';
import type { TimelineMenuContext } from '../../webview/apt/timelineMenus';
import type { TimelineOperation } from '../../formats/apt/aptTimelineEdits';

const page = renderAptPage(
  { cspSource: 'vscode-resource:' } as vscode.Webview,
  { toString: () => 'main.js' } as vscode.Uri,
);

const actions = (entries: MenuEntry[]): MenuAction[] =>
  entries.filter((entry): entry is MenuAction => typeof entry === 'object' && 'run' in entry);

suite('APT editor layout', () => {
  test('the stage toolbar starts with the mode switch and has no mode sentence or text view button', () => {
    const bar = /<div class="toolbar" id="stage-bar">([\s\S]*?)<div id="frame-label"/.exec(page)?.[1] ?? '';

    assert.ok(bar.indexOf('id="mode-inspect"') >= 0 && bar.indexOf('id="mode-inspect"') < bar.indexOf('id="play"'));
    assert.ok(bar.includes('id="mode-interact"'));
    assert.ok(bar.includes('id="overlays"') && bar.includes('id="scripts"') && bar.includes('id="play-from"'));
    assert.ok(!page.includes('id="mode"'));
    assert.ok(!page.includes('toggleTextView'));
    assert.ok(!/type="checkbox"/.test(bar), 'the overlays are in the menu, not checkboxes on the bar');
  });

  test('the right column is tabs, each controlling a panel the page fills', () => {
    const tabs = [...page.matchAll(/role="tab" id="([^"]+)" aria-controls="([^"]+)"/g)].map((match) => [match[1], match[2]]);

    assert.deepStrictEqual(tabs, [
      ['tab-details', 'details'],
      ['tab-inspector', 'inspect'],
      ['tab-engine', 'engine'],
    ]);
    for (const id of ['details', 'inspect', 'inspector', 'atlas', 'engine', 'engine-count', 'kinds']) {
      assert.ok(page.includes(`id="${id}"`), id);
    }
  });

  test('characters are listed under their kind, with the name that tells them apart first', () => {
    const at = { offset: 0 };
    const characters = [
      { id: 0, ...at, type: 'movie' },
      { id: 1, ...at, type: 'sprite', frameCount: 4, framesOffset: 0 },
      { id: 2, ...at, type: 'placeholder' },
      { id: 3, ...at, type: 'placeholder' },
      { id: 4, ...at, type: 'sprite', frameCount: 1, framesOffset: 0 },
      { id: 5, ...at, type: 'editText', variable: 'Title' },
      { id: 6, ...at, type: 'shape' },
    ] as Character[];
    const rows = listCharacterRows(
      {
        name: 'MainMenu',
        characters,
        imports: [
          { movie: 'MenuExport', name: 'GenericButton_Med', character: 2 },
          { movie: 'Lost', name: 'Gone', character: 3 },
        ],
        exports: [{ name: 'MainMenuButtons', character: 4 }],
      },
      (id) => id === 2,
    );

    assert.deepStrictEqual(
      rows.map(({ id, kind, name, detail }) => [id, kind, name, detail]),
      [
        [0, 'exports', 'MainMenu', 'movie'],
        [1, 'sprites', 'Sprite', '4 frames'],
        [2, 'imports', 'GenericButton_Med', 'MenuExport'],
        [3, 'imports', 'Gone', 'Lost (unresolved)'],
        [4, 'exports', 'MainMenuButtons', 'sprite'],
        [5, 'text', 'Title', 'edit text'],
        [6, 'shapes', 'Shape', ''],
      ],
    );
    assert.ok(matchesFilter(rows[2], 'menuexport:generic'));
    assert.ok(matchesFilter(rows[6], '#6'));
    assert.ok(matchesFilter(rows[1], 'sprites'));
    assert.ok(!matchesFilter(rows[1], 'Generic'));
  });

  suite('timeline menus', () => {
    const ran: TimelineOperation[] = [];
    const opened: string[] = [];
    const context = (overrides: Partial<TimelineMenuContext> = {}): TimelineMenuContext => ({
      from: 2,
      to: 5,
      depth: 3,
      frameCount: 10,
      isPlacedAtDepth: true,
      copiedFrom: 'depth 1, frames 0–4',
      nearestPlaced: 1,
      run: (operation) => ran.push(operation),
      openForm: (form) => opened.push(form),
      copyMotion: () => opened.push('copy'),
      pasteMotion: (mirror) => opened.push(`paste ${mirror ?? ''}`.trim()),
      ...overrides,
    });

    test('every timeline tool is in one of the three menus, and all of them in the right-click menu', () => {
      const menus = buildTimelineMenus(context());
      const labels = (entries: MenuEntry[]) => actions(entries).map((each) => each.label);

      assert.deepStrictEqual(labels(menus.frames), ['Insert Frames…', 'Delete Frames', 'Duplicate Frames', 'Reverse', 'Retime…']);
      assert.deepStrictEqual(labels(menus.motion), ['Tween…', 'Formula…', 'Copy Motion', 'Paste Motion', 'Paste Mirrored ↔', 'Paste Mirrored ↕']);
      assert.deepStrictEqual(labels(menus.placement), ['Show', 'Fade Out', 'Remove']);
      assert.deepStrictEqual(labels(buildTimelineContextMenu(menus, () => {})), [
        ...labels(menus.frames),
        ...labels(menus.motion),
        ...labels(menus.placement),
        'Motion Script…',
      ]);
    });

    test('the commands act on the selection they were built for', () => {
      ran.length = 0;
      opened.length = 0;
      for (const action of actions(Object.values(buildTimelineMenus(context())).flat())) {
        action.run();
      }
      assert.deepStrictEqual(opened, ['insert', 'retime', 'tween', 'formula', 'copy', 'paste', 'paste x', 'paste y']);
      assert.deepStrictEqual(ran, [
        { op: 'delete', from: 2, to: 5 },
        { op: 'duplicate', from: 2, to: 5 },
        { op: 'reverse', from: 2, to: 5 },
        { op: 'show', depth: 3, from: 2, to: 5, like: 1 },
        { op: 'hide', depth: 3, from: 2, to: 5, how: 'alpha' },
        { op: 'hide', depth: 3, from: 2, to: 5, how: 'remove' },
      ]);
    });

    test('commands that need a depth, a range or a copied motion are greyed without one', () => {
      const enabled = (menus: ReturnType<typeof buildTimelineMenus>) =>
        actions([...menus.frames, ...menus.motion, ...menus.placement])
          .filter((each) => each.enabled !== false)
          .map((each) => each.label);

      assert.deepStrictEqual(
        enabled(buildTimelineMenus(context({ depth: undefined, isPlacedAtDepth: false, copiedFrom: undefined, nearestPlaced: undefined, from: 4, to: 4 }))),
        ['Insert Frames…', 'Delete Frames', 'Duplicate Frames', 'Retime…'],
      );
      assert.ok(
        !enabled(buildTimelineMenus(context({ from: 0, to: 9 }))).includes('Delete Frames'),
        'every frame selected cannot be deleted',
      );
    });
  });
});
