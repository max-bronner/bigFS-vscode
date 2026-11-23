import { answerSoundRequest } from '../../platform/webview/answerSoundRequest';
import * as vscode from 'vscode';
import { readWorkspaceText } from '../../services/ini/workspaceText';
import type { EntryLocator } from '../../services/entryLocator';
import { applyValueEdits, findNumericFields, computeValueEdits } from '../../formats/particles/particleValueEdits';
import { findParticleDefinitions } from '../../formats/particles/particleDefinitions';
import { readFxList, readParticleDef } from '../../formats/particles/particleIni';
import type { FxListDef } from '../../formats/particles/particleIni';
import type { IniDefinition } from '../../formats/particles/particleDefinitions';
import type { ParticleDef } from '../../formats/particles/particleDef';
import { computeKeyEdits } from '../../formats/particles/particleKeys';
import type { ModelScene } from '../../formats/w3d/w3dScene';
import { buildW3dScene } from '../../formats/w3d/w3dScene';
import { decodePng } from '../../node/png';
import { createToolRegistry } from '../../core/toolRegistry';
import { duplicateDefinition } from '../../game/objects/duplicateDefinition';
import type { KeyKind, KeyValue } from '../../formats/particles/particleKeys';
import { renderWebviewPage } from '../../platform/webview/webviewPage';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';
import { EffectLibrary } from '../../services/effectLibrary';
import { createSingletonPanel } from '../../platform/webview/singletonPanel';
import { DISCLOSURE_ROW_STYLE } from '../../platform/webview/disclosureRowStyle';
import { registerCommand } from '../../platform/commands';
import { describeError } from '../../core/errors';

const findDefinitionAt = (
  definitions: IniDefinition[],
  line: number,
): IniDefinition | undefined =>
  definitions.find(
    (definition) => definition.startLine <= line && line <= definition.endLine,
  );

interface FromParticlePage {
  kind?: string;
  id?: string;
  value?: number;
  line?: number;
  frame?: number;
  systems?: number;
  particles?: number;
  keyKind?: KeyKind;
  values?: Record<string, number>;
  on?: boolean;
  name?: string;
  keys?: KeyValue[];
  isOpen?: boolean;
}

const SETTINGS_OPEN_KEY = 'bigfs.particlePreview.viewerSettingsOpen';

const createParticlePreview = (
  context: vscode.ExtensionContext,
  index: SageIniIndex,
  locator: EntryLocator | undefined,
  uri: vscode.Uri,
  name: string,
  onClose: () => void,
) => {
  const values = new Map<string, number>();
  const library = new EffectLibrary(index, locator, uri);
  const scripts = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
  let restartNext = true;
  let comparing = false;
  let updating: Promise<void> = Promise.resolve();
  let queued = false;
  let lastScene: Record<string, unknown> | undefined;
  let lastStatus:
    | { frame: number; systems: number; particles: number }
    | undefined;

  const panel = createSingletonPanel<FromParticlePage>({
    viewType: 'bigfs.particlePreview',
    title: `Particles: ${name}`,
    column: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    options: {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [scripts],
    },
    render: ({ webview }) => {
      webview.html = renderParticlePage(
        webview.cspSource,
        webview
          .asWebviewUri(vscode.Uri.joinPath(scripts, 'particles.js'))
          .toString(),
        {
          isObject: false,
          isSettingsOpen: context.globalState.get<boolean>(SETTINGS_OPEN_KEY) === true,
        },
      );
      return [
        vscode.workspace.onDidChangeTextDocument((event) => {
          if (event.document.uri.toString() === uri.toString()) {
            update();
          }
        }),
      ];
    },
    onMessage: (message): Promise<unknown> =>
      receive(message).catch((error: unknown) =>
        panel.post({ kind: 'notice', message: describeError(error) }),
      ),
    onDispose: onClose,
  });

  const restart = (): void => {
    restartNext = true;
    update();
  };

  const receive = async (message: FromParticlePage): Promise<void> => {
    switch (message?.kind) {
      case 'status':
        lastStatus = {
          frame: Number(message.frame),
          systems: Number(message.systems),
          particles: Number(message.particles),
        };
        break;
      case 'ready':
        restart();
        break;
      case 'set':
        if (message.id && Number.isFinite(message.value)) {
          values.set(message.id, Number(message.value));
          update();
        }
        break;
      case 'setMany':
        for (const [id, value] of Object.entries(message.values ?? {})) {
          if (Number.isFinite(value)) {
            values.set(id, Number(value));
          }
        }
        update();
        break;
      case 'compare':
        comparing = !!message.on;
        restartNext = true;
        update();
        break;
      case 'pickModel':
        await pickModel();
        break;
      case 'variant':
        await saveVariant(message.name);
        break;
      case 'reset':
        values.clear();
        update();
        break;
      case 'setViewerSettingsOpen':
        await context.globalState.update(SETTINGS_OPEN_KEY, !!message.isOpen);
        break;
      case 'apply':
        await apply();
        break;
      case 'keys':
        if (
          (message.keyKind === 'Color' || message.keyKind === 'Alpha') &&
          Array.isArray(message.keys)
        ) {
          await apply({ kind: message.keyKind, keys: message.keys });
        }
        break;
      case 'playSound':
        await answerSoundRequest(message, uri, panel.post);
        break;
      case 'reveal': {
        const editor = await vscode.window.showTextDocument(uri, {
          viewColumn: vscode.ViewColumn.One,
        });
        const position = new vscode.Position(Number(message.line) || 0, 0);

        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
        break;
      }
    }
  };

  const readRootDefinition = async (): Promise<
    { definition: IniDefinition; text: string } | undefined
  > => {
    const text = await readWorkspaceText(uri);
    const definition = findParticleDefinitions(text).find(
      (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
    );

    return definition && { definition, text };
  };

  const apply = async (keys?: {
    kind: KeyKind;
    keys: KeyValue[];
  }): Promise<void> => {
    const root = await readRootDefinition();

    if (!root || (!values.size && !keys)) {
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    const newline = /\r\n/.test(root.text) ? '\r\n' : '\n';
    const rewritten = keys
      ? computeKeyEdits(root.text, root.definition, keys.kind, keys.keys)
      : [];
    const replaced = new Set(
      rewritten.flatMap((change) =>
        Array.from({ length: change.remove }, (_, at) => change.line + at),
      ),
    );

    for (const change of rewritten) {
      edit.replace(
        uri,
        new vscode.Range(change.line, 0, change.line + change.remove, 0),
        change.insert.map((line) => line + newline).join(''),
      );
    }
    for (const change of computeValueEdits(root.definition, values).filter(
      (each) => !replaced.has(each.line),
    )) {
      edit.replace(
        uri,
        new vscode.Range(change.line, change.start, change.line, change.end),
        change.text,
      );
    }
    values.clear();
    await vscode.workspace.applyEdit(edit);
  };

  const pickModel = async (): Promise<void> => {
    if (!locator) {
      return;
    }

    const names = await locator.findNames(
      (name) => name.endsWith('.w3d') && !name.endsWith('_skl.w3d'),
      '**/*.w3d',
      uri,
    );
    const picked = await vscode.window.showQuickPick(
      [
        { label: 'No model', name: undefined },
        ...names.map((name) => ({ label: name, name })),
      ],
      { placeHolder: 'A model to show the effect on, at one of its bones' },
    );

    if (!picked) {
      return;
    }

    let model: { name: string; scene: ModelScene } | undefined;

    if (picked.name) {
      const bytes = await locator.read(picked.name, uri);

      if (!bytes) {
        throw new Error(`${picked.name} could not be read`);
      }
      model = {
        name: picked.name,
        scene: await buildW3dScene(
          bytes,
          (fileName) => locator!.read(fileName, uri),
          createToolRegistry(),
          decodePng,
        ),
      };
    }
    await panel.post({ kind: 'model', model });
  };

  const saveVariant = async (given?: string): Promise<void> => {
    const root = await readRootDefinition();

    if (!root) {
      return;
    }

    const variantName =
      given ??
      (await vscode.window.showInputBox({
        prompt: `Name of the variant of ${name}, with the values in the preview`,
        value: `${name}_Variant`,
        validateInput: (value) =>
          /^[A-Za-z0-9_]+$/.test(value)
            ? undefined
            : 'One word: letters, digits and _',
      }));

    if (!variantName) {
      return;
    }

    const lines = applyValueEdits(
      root.text,
      computeValueEdits(root.definition, values),
    ).split(/\r?\n/);
    const copy = duplicateDefinition(
      lines,
      root.definition.startLine,
      root.definition.endLine,
      variantName,
    );
    const document = await vscode.workspace.openTextDocument(uri);
    const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
    const edit = new vscode.WorkspaceEdit();

    edit.insert(
      uri,
      document.lineAt(root.definition.endLine).range.end,
      `${eol}${eol}${copy.lines.join(eol)}`,
    );
    values.clear();
    await vscode.workspace.applyEdit(edit);
    void vscode.window.showInformationMessage(
      `${variantName} written after ${name}; ${name} keeps its values`,
    );
  };

  const update = (): void => {
    if (queued) {
      return;
    }
    queued = true;
    updating = updating
      .then(() => {
        queued = false;
        return send();
      })
      .catch(async (error: unknown) => {
        await panel.post({
          kind: 'notice',
          message: describeError(error),
        });
      });
  };

  const readParticleBudgets = async (): Promise<{ lod: string; max: number }[]> => {
    const budgets: { lod: string; max: number }[] = [];

    for (const name of index.getNames('StaticGameLOD')) {
      const [place] = index.findDefinitions('StaticGameLOD', name);

      if (!place) {
        continue;
      }

      const lines = (await readWorkspaceText(place.uri))
        .split(/\r?\n/)
        .slice(place.line + 1, place.endLine);
      const max = lines
        .map((line) => /^\s*MaxParticleCount\s*=\s*(\d+)/i.exec(line))
        .find(Boolean)?.[1];

      if (max !== undefined) {
        budgets.push({ lod: name, max: Number(max) });
      }
    }
    return budgets.sort((a, b) => a.max - b.max);
  };

  const send = async (): Promise<void> => {
    await index.whenReady();

    const root = await readRootDefinition();

    if (!root) {
      await panel.post({
        kind: 'notice',
        message: `${name} is no longer in the file`,
      });
      return;
    }

    const text = comparing
      ? root.text
      : applyValueEdits(root.text, computeValueEdits(root.definition, values));
    const definition = findParticleDefinitions(text).find(
      (candidate) => candidate.startLine === root.definition.startLine,
    )!;
    const previewed = (
      definition.keyword === 'FXList'
        ? readFxList(definition)
        : readParticleDef(definition)
    ) as ParticleDef | FxListDef;
    const { systems, fxLists, textures, notes } = await library.collect(
      [previewed],
      [],
      text,
    );

    lastScene = {
      kind: 'scene',
      restart: restartNext,
      root: {
        kind: definition.keyword === 'FXList' ? 'fxList' : 'system',
        name: definition.name,
        line: definition.startLine,
      },
      systems,
      fxLists,
      textures,
      notes,
      fields: findNumericFields(root.definition),
      values: Object.fromEntries(values),
      comparing: comparing,
      budgets: await readParticleBudgets(),
    };
    await panel.post(lastScene);
    restartNext = false;
  };

  const show = (): void => {
    const opened = panel.isOpen();

    panel.show({ preserveFocus: true });
    if (opened) {
      restart();
    }
  };

  return {
    show,
    receive,
    settled: () => updating,
    dispose: panel.dispose,
    get lastScene() {
      return lastScene;
    },
    get lastStatus() {
      return lastStatus;
    },
  };
};

type ParticlePreview = ReturnType<typeof createParticlePreview>;

const openParticlePreviews = new Map<string, ParticlePreview>();

const showParticlePreview = (
  context: vscode.ExtensionContext,
  index: SageIniIndex,
  locator: EntryLocator | undefined,
  uri: vscode.Uri,
  name: string,
): ParticlePreview => {
  const key = `${uri.toString()}#${name.toLowerCase()}`;
  const preview =
    openParticlePreviews.get(key) ??
    createParticlePreview(context, index, locator, uri, name, () =>
      openParticlePreviews.delete(key),
    );

  openParticlePreviews.set(key, preview);
  preview.show();
  return preview;
};

export interface ParticlePageOptions {
  isObject: boolean;
  isSettingsOpen: boolean;
}

export const renderParticlePage = (
  source: string,
  script: string,
  { isObject, isSettingsOpen }: ParticlePageOptions,
): string =>
  renderWebviewPage({
    allow: { img: 'data:', script: source },
    scriptFiles: [script],
    style: `
html, body { height: 100%; margin: 0; overflow: hidden; color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); }
#viewer { height: 100%; }
canvas { width: 100%; height: 100%; display: block; cursor: grab; }
#hud { position: absolute; left: 8px; top: 6px; font: 11px var(--vscode-editor-font-family); color: #ddd; text-shadow: 0 1px 2px #000; pointer-events: none; white-space: pre; }
h3 { margin: 12px 0 4px; font-size: 11px; text-transform: uppercase; opacity: 0.75; }
.row { display: flex; gap: 6px; align-items: center; margin: 3px 0; flex-wrap: wrap; }
button, select, input { font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); }
button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 2px 8px; cursor: pointer; }
button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.field { display: grid; grid-template-columns: 112px 1fr 64px; gap: 4px; align-items: center; margin: 2px 0; }
.field label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.field.changed label { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); font-weight: 600; }
.field input[type=number] { width: 60px; }
#scaleSpace, #scaleTime, #varyAmount { width: 52px; }
button.on { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.field input[type=range] { width: 100%; }
#handles { position: absolute; inset: 0; pointer-events: none; cursor: default; }
#flash { position: absolute; inset: 0; pointer-events: none; }
#notes div { opacity: 0.8; margin: 2px 0; }
.stats-lines { white-space: pre-wrap; overflow-wrap: anywhere; font: 11px var(--vscode-editor-font-family); }
.stats-table { border-collapse: collapse; font-size: 11px; margin-top: 4px; }
.stats-table td { padding: 1px 6px 1px 0; }
.stats-table thead td { opacity: 0.7; }
#stats .over { color: var(--vscode-errorForeground, #f66); }
#stats .within { color: var(--vscode-testing-iconPassed, #73c991); }
#stats .row span { margin-left: 4px; }
.curve { display: block; max-width: 100%; margin: 2px 0 4px; cursor: crosshair; touch-action: none; }
.curve-heading { margin: 8px 0 2px; font-weight: 600; }
.curve-heading .muted { font-weight: normal; font-size: 11px; }
#curves input[type=number] { width: 52px; }
#curves input[type=color] { width: 36px; height: 20px; padding: 0; }
#notice { color: var(--vscode-errorForeground); }
.muted { opacity: 0.7; }
#objectAppearance label, #objectAppearance summary { overflow-wrap: anywhere; min-width: 0; }
.appearance-group { margin: 2px 0; }
.appearance-group > summary { cursor: pointer; padding: 2px 0; }
.appearance-value { float: right; max-width: 55%; opacity: 0.7; text-align: right; }
.appearance-option { display: flex; gap: 5px; align-items: flex-start; margin: 2px 0 2px 14px; }
.appearance-option > input { flex: none; }
.appearance-group > select { margin-left: 14px; }
.appearance-note { display: block; font-size: 11px; opacity: 0.7; }
#objectAppearanceReset { margin-top: 5px; }
#objectAppearanceReset:disabled { display: none; }
#objectRandomTexture { max-width: 100%; }
.state-group > summary, .effect-rest > summary, .effect-occasion > summary { cursor: pointer; padding: 2px 0; overflow-wrap: anywhere; }
.state-row { display: block; box-sizing: border-box; width: 100%; margin: 1px 0; padding: 3px 6px; border: none; border-radius: 2px; text-align: left; color: inherit; background: none; }
.state-group > .state-row { padding-left: 18px; }
.state-row:hover { background: var(--vscode-list-hoverBackground); }
.state-row[aria-pressed="true"] { color: var(--vscode-list-activeSelectionForeground); background: var(--vscode-list-activeSelectionBackground); }
.state-title, .state-detail { display: block; overflow-wrap: anywhere; }
.state-title::first-letter { text-transform: uppercase; }
.state-detail, .effect-detail { font-size: 11px; opacity: 0.7; }
.effect { display: flex; gap: 4px; align-items: flex-start; margin: 2px 0; }
.effect > input { flex: none; }
.effect-text > span { display: block; overflow-wrap: anywhere; }
.effect-rest { margin-top: 4px; }
.effect-occasion { margin-left: 10px; }
.voice-group { margin: 2px 0; }
.voice-group > summary { cursor: pointer; padding: 2px 0; }
.voice { display: flex; gap: 6px; align-items: center; margin: 2px 0 2px 12px; }
.voice > button { flex: none; width: 26px; }
.voice-text { min-width: 0; }
.voice-name { font-size: 11px; overflow-wrap: anywhere; }
.ability-group { margin: 2px 0; }
.ability-group > summary { cursor: pointer; padding: 2px 0; }
.ability { display: flex; gap: 6px; align-items: flex-start; margin: 3px 0 3px 12px; }
.ability-play { flex: none; width: 26px; }
.ability-play[aria-pressed="true"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.ability-text { min-width: 0; }
.ability-title { overflow-wrap: anywhere; }
.ability-trigger, .ability-effects, .ability-sound { font-size: 11px; overflow-wrap: anywhere; }
.ability-effects > summary { cursor: pointer; opacity: 0.8; }
.ability-effect > span { display: block; }
.ability-effect { margin: 2px 0 2px 12px; }
.ability-sound { display: flex; gap: 4px; align-items: center; margin-top: 2px; }
.ability-sound > button { flex: none; width: 22px; padding: 0 2px; }
${DISCLOSURE_ROW_STYLE}
.panel-filter { width: 100%; box-sizing: border-box; margin-bottom: 4px; padding: 3px 5px; }
.panel-filter[hidden] { display: none; }
.composition-group { margin: 2px 0; }
.composition-source, .composition-binding { display: block; font-size: 11px; }
.composition-part, .composition-sub { padding-left: 4px; }
.composition-group .disclosure-members > .muted { padding-left: 4px; margin-top: 2px; }
kbd { font-size: 10px; opacity: 0.7; }
#context, #context > * { min-width: 0; }
.preview-object .effect-only, .preview-effect .object-only { display: none !important; }
#header { padding-bottom: 4px; }
.preview-effect #header { position: sticky; top: -8px; z-index: 1; margin-top: -8px; padding-top: 8px; background: var(--vscode-sideBar-background, #fff); border-bottom: 1px solid var(--vscode-panel-border); }
#title { overflow-wrap: anywhere; }
#objectSource { font-size: 11px; overflow-wrap: anywhere; }
#objectSource:empty, #objectKind:empty { display: none; }
.section-count { margin-left: 6px; padding: 0 6px; border-radius: 9px; font-size: 11px; font-weight: normal; color: var(--vscode-badge-foreground, #fff); background: var(--vscode-badge-background, #616161); }
.section-count:empty { display: none; }
.section-hint { font-size: 11px; font-weight: normal; }
.look-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 2px; }
.look-chips:empty { display: none; }
.look-chip { padding: 1px 8px; border: 1px solid var(--vscode-panel-border, #8886); border-radius: 10px; font-size: 11px; color: inherit; background: none; cursor: pointer; }
.look-chip:hover { background: var(--vscode-list-hoverBackground); }
.look-chip > b { font-weight: 600; }
.state-advanced { margin-top: 6px; }
.state-advanced > summary { cursor: pointer; padding: 2px 0; opacity: 0.8; }
.state-advanced > .state-group { margin-left: 10px; }
.see-also { margin-left: 6px; padding: 0 4px; border: none; font-size: 11px; color: var(--vscode-textLink-foreground, #3794ff); background: none; cursor: pointer; }
.see-also:hover { text-decoration: underline; }
.ini-name { font-family: var(--vscode-editor-font-family); font-size: 11px; opacity: 0.7; }
.effect-count { opacity: 0.7; font-size: 11px; }
#objectLoading { margin: 8px 0; }
`,
    body: `<div id="viewer" data-settings-open="${isSettingsOpen}"></div>
<canvas id="handles"></canvas><div id="flash"></div><div id="hud"></div>
<div id="context" class="${isObject ? 'preview-object' : 'preview-effect'}">
  <div id="header">
    <div class="row"><strong id="title"></strong><span id="objectKind" class="muted object-only"></span></div>
    <div id="objectSource" class="muted object-only"></div>
    <div class="row object-only">
      <button id="revealDefinition" title="Open the INI at the object's header" hidden>Go to definition</button>
      <button id="effectiveDefinition" title="The object as the game builds it from its parent, read-only" hidden>Effective definition</button>
      <button id="objectAppearanceReset" title="Back to the object as it is created: no upgrade, no damage, normal weather">Reset look</button>
    </div>
    <div id="lookChips" class="look-chips object-only" aria-label="The look shown"></div>
    <div class="row effect-only"><button id="apply" class="primary" disabled title="Write the changed values into the block, as one edit">Apply to INI</button><button id="reset" disabled title="Forget the changed values">Reset</button><span id="pendingCount" class="muted"></span></div>
  </div>
  <div id="notice"></div>
  <div id="objectLoading" class="muted object-only">Loading the object…</div>
  <div id="object" hidden>
    <details class="viewer-section" open hidden id="objectAppearanceSection"><summary>Appearance</summary>
      <div id="objectAppearance"></div>
    </details>
    <details class="viewer-section" open id="objectStatesSection"><summary>State and animation<span id="objectStatesCount" class="section-count"></span></summary>
      <input id="objectStateFilter" class="panel-filter" type="search" placeholder="Search states, animations and effects">
      <div id="objectStates"></div>
      <div id="objectNotice" class="muted"></div>
      <div id="objectParts" class="muted"></div>
    </details>
    <details class="viewer-section" open hidden id="objectEffectsSection"><summary>Effects<span id="objectEffectsCount" class="section-count"></span> <span class="muted section-hint">playing now</span></summary>
      <div id="objectElements"></div>
    </details>
    <details class="viewer-section" hidden id="objectAbilitiesSection"><summary>Abilities and effects<span id="objectAbilitiesCount" class="section-count"></span> <span class="muted section-hint">all it can play</span></summary>
      <input id="objectAbilityFilter" class="panel-filter" type="search" placeholder="Filter abilities, weapons and effects">
      <div id="objectAbilities"></div>
    </details>
    <details class="viewer-section" open hidden id="objectCompositionSection"><summary>Composition<span id="objectCompositionCount" class="section-count"></span></summary>
      <div id="objectComposition"></div>
    </details>
    <details class="viewer-section" hidden id="objectVoicesSection"><summary>Voices<span id="objectVoicesCount" class="section-count"></span></summary>
      <input id="objectVoiceFilter" class="panel-filter" type="search" placeholder="Filter voices and sounds">
      <div id="objectVoices"></div>
    </details>
  </div>
  <details class="viewer-section effect-only" open id="effectView"><summary>Emitter</summary>
    <div class="row">
      <label title="The shape particles are born in; drag its yellow handles to size it"><input type="checkbox" id="showVolume" checked> Show the emitter's shape</label>
    </div>
    <div class="row">
      <button id="pickModel" title="Show the effect on a model, started at one of its bones">On a model…</button> <select id="bone" hidden></select>
    </div>
  </details>
  <div id="editing" class="effect-only">
  <details class="viewer-section" open><summary>Timeline and curves</summary>
    <div id="timeline"></div>
    <div id="curves"></div>
  </details>
  <details class="viewer-section" open><summary>Values <span class="muted section-hint">preview only until applied</span></summary>
  <div class="row" title="Scales every length, speed and duration together, so the effect stays the same effect: previewed until applied">Scale: size × <input id="scaleSpace" type="number" value="1" step="0.1" min="0.05"> time × <input id="scaleTime" type="number" value="1" step="0.1" min="0.05"> <button id="scale">Scale</button></div>
  <div class="row"><button id="compare" title="Show the block as written, then with the values here, to compare (C)">A/B: as written</button> <button id="vary" title="Nudge every value up to the amount either way, to try variations">Vary ±</button><input id="varyAmount" type="number" value="15" step="5" min="1">% <button id="variant" title="Write the values here as a new system after this one; this one keeps its values">Save as variant…</button></div>
  <div id="fields"></div>
  </details>
  </div>
</div>
<details class="viewer-section" id="loadSection"><summary>Particle load <span class="muted section-hint">how heavy the effects are</span></summary>
  <div id="stats"></div>
  <div id="notes"></div>
</details>`,
  });

const createParticleLensProvider = (): vscode.CodeLensProvider => ({
  provideCodeLenses(document) {
    return findParticleDefinitions(document.getText()).map(
      (definition) =>
        new vscode.CodeLens(
          new vscode.Range(definition.startLine, 0, definition.startLine, 0),
          {
            title:
              definition.keyword === 'FXList'
                ? '▶ Preview FX list'
                : '▶ Preview particle system',
            command: 'bigfs.previewParticles',
            arguments: [document.uri, definition.name],
          },
        ),
    );
  },
});

export const registerParticlePreview = (
  context: vscode.ExtensionContext,
  selector: vscode.DocumentSelector,
  index: SageIniIndex,
  locator: EntryLocator | undefined,
): vscode.Disposable[] => [
  vscode.languages.registerCodeLensProvider(
    selector,
    createParticleLensProvider(),
  ),
  registerCommand(
    'bigfs.previewParticles',
    (uri?: vscode.Uri, name?: string) => {
      const editor = vscode.window.activeTextEditor;

      if (!uri || !name) {
        const found =
          editor &&
          findDefinitionAt(
            findParticleDefinitions(editor.document.getText()),
            editor.selection.active.line,
          );

        if (!editor || !found) {
          void vscode.window.showInformationMessage(
            'Put the cursor inside an FXParticleSystem, ParticleSystem or FXList block',
          );
          return;
        }
        uri = editor.document.uri;
        name = found.name;
      }
      return showParticlePreview(context, index, locator, uri, name);
    },
  ),
];
