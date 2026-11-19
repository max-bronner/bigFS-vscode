import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  commands,
  window,
} from 'vscode';
import type { EntryLocator } from '../entryLocator';
import { settings } from '../../platform/settings';
import { decideAssetCheck } from '../../game/ini-tools/assetCheckPolicy';
import { findClosestNames } from '../../formats/ini/sageIniFormat';
import {
  findAssetReferences,
  formatMissingAssetMessage,
} from '../../formats/ini/sageIniAssets';
import type { AssetKind } from '../../formats/ini/sageIniAssets';
import type { SageDocument } from '../../formats/ini/sageIniParser';

const EXTENSIONS: Record<AssetKind, RegExp> = {
  model: /\.w3d$/,
  animation: /\.w3d$/,
  texture: /\.(dds|tga|jpg|png)$/,
  sound: /\.(wav|mp3)$/,
};

const stemCache = new WeakMap<Set<string>, Map<AssetKind, string[]>>();

const listStems = (names: Set<string>, kind: AssetKind): string[] => {
  let byKind = stemCache.get(names);

  if (!byKind) {
    byKind = new Map();
    stemCache.set(names, byKind);
  }

  let stems = byKind.get(kind);

  if (!stems) {
    stems = [
      ...new Set(
        [...names]
          .filter((name) => EXTENSIONS[kind].test(name))
          .map((name) => name.replace(/\.[^.]*$/, '')),
      ),
    ];
    byKind.set(kind, stems);
  }
  return stems;
};

let hasHinted = false;

const hintNoBaseGame = () => {
  if (hasHinted) {
    return;
  }
  hasHinted = true;
  void window
    .showInformationMessage(
      'bigFS: missing-asset checks are off because no base game folder is set, so every texture and model your mod borrows would be flagged. Set "bigfs.baseGameFolder" to turn them on.',
      'Open Setting',
    )
    .then((choice) => {
      if (choice) {
        void commands.executeCommand(
          'workbench.action.openSettings',
          settings.baseGameFolder.key,
        );
      }
    });
};

const modelCounts = new WeakMap<Set<string>, number>();

const countModels = (names: Set<string>): number => {
  let models = modelCounts.get(names);

  if (models === undefined) {
    models = 0;

    for (const name of names) {
      if (name.endsWith('.w3d')) {
        models++;
      }
    }

    modelCounts.set(names, models);
  }

  return models;
};

export const shouldCheckAssets = (names: Set<string>): boolean => {
  const mode = settings.iniCheckAssets.get();
  const models = mode === 'auto' ? countModels(names) : 0;

  const decision = decideAssetCheck(
    mode,
    Boolean(settings.baseGameFolder.get().trim()),
    models,
  );

  if (decision === 'no-base-game') {
    hintNoBaseGame();
  }
  return decision === 'check';
};

export const getAssetDiagnostics = (
  parsed: SageDocument,
  names: Set<string>,
  source: string,
  references = findAssetReferences(parsed),
): Diagnostic[] =>
  references
    .filter((reference) =>
      reference.candidates.every((candidate) => !names.has(candidate)),
    )
    .map((reference) => {
      const written = reference.name.replace(/^.*[\\/]/, '');
      const prefix =
        reference.kind === 'animation'
          ? written.slice(0, written.lastIndexOf('.') + 1)
          : '';
      const asWritten = written.slice(prefix.length);
      const extension = /\.[^.]*$/.exec(asWritten)?.[0] ?? '';
      const suggestions = findClosestNames(
        asWritten.slice(0, asWritten.length - extension.length).toLowerCase(),
        listStems(names, reference.kind),
      ).map((stem) => `${prefix}${stem}${extension}`);
      const diagnostic = new Diagnostic(
        new Range(
          reference.line,
          reference.start,
          reference.line,
          reference.end,
        ),
        formatMissingAssetMessage(reference, suggestions),
        DiagnosticSeverity.Warning,
      );

      diagnostic.source = source;
      return diagnostic;
    });

export const getAssetNamesToCheck = async (
  locator: EntryLocator | undefined,
): Promise<Set<string> | undefined> => {
  if (!locator) {
    return undefined;
  }

  const names = await locator.getFileNames();

  return shouldCheckAssets(names) ? names : undefined;
};

export const getCheckedAssetDiagnostics = async (
  parsed: SageDocument,
  locator: EntryLocator | undefined,
  source: string,
): Promise<Diagnostic[]> => {
  let names = await getAssetNamesToCheck(locator);

  if (!names) {
    return [];
  }

  const references = findAssetReferences(parsed);
  const first = references.filter((reference) =>
    reference.candidates.every((candidate) => !names!.has(candidate)),
  );

  if (
    first.length &&
    (await locator!.recheck(first.flatMap((reference) => reference.candidates)))
  ) {
    names = await locator!.getFileNames();
  }
  return getAssetDiagnostics(parsed, names, source, references);
};
