import * as vscode from 'vscode';
import type { EntryLocator } from '../../services/entryLocator';
import { createDebouncer } from '../../core/debounce';
import { createSingletonPanel } from '../../platform/webview/singletonPanel';
import {
  findAnimation,
  parseW3dAnimations,
} from '../../formats/w3d/w3dAnimation';
import { buildW3dScene, loadSkeleton } from '../../formats/w3d/w3dScene';
import { decodePng } from '../../node/png';
import { createToolRegistry } from '../../core/toolRegistry';
import { EffectLibrary } from '../../services/effectLibrary';
import { composeEffectiveObject } from '../../services/ini/effectiveObject';
import { findSceneFocus, readObjectScene } from '../../game/objects/objectScene';
import { readCreatedSubObjects } from '../../game/objects/subObjectScripts';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import type { SageDocument } from '../../formats/ini/sageIniParser';
import { renderParticlePage } from './particlePreview';
import type { SageIniDocuments } from '../../services/ini/sageIniDocuments';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';
import { readWorkspaceText } from '../../services/ini/workspaceText';
import type { FromPage, ToPage } from '../../webview/particles/protocol';
import { registerCommand } from '../../platform/commands';
import { describeError } from '../../core/errors';

const TEMPLATE = /^(object|childobject|objectreskin)$/i;
const STATE =
  /^\s*(Default)?(Model)?ConditionState\b|^\s*(Idle)?AnimationState\b|^\s*TransitionState\b/i;
const MAX_EFFECT_REFERENCES = 512;

const findObjectAt = (parsed: SageDocument, line: number) =>
  parsed.blocks.find(
    (block) =>
      TEMPLATE.test(block.keyword) &&
      block.startLine <= line &&
      line <= block.endLine,
  );

const findObjectNamed = (parsed: SageDocument, name: string) =>
  parsed.blocks.find(
    (block) =>
      TEMPLATE.test(block.keyword) &&
      block.name?.split(/\s+/)[0].toLowerCase() === name.toLowerCase(),
  );

const REDRAW_DELAY = 300;

const toNotice = (error: unknown): ToPage => ({
  kind: 'notice',
  message: describeError(error),
});

const createObjectPreview = (
  context: vscode.ExtensionContext,
  documents: SageIniDocuments,
  index: SageIniIndex,
  locator: EntryLocator | undefined,
  uri: vscode.Uri,
  name: string,
  onClose: () => void,
) => {
  const library = new EffectLibrary(index, locator, uri);
  const tools = createToolRegistry();
  const scripts = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
  let focusOffset = 0;
  let isReady = false;

  const redrawSoon = createDebouncer(() => {
    send().catch((error: unknown) => panel.post(toNotice(error)));
  }, REDRAW_DELAY);

  const panel = createSingletonPanel<FromPage, ToPage>({
    viewType: 'bigfs.objectPreview',
    title: `Object: ${name}`,
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
      );
      return [
        vscode.workspace.onDidChangeTextDocument((event) => {
          if (isReady && event.document.languageId === 'sage-ini') {
            redrawSoon.schedule();
          }
        }),
        { dispose: redrawSoon.cancel },
      ];
    },
    onMessage: (message): Promise<unknown> =>
      receive(message).catch((error: unknown) => panel.post(toNotice(error))),
    onDispose: () => {
      isReady = false;
      onClose();
    },
  });

  const receive = async (message: FromPage): Promise<void> => {
    switch (message.kind) {
      case 'ready':
        isReady = true;
        await send();
        break;
      case 'loadModel':
        await sendModel(message.name);
        break;
      case 'loadAnimation':
        await sendAnimation(message.name);
        break;
    }
  };

  const send = async (): Promise<void> => {
    const schema = await documents.getSchema();
    const source = parseSageIni(
      (await readWorkspaceText(uri)).split(/\r?\n/),
      schema,
    );
    const header = findObjectNamed(source, name)?.startLine;
    const composed =
      header === undefined
        ? undefined
        : await composeEffectiveObject(documents, index, uri, header);

    if (header === undefined || composed === undefined) {
      await panel.post({
        kind: 'notice',
        message: 'The object is no longer where it was',
      });
      return;
    }
    await index.whenReady();

    const isDefined = (keywords: string[]) => (name: string) =>
      keywords.some(
        (keyword) => index.findDefinitions(keyword, name).length > 0,
      );
    const scene = readObjectScene(
      parseSageIni(composed.split('\n'), schema),
      schema,
      isDefined(['FXList']),
      isDefined(['FXParticleSystem', 'ParticleSystem']),
      composed.split('\n'),
    );

    if (!scene) {
      return;
    }

    if (scene.luaEventLists.length) {
      const [events, scripts] = await Promise.all(
        ['data/scripts/scriptevents.xml', 'data/scripts/scripts.lua'].map(
          (file) => locator?.read(file, uri),
        ),
      );

      if (events && scripts) {
        const latin1 = new TextDecoder('latin1');

        scene.created = readCreatedSubObjects(
          scene.luaEventLists,
          latin1.decode(events),
          latin1.decode(scripts),
        );
      }
    }

    const effects = await library.collect(
      [],
      [
        ...scene.fx.map(({ name }) => ({ name, list: true })),
        ...scene.states.flatMap((state) => [
          ...state.fx.map((name) => ({ name, list: true })),
          ...state.particles.map(({ system }) => ({
            name: system,
            list: false,
          })),
        ]),
      ],
      '',
      MAX_EFFECT_REFERENCES,
    );

    await panel.post({
      kind: 'scene',
      restart: true,
      ...effects,
      fields: [],
      values: {},
      comparing: false,
      budgets: [],
    });
    await panel.post({
      kind: 'object',
      object: scene,
      focus: findSceneFocus(source, header + focusOffset, scene),
    });
  };

  const sendModel = async (name: string): Promise<void> => {
    const file = `${name.replace(/\.w3d$/i, '')}.w3d`;
    const bytes = await locator?.read(file, uri);

    if (!bytes) {
      await panel.post({ kind: 'notice', message: `${file} was not found` });
      return;
    }
    await panel.post({
      kind: 'model',
      model: {
        name: file,
        scene: await buildW3dScene(
          bytes,
          (fileName) => locator!.read(fileName, uri),
          tools,
          decodePng,
        ),
      },
    });
  };

  const sendAnimation = async (clipName: string): Promise<void> => {
    const clip = clipName.slice(clipName.lastIndexOf('.') + 1);
    const bytes = await locator?.read(`${clip}.w3d`, uri);
    const animation = findAnimation(
      bytes ? parseW3dAnimations(bytes) : [],
      clipName,
    );

    await panel.post({
      kind: 'animation',
      name: clipName,
      animation,
      skeleton:
        animation &&
        (await loadSkeleton(
          animation.hierarchyName,
          (fileName) => locator!.read(fileName, uri),
          tools,
        )),
    });
  };

  const show = async (offset: number): Promise<void> => {
    focusOffset = offset;
    panel.show({ preserveFocus: true });
    if (isReady) {
      await send();
    }
  };

  return { show };
};

const openObjectPreviews = new Map<
  string,
  ReturnType<typeof createObjectPreview>
>();

const showObjectPreview = async (
  context: vscode.ExtensionContext,
  documents: SageIniDocuments,
  index: SageIniIndex,
  locator: EntryLocator | undefined,
  uri: vscode.Uri,
  line: number,
): Promise<void> => {
  const parsed = parseSageIni(
    (await readWorkspaceText(uri)).split(/\r?\n/),
    await documents.getSchema(),
  );
  const object = findObjectAt(parsed, line);

  if (!object) {
    void vscode.window.showInformationMessage(
      'Put the cursor inside an Object, ChildObject or ObjectReskin',
    );
    return;
  }

  const name = object.name?.split(/\s+/)[0] ?? 'Object';
  const key = `${uri.toString()}#${name.toLowerCase()}`;
  const preview =
    openObjectPreviews.get(key) ??
    createObjectPreview(context, documents, index, locator, uri, name, () =>
      openObjectPreviews.delete(key),
    );

  openObjectPreviews.set(key, preview);
  await preview.show(line - object.startLine);
};

const createObjectLensProvider = (): vscode.CodeLensProvider => ({
  provideCodeLenses(document) {
    const lenses: vscode.CodeLens[] = [];
    let inObject = false;

    for (let line = 0; line < document.lineCount; line++) {
      const text = document.lineAt(line).text;
      const lens = (title: string) =>
        lenses.push(
          new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
            title,
            command: 'bigfs.previewObject',
            arguments: [document.uri, line],
          }),
        );

      if (/^(Object|ChildObject|ObjectReskin)\s/i.test(text)) {
        inObject = true;
        lens('▶ Preview object');
      } else if (/^End\b/i.test(text)) {
        inObject = false;
      } else if (inObject && STATE.test(text)) {
        lens('▶ Preview state');
      }
    }
    return lenses;
  },
});

const PREVIEWABLE =
  /^\s*(AnimationName|Animation|ParticleSysBone|\w*FX\w*|FXList)\s*=/i;

const createObjectActionProvider = (): vscode.CodeActionProvider => ({
  provideCodeActions(document, range) {
    const line = range.start.line;

    if (!PREVIEWABLE.test(document.lineAt(line).text)) {
      return [];
    }

    const action = new vscode.CodeAction(
      'Preview on the object',
      vscode.CodeActionKind.Empty,
    );

    action.command = {
      title: action.title,
      command: 'bigfs.previewObject',
      arguments: [document.uri, line],
    };
    return [action];
  },
});

export const registerObjectPreview = (
  context: vscode.ExtensionContext,
  selector: vscode.DocumentSelector,
  documents: SageIniDocuments,
  index: SageIniIndex,
  locator: EntryLocator | undefined,
): vscode.Disposable[] => [
  vscode.languages.registerCodeLensProvider(
    selector,
    createObjectLensProvider(),
  ),
  vscode.languages.registerCodeActionsProvider(
    selector,
    createObjectActionProvider(),
  ),
  registerCommand(
    'bigfs.previewObject',
    async (uri?: vscode.Uri, line?: number) => {
      const editor = vscode.window.activeTextEditor;

      uri ??= editor?.document.uri;
      line ??= editor?.selection.active.line;
      if (uri && line !== undefined) {
        await showObjectPreview(context, documents, index, locator, uri, line);
      }
    },
  ),
];
