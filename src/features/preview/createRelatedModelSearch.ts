import * as vscode from 'vscode';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import { FILE_USES } from '../../formats/ini/sageIniEntries';
import { decompressEar, isEarWrapped } from '../../formats/refpack/refpack';
import { readW3dHeader } from '../../formats/w3d/readW3dHeader';
import type { W3dHeader } from '../../formats/w3d/readW3dHeader';
import { findRelatedModels } from '../../game/objects/findRelatedModels';
import type { RelatedModel } from '../../game/objects/findRelatedModels';
import { readObjectScene } from '../../game/objects/objectScene';
import type { ObjectScene } from '../../game/objects/objectScene';
import type { EntryLocator } from '../../services/entryLocator';
import {
  composeEffectiveObject,
  parseTemplateHeader,
} from '../../services/ini/effectiveObject';
import type { SageIniDocuments } from '../../services/ini/sageIniDocuments';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';
import { readWorkspaceText } from '../../services/ini/workspaceText';

export type FindRelatedModels = (uri: vscode.Uri) => Promise<RelatedModel[]>;

const MAX_USES_READ = 24;
const TEMPLATE = /^(object|childobject|objectreskin)$/i;
const TOP_LEVEL = /^\S/;

const readHeaderOf = (bytes: Uint8Array): W3dHeader | undefined => {
  try {
    return readW3dHeader(isEarWrapped(bytes) ? decompressEar(bytes) : bytes);
  } catch {
    return undefined;
  }
};

const getFileName = (uri: vscode.Uri) =>
  uri.path.slice(uri.path.lastIndexOf('/') + 1).toLowerCase();

export const createRelatedModelSearch = (
  locator: EntryLocator,
  index: SageIniIndex,
  documents: SageIniDocuments,
): FindRelatedModels => {
  const headers = new Map<string, Promise<W3dHeader | undefined>>();
  const results = new Map<string, Promise<RelatedModel[]>>();
  let names: Promise<string[]> | undefined;
  let revision = locator.revision;

  const forgetStale = () => {
    if (revision !== locator.revision) {
      revision = locator.revision;
      headers.clear();
      results.clear();
      names = undefined;
    }
  };

  const readHeader = (file: string, near: vscode.Uri) => {
    let header = headers.get(file);

    if (!header) {
      header = locator.read(file, near).then(
        (read) => read && readHeaderOf(read),
        () => undefined,
      );
      headers.set(file, header);
    }
    return header;
  };

  const findScenes = async (file: string): Promise<ObjectScene[]> => {
    await index.whenReady();

    const schema = await documents.getSchema();
    const uses = index
      .findReferences(FILE_USES, file)
      .filter((use) => use.field === 'model' || use.field === 'animation')
      .slice(0, MAX_USES_READ);
    const templates = new Map<string, { uri: vscode.Uri; line: number }>();

    for (const use of uses) {
      const lines = (await readWorkspaceText(use.uri)).split(/\r?\n/);
      let at = use.line;

      while (at > 0 && !TOP_LEVEL.test(lines[at] ?? '')) {
        at--;
      }
      if (TEMPLATE.test(parseTemplateHeader(lines[at] ?? '').keyword)) {
        templates.set(`${use.uri.toString()}#${at}`, { uri: use.uri, line: at });
      }
    }

    const scenes: ObjectScene[] = [];

    for (const { uri, line } of templates.values()) {
      const composed = await composeEffectiveObject(documents, index, uri, line);
      const scene =
        composed &&
        readObjectScene(
          parseSageIni(composed.split('\n'), schema),
          schema,
          () => false,
          () => false,
        );

      if (scene) {
        scenes.push(scene);
      }
    }
    return scenes;
  };

  return (uri) => {
    forgetStale();

    const file = getFileName(uri);
    let result = results.get(file);

    if (!result) {
      result = (async () => {
        const header = readHeaderOf(await vscode.workspace.fs.readFile(uri));

        if (!header) {
          return [];
        }
        return findRelatedModels(file, header, {
          readHeader: (name) => readHeader(name, uri),
          listNames: () =>
            (names ??= locator.findNames(
              (name) => name.endsWith('.w3d'),
              '**/*.{w3d,W3D}',
            )),
          findScenes,
        });
      })().catch(() => []);
      results.set(file, result);
    }
    return result;
  };
};
