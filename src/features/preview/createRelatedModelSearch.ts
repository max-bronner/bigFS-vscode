import * as vscode from 'vscode';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import type { SageDocument } from '../../formats/ini/sageIniParser';
import { FILE_USES } from '../../formats/ini/sageIniEntries';
import { decompressEar, isEarWrapped } from '../../formats/refpack/refpack';
import { readW3dHeader } from '../../formats/w3d/readW3dHeader';
import type { W3dHeader } from '../../formats/w3d/readW3dHeader';
import { findRelatedModels } from '../../game/objects/findRelatedModels';
import type { RelatedModel } from '../../game/objects/findRelatedModels';
import { findOwningTemplate } from '../../game/objects/findOwningTemplate';
import { readObjectScene } from '../../game/objects/objectScene';
import type { ObjectScene } from '../../game/objects/objectScene';
import type { EntryLocator } from '../../services/entryLocator';
import { composeEffectiveObject } from '../../services/ini/effectiveObject';
import type { SageIniDocuments } from '../../services/ini/sageIniDocuments';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';
import { readWorkspaceText } from '../../services/ini/workspaceText';

export type FindRelatedModels = (uri: vscode.Uri) => Promise<RelatedModel[]>;

const MAX_USES_READ = 24;

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
  const names = new Map<string, Promise<string[]>>();
  let revision = locator.revision;

  const forgetStale = () => {
    if (revision !== locator.revision) {
      revision = locator.revision;
      headers.clear();
      names.clear();
    }
  };

  const readHeader = (file: string, near: vscode.Uri) => {
    const key = `${near.toString()}|${file}`;
    let header = headers.get(key);

    if (!header) {
      header = locator.read(file, near).then(
        (read) => read && readHeaderOf(read),
        () => undefined,
      );
      headers.set(key, header);
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

    const parsedFiles = new Map<string, Promise<SageDocument>>();

    for (const use of uses) {
      const key = use.uri.toString();
      let parsed = parsedFiles.get(key);

      if (!parsed) {
        parsed = readWorkspaceText(use.uri).then((text) =>
          parseSageIni(text.split(/\r?\n/), schema),
        );
        parsedFiles.set(key, parsed);
      }

      const owner = findOwningTemplate((await parsed).blocks, use.line);

      if (owner) {
        templates.set(`${key}#${owner.startLine}`, {
          uri: use.uri,
          line: owner.startLine,
        });
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

  return async (uri) => {
    forgetStale();

    try {
      const header = readHeaderOf(await vscode.workspace.fs.readFile(uri));

      if (!header) {
        return [];
      }
      return await findRelatedModels(getFileName(uri), header, {
        readHeader: (name) => readHeader(name, uri),
        listNames: () => {
          let found = names.get(uri.toString());

          if (!found) {
            found = locator.findNames(
              (name) => name.endsWith('.w3d'),
              '**/*.{w3d,W3D}',
              uri,
            );
            names.set(uri.toString(), found);
          }
          return found;
        },
        findScenes,
      });
    } catch {
      return [];
    }
  };
};
