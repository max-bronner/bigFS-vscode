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
import type { ObjectScene } from '../../game/objects/objectScene';
import { listObjectAbilities } from '../../game/objects/objectAbilities';
import type { AbilityDefinitionKind } from '../../game/objects/objectAbilities';
import { readLevelTables } from '../../game/objects/creationUpgrades';
import { completeObjectScene } from '../../game/objects/completeObjectScene';
import { listModelSubObjects } from '../../game/objects/listModelSubObjects';
import type { PreviewedContext, SceneContext } from '../../game/objects/completeObjectScene';
import { readSunDirection } from '../../game/objects/objectShadows';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import type { SageDocument } from '../../formats/ini/sageIniParser';
import type { SageIniSchema } from '../../formats/ini/sageIniSchema';
import { composeObject } from '../../game/objects/objectComposition';
import { listPreloads } from '../../game/objects/listPreloads';
import { createSceneSender } from '../../formats/w3d/w3dSceneTransfer';
import { createDecodeCache } from '../../node/decodeCache';
import type {
  ComposableObject,
  CompositionSources,
  ObjectComposition,
  PartStatePicks,
} from '../../game/objects/objectComposition';
import type { AppearanceChoice } from '../../game/objects/objectAppearance';
import type { TextureLayers } from '../../formats/w3d/w3dTextureSwaps';
import { getDetailModel } from '../../game/objects/detailModels';
import type { DetailLevel } from '../../game/objects/detailModels';
import { renderParticlePage } from './particlePreview';
import type { SageIniDocuments } from '../../services/ini/sageIniDocuments';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';
import { readWorkspaceText } from '../../services/ini/workspaceText';
import type { FromPage, ToPage } from '../../webview/particles/protocol';
import { registerCommand } from '../../platform/commands';
import { answerSoundRequest } from '../../platform/webview/answerSoundRequest';
import { describeError } from '../../core/errors';

const TEMPLATE = /^(object|childobject|objectreskin)$/i;
const TEMPLATE_KEYWORDS = ['Object', 'ChildObject', 'ObjectReskin'];

const toModelFile = (name: string) => `${name.replace(/\.w3d$/i, '')}.w3d`;
const STATE =
  /^\s*(Default)?(Model)?ConditionState\b|^\s*(Idle)?AnimationState\b|^\s*TransitionState\b/i;
const MAX_DEFINITION_LINES = 256;
const MAX_EFFECT_REFERENCES = 512;
const ABILITY_KEYWORDS: Record<AbilityDefinitionKind, string[]> = {
  FXList: ['FXList'],
  ParticleSystem: ['FXParticleSystem', 'ParticleSystem'],
  ObjectCreationList: ['ObjectCreationList'],
  Weapon: ['Weapon'],
  ModifierList: ['ModifierList'],
  Object: TEMPLATE_KEYWORDS,
};

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

interface PreviewContext extends SceneContext {
  objects: Map<string, Promise<ComposableObject | undefined>>;
  subObjects: Map<string, Promise<readonly string[] | undefined>>;
}

const GROUND_COLOUR_KEY = 'bigfs.objectPreview.groundColour';
const SETTINGS_OPEN_KEY = 'bigfs.objectPreview.viewerSettingsOpen';
const COLOUR = /^#[0-9a-f]{6}$/i;

const PREVIEWED_FILES = '**/*.{w3d,W3D,dds,DDS,tga,TGA}';
const MAX_PLANNED_CHOICES = 64;

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
  const { globalState } = context;
  let focusOffset = 0;
  let isReady = false;
  let compositionGeneration = 0;
  let abilitiesGeneration = 0;
  let sentEffects = new Set<string>();
  let shownConditions: readonly string[] = [];
  let partStates: PartStatePicks = {};
  let appearance: AppearanceChoice = {};
  const decoding = createDecodeCache(tools, decodePng);
  const sender = createSceneSender(decoding.getDigest);
  let filesRevision = locator?.revision;
  let planGeneration = 0;
  let lastComposed: { schema: SageIniSchema; context: PreviewContext; object: ComposableObject } | undefined;

  const redrawSoon = createDebouncer(() => {
    send().catch((error: unknown) => panel.post(toNotice(error)));
  }, REDRAW_DELAY);
  const forgetSoon = createDebouncer(() => {
    sentEffects = new Set();
    filesRevision = locator?.revision;
    library.forgetTextures();
    sender.reset();
    void panel.post({ kind: 'forgetModels' });
  }, REDRAW_DELAY);
  const forgetIfChanged = async () => {
    if (locator && locator.revision !== filesRevision) {
      sentEffects = new Set();
      filesRevision = locator.revision;
      sender.reset();
      await panel.post({ kind: 'forgetModels' });
    }
  };

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
        { isObject: true, isSettingsOpen: globalState.get<boolean>(SETTINGS_OPEN_KEY) === true },
      );
      const files = vscode.workspace.createFileSystemWatcher(PREVIEWED_FILES);

      return [
        files,
        files.onDidChange(() => forgetSoon.schedule()),
        files.onDidCreate(() => forgetSoon.schedule()),
        files.onDidDelete(() => forgetSoon.schedule()),
        { dispose: forgetSoon.cancel },
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
      compositionGeneration++;
      abilitiesGeneration++;
      planGeneration++;
      onClose();
    },
  });

  const receive = async (message: FromPage): Promise<void> => {
    switch (message.kind) {
      case 'ready':
        isReady = true;
        sender.reset();
        appearance = {};
        shownConditions = [];
        partStates = {};
        await send();
        break;
      case 'loadAnimation':
        await panel.post({
          kind: 'animation',
          ...(await readAnimation(message.name)),
        });
        break;
      case 'loadPartModel':
        await sendModel(message.name, message.textures, message.detail);
        break;
      case 'planPreload':
        await sendPreloadPlan(message.choices.slice(0, MAX_PLANNED_CHOICES));
        break;
      case 'setAppearance':
        appearance = message.choice;
        await forgetIfChanged();
        if (lastComposed) {
          await sendComposition(lastComposed.schema, lastComposed.context, lastComposed.object);
        }
        break;
      case 'setPartStates':
        partStates = message.states;
        if (lastComposed) {
          await sendComposition(lastComposed.schema, lastComposed.context, lastComposed.object);
        }
        break;
      case 'showState': {
        const conditions = message.conditions ?? [];
        const isChanged = conditions.join(' ') !== shownConditions.join(' ');

        shownConditions = conditions;
        if (isChanged && lastComposed) {
          await sendComposition(lastComposed.schema, lastComposed.context, lastComposed.object);
        }
        break;
      }
      case 'setViewerSettingsOpen':
        await globalState.update(SETTINGS_OPEN_KEY, message.isOpen);
        break;
      case 'revealDefinition':
        await revealDefinition();
        break;
      case 'showEffectiveDefinition': {
        const line = await findHeaderLine();

        if (line !== undefined) {
          await vscode.commands.executeCommand('bigfs.showEffectiveObject', uri, line);
        }
        break;
      }
      case 'setGroundColour':
        if (COLOUR.test(message.colour)) {
          await globalState.update(GROUND_COLOUR_KEY, message.colour);
        }
        break;
      case 'loadDecal':
        await panel.post({
          kind: 'decal',
          name: message.name,
          url: await library.getTexture(`${message.name.replace(/\.[^.]*$/, '')}.tga`),
        });
        break;
      case 'playSound':
        await answerSoundRequest(message, uri, panel.post);
        break;
      case 'loadPartAnimation':
        await panel.post({
          kind: 'partAnimation',
          ...(await readAnimation(message.name).catch(() => ({
            name: message.name,
          }))),
        });
        break;
    }
  };

  const findHeaderLine = async (): Promise<number | undefined> => {
    const parsed = parseSageIni((await readWorkspaceText(uri)).split(/\r?\n/), await documents.getSchema());

    return findObjectNamed(parsed, name)?.startLine;
  };

  const revealDefinition = async (): Promise<void> => {
    const line = await findHeaderLine();
    const position = new vscode.Position(line ?? 0, 0);

    await vscode.window.showTextDocument(uri, {
      viewColumn: vscode.ViewColumn.One,
      selection: new vscode.Range(position, position),
    });
  };

  const readSceneContext = async (schema: SageIniSchema): Promise<PreviewContext> => {
    const [events, lua, gameData] = await Promise.all(
      ['data/scripts/scriptevents.xml', 'data/scripts/scripts.lua', 'data/ini/gamedata.ini'].map(
        (file) => locator?.read(file, uri),
      ),
    );
    const latin1 = new TextDecoder('latin1');
    const levelFiles = new Map(
      index
        .getNames('ExperienceLevel')
        .flatMap((level) => index.findDefinitions('ExperienceLevel', level, uri))
        .map((definition) => [definition.uri.toString(), definition.uri]),
    );
    const levelDocuments = await Promise.all(
      [...levelFiles.values()].map(async (file) =>
        parseSageIni((await readWorkspaceText(file)).split(/\r?\n/), schema),
      ),
    );

    return {
      sun: readSunDirection(gameData ? latin1.decode(gameData) : ''),
      resolveMacro: (macro) => index.findMacro(macro, uri)?.value,
      objects: new Map(),
      subObjects: new Map(),
      scripts: events && lua ? { events: latin1.decode(events), lua: latin1.decode(lua) } : undefined,
      levelTables: readLevelTables(
        levelDocuments,
        (macro) => index.findMacro(macro, uri)?.value,
      ),
    };
  };

  const createDefinitionReader = () => {
    const files = new Map<string, Promise<string[]>>();

    return async (keyword: string, definition: string) => {
      const place = index.findDefinitions(keyword, definition, uri)[0];

      if (!place) {
        return undefined;
      }

      const key = place.uri.toString();
      let text = files.get(key);

      if (!text) {
        text = readWorkspaceText(place.uri).then((read) => read.split(/\r?\n/));
        files.set(key, text);
      }
      return (await text).slice(place.line, place.line + MAX_DEFINITION_LINES);
    };
  };

  const createPreviewedContext = (): PreviewedContext => {
    const readDefinition = createDefinitionReader();
    const findHeader = async (place: { uri: vscode.Uri; line: number }) => {
      const lines = (await readWorkspaceText(place.uri)).split(/\r?\n/);
      let at = place.line;

      while (at > 0 && !/^[^\s;/]/.test(lines[at] ?? '')) {
        at--;
      }

      const header = /^(\w+)\s+(\S+)/.exec(lines[at] ?? '');

      return header ? [{ keyword: header[1], name: header[2] }] : [];
    };

    return {
      findDefinitionLines: readDefinition,
      padLookup: {
        findUsers: async (namespace, name) =>
          (await Promise.all(index.findReferences(namespace, name).slice(0, 64).map(findHeader))).flat(),
        findObjectLines: (name) => readDefinition('Object', name),
      },
    };
  };

  const createSources = (
    schema: SageIniSchema,
    context: PreviewContext,
    isCurrent: () => boolean = () => true,
  ): CompositionSources => {
    const readDefinition = createDefinitionReader();

    return {
      readObject: (objectName) =>
        isCurrent() ? readComposableOnce(schema, context, objectName) : Promise.resolve(undefined),
      resolveMacro: context.resolveMacro,
      readCreationList: (listName) =>
        isCurrent() ? readDefinition('ObjectCreationList', listName) : Promise.resolve(undefined),
      listSubObjects: (model) => {
        const key = model.toLowerCase();
        let listed = context.subObjects.get(key);

        if (!listed) {
          listed = Promise.resolve(locator?.read(toModelFile(model), uri))
            .then((bytes) => (bytes ? listModelSubObjects(bytes) : undefined))
            .catch(() => undefined);
          context.subObjects.set(key, listed);
        }
        return listed;
      },
    };
  };

  const readComposableOnce = (schema: SageIniSchema, context: PreviewContext, objectName: string) => {
    const key = objectName.toLowerCase();
    let read = context.objects.get(key);

    if (!read) {
      read = readComposable(schema, context, objectName);
      context.objects.set(key, read);
    }
    return read;
  };

  const sendPreloadPlan = async (choices: readonly AppearanceChoice[]) => {
    if (!lastComposed) {
      return;
    }

    const generation = ++planGeneration;
    const { schema, context, object } = lastComposed;
    const planned = appearance;
    const sources = createSources(schema, context, () => generation === planGeneration);
    const compositions: ObjectComposition[] = [];

    for (const choice of [planned, ...choices]) {
      await new Promise((resolve) => setImmediate(resolve));
      if (generation !== planGeneration) {
        return;
      }
      compositions.push(
        await composeObject(object, sources, shownConditions, choice, partStates),
      );
    }
    if (generation === planGeneration) {
      await panel.post({
        kind: 'preloadPlan',
        plan: listPreloads(object.scene, compositions, planned),
      });
    }
  };

  const isDefined = (keywords: string[]) => (name: string) =>
    keywords.some((keyword) => index.findDefinitions(keyword, name).length > 0);
  const isFxList = isDefined(['FXList']);
  const isParticleSystem = isDefined(['FXParticleSystem', 'ParticleSystem']);

  const readComposable = async (
    schema: SageIniSchema,
    context: PreviewContext,
    objectName: string,
  ): Promise<ComposableObject | undefined> => {
    const place = TEMPLATE_KEYWORDS.map(
      (keyword) => index.findDefinitions(keyword, objectName, uri)[0],
    ).find(Boolean);
    const text =
      place &&
      (await composeEffectiveObject(documents, index, place.uri, place.line));

    if (!text) {
      return undefined;
    }

    const lines = text.split('\n');
    const parsed = parseSageIni(lines, schema);
    const scene = readObjectScene(parsed, schema, isFxList, isParticleSystem, lines);

    if (!scene) {
      return undefined;
    }
    await completeObjectScene(scene, context);
    return { name: scene.name, parsed, scene };
  };

  const sendComposition = async (
    schema: SageIniSchema,
    context: PreviewContext,
    object: ComposableObject,
  ): Promise<void> => {
    const generation = ++compositionGeneration;

    planGeneration++;
    lastComposed = { schema, context, object };

    const composition = await composeObject(
      object,
      createSources(schema, context, () => generation === compositionGeneration),
      shownConditions,
      appearance,
      partStates,
    ).catch(
      (error: unknown): ObjectComposition => ({
        parts: [],
        notes: [`The composition could not be read: ${describeError(error)}`],
      }),
    );

    if (generation !== compositionGeneration) {
      return;
    }
    await panel.post({ kind: 'composition', composition });

    const unsent = composition.parts
      .flatMap((part) => part.effects ?? [])
      .filter(({ name }) => !sentEffects.has(name.toLowerCase()));

    if (unsent.length) {
      unsent.forEach(({ name }) => sentEffects.add(name.toLowerCase()));

      const { systems, fxLists, textures } = await library.collect(
        [],
        unsent.map(({ kind, name }) => ({ name, list: kind === 'fxList' })),
        '',
        MAX_EFFECT_REFERENCES,
      );

      await panel.post({ kind: 'partEffects', systems, fxLists, textures });
    }
  };

  const send = async (): Promise<void> => {
    const schema = await documents.getSchema();
    const source = parseSageIni(
      (await readWorkspaceText(uri)).split(/\r?\n/),
      schema,
    );
    const block = findObjectNamed(source, name);
    const header = block?.startLine;
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
    await forgetIfChanged();

    const lines = composed.split('\n');
    const parsed = parseSageIni(lines, schema);
    const scene = readObjectScene(parsed, schema, isFxList, isParticleSystem, lines);

    if (!scene) {
      return;
    }

    const context = await readSceneContext(schema);

    await completeObjectScene(scene, context, createPreviewedContext());

    const effects = await library.collect(
      [],
      [
        ...scene.fx.map(({ name, isSystem }) => ({ name, list: !isSystem })),
        ...scene.states.flatMap((state) => [
          ...state.fx.map((name) => ({ name, list: true })),
          ...(state.fxEvents ?? []).map(({ name }) => ({ name, list: true })),
          ...state.particles.map(({ system }) => ({
            name: system,
            list: false,
          })),
        ]),
      ],
      '',
      MAX_EFFECT_REFERENCES,
    );

    sentEffects = new Set([...Object.keys(effects.systems), ...Object.keys(effects.fxLists)]);
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
      groundColour: globalState.get<string>(GROUND_COLOUR_KEY),
      definition: {
        keyword: block!.keyword,
        parent: block!.name?.split(/\s+/)[1],
        file: vscode.workspace.asRelativePath(uri, false),
        line: header,
      },
    });
    void sendComposition(schema, context, { name: scene.name, parsed, scene });
    void sendAbilities(schema, context, parsed, scene).catch((error: unknown) => panel.post(toNotice(error)));
  };

  const sendAbilities = async (
    schema: SageIniSchema,
    context: PreviewContext,
    parsed: SageDocument,
    scene: ObjectScene,
  ): Promise<void> => {
    const generation = ++abilitiesGeneration;
    const readDefinition = createDefinitionReader();
    const groups = await listObjectAbilities(parsed, scene, schema, {
      findDefinitionLines: readDefinition,
      isDefined: (kind, definition) => isDefined(ABILITY_KEYWORDS[kind])(definition),
      readObject: async (objectName) => (await readComposableOnce(schema, context, objectName))?.scene,
      listLevels: async () =>
        (
          await Promise.all(
            index.getNames('ExperienceLevel').map((level) => readDefinition('ExperienceLevel', level)),
          )
        ).filter((lines): lines is string[] => !!lines),
      resolveMacro: context.resolveMacro,
      findText: (label) => index.findString(label, uri)?.text,
    });

    if (generation !== abilitiesGeneration) {
      return;
    }

    const effects = new Map(
      groups
        .flatMap(({ abilities }) => abilities.flatMap((ability) => ability.effects))
        .map(({ kind, name }) => [`${kind}/${name}`.toLowerCase(), { name, list: kind === 'fxList' }]),
    );

    effects.forEach(({ name }) => sentEffects.add(name.toLowerCase()));

    const { systems, fxLists, textures } = await library.collect(
      [],
      [...effects.values()],
      '',
      MAX_EFFECT_REFERENCES,
    );

    if (generation === abilitiesGeneration) {
      await panel.post({ kind: 'abilities', groups, systems, fxLists, textures });
    }
  };

  const readModel = async (name: string, textures?: TextureLayers, detail?: DetailLevel) => {
    const bytes =
      (detail && (await locator?.read(toModelFile(getDetailModel(name, detail)), uri))) ||
      (await locator?.read(toModelFile(name), uri));

    return bytes
      ? buildW3dScene(
          bytes,
          (fileName) => locator!.read(fileName, uri),
          decoding.tools,
          decoding.decodePng,
          textures,
          async (fileName) => !!(await locator!.findUri(fileName, uri)),
        )
      : undefined;
  };

  const sendModel = async (
    name: string,
    textures?: TextureLayers,
    detail?: DetailLevel,
  ): Promise<void> => {
    const reply = { kind: 'partModel', name, textures, detail } as const;

    try {
      const built = await readModel(name, textures, detail);

      if (!built) {
        await panel.post(reply);
        return;
      }

      const { scene, startsOver } = sender.send(built);

      const posted = [
        ...(startsOver ? [panel.post({ kind: 'forgetTextures' })] : []),
        panel.post({ ...reply, scene }),
      ];

      await Promise.all(posted);
    } catch (error) {
      await panel.post({ ...reply, error: describeError(error) });
    }
  };

  const readAnimation = async (clipName: string) => {
    const clip = clipName.slice(clipName.lastIndexOf('.') + 1);
    const bytes = await locator?.read(`${clip}.w3d`, uri);
    const animation = findAnimation(
      bytes ? parseW3dAnimations(bytes) : [],
      clipName,
    );

    return {
      name: clipName,
      animation,
      skeleton:
        animation &&
        (await loadSkeleton(
          animation.hierarchyName,
          (fileName) => locator!.read(fileName, uri),
          tools,
        )),
    };
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
