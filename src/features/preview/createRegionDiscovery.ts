import * as vscode from 'vscode';
import { decodeWindows1252 } from '../../core/windows1252';
import { getTextureCandidates } from '../../formats/ini/sageIniAssets';
import {
  findMappedImageHeader,
  readMappedImageBlock,
} from '../../formats/mappedImage/mappedImageEdit';
import {
  findRuStyleLines,
  parseRu,
} from '../../formats/apt/aptGeometry';
import {
  getRunSamples,
  isSameTexture,
  parseAptTextureName,
} from '../../formats/apt/aptTextureUses';
import { findBelow } from '../../services/apt/findBelow';
import { readMovieTextures } from '../../services/apt/readMovieTextures';
import type { EntryLocator } from '../../services/entryLocator';
import { FILE_USES } from '../../formats/ini/sageIniEntries';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';
import { readWorkspaceText } from '../../services/ini/workspaceText';
import { getMappedImageRegionId } from './mappedImageRegionId';
import { getRuRegionId } from './ruRegionId';

export const MAX_REGIONS = 800;

const REPORT_EVERY = 40;

export type FindRegions = (
  texture: vscode.Uri,
  report: (ids: string[]) => void,
  token: vscode.CancellationToken,
) => Promise<void>;

const fileNameOf = (uri: vscode.Uri) =>
  uri.path.slice(uri.path.lastIndexOf('/') + 1);

export const createRegionDiscovery = (
  index: SageIniIndex,
  locator: EntryLocator,
): FindRegions => {
  const findMappedImages = async (
    texture: vscode.Uri,
    report: (ids: string[]) => void,
    token: vscode.CancellationToken,
  ): Promise<number> => {
    await index.whenReady();

    const uses = index
      .findReferences(
        FILE_USES,
        getTextureCandidates(fileNameOf(texture))[0],
      )
      .filter((use) => use.field === 'texture');
    const texts = new Map<string, Promise<string[]>>();
    const seen = new Set<string>();
    let batch: string[] = [];

    for (const use of uses) {
      if (token.isCancellationRequested || seen.size >= MAX_REGIONS) {
        break;
      }

      const key = use.uri.toString();

      if (!texts.has(key)) {
        texts.set(
          key,
          readWorkspaceText(use.uri).then(
            (text) => text.split(/\r?\n/),
            () => [],
          ),
        );
      }

      const lines = await texts.get(key)!;
      const header = findMappedImageHeader(lines, use.line);
      const name =
        header === undefined
          ? undefined
          : readMappedImageBlock(lines, header)?.image.name;
      const id =
        header === undefined || !name
          ? undefined
          : getMappedImageRegionId({ uri: use.uri, name, line: header });

      if (id && !seen.has(id)) {
        seen.add(id);
        batch.push(id);
        if (batch.length >= REPORT_EVERY) {
          report(batch);
          batch = [];
        }
      }
    }
    report(batch);
    return seen.size;
  };

  const findShapes = async (
    texture: vscode.Uri,
    report: (ids: string[]) => void,
    token: vscode.CancellationToken,
    room: number,
  ): Promise<void> => {
    const name = fileNameOf(texture);
    const parsed = parseAptTextureName(name);
    const aptUri = parsed && (await locator.findUri(`${parsed.movie}.apt`, texture));
    const movie = aptUri && (await readMovieTextures(aptUri));

    if (!movie || token.isCancellationRequested) {
      return;
    }

    const geometries = new Set(
      movie.characters.flatMap((character) =>
        character.type === 'shape' ? [character.geometry] : [],
      ),
    );
    let found = 0;
    let batch: string[] = [];

    for (const geometry of geometries) {
      if (token.isCancellationRequested || found >= room) {
        break;
      }

      const ruUri = await findBelow(
        movie.folder,
        `${movie.name}_geometry/${geometry}.ru`,
        vscode.FileType.File,
      );

      if (!ruUri) {
        continue;
      }
      try {
        const text = decodeWindows1252(
          await vscode.workspace.fs.readFile(ruUri),
        );
        const styleLines = findRuStyleLines(text);

        for (const sample of getRunSamples(parseRu(text), movie.imageTextures)) {
          if (sample.texture && isSameTexture(sample.texture, name)) {
            batch.push(getRuRegionId({ uri: ruUri, line: styleLines[sample.run] }));
            found++;
          }
        }
      } catch {
        continue;
      }
      if (batch.length >= REPORT_EVERY) {
        report(batch);
        batch = [];
      }
    }
    report(batch);
  };

  return async (texture, report, token) => {
    const found = await findMappedImages(texture, report, token);

    if (!token.isCancellationRequested) {
      await findShapes(texture, report, token, MAX_REGIONS - found);
    }
  };
};
