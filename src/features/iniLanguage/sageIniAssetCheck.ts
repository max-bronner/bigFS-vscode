import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  commands,
  window,
} from 'vscode';
import type { EntryLocator } from '../../services/entryLocator';
import { settings } from '../../platform/settings';
import { decideAssetCheck } from '../../game/ini-tools/assetCheckPolicy';
import { closestNames } from '../../formats/ini/sageIniFormat';
import {
  findAssetReferences,
  missingAssetMessage,
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

const stemsOf = (names: Set<string>, kind: AssetKind): string[] => {
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

let hinted = false;

const hintNoBaseGame = () => {
  if (hinted) {
    return;
  }
  hinted = true;
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

export const shouldCheckAssets = (names: Set<string>): boolean => {
  const mode = settings.iniCheckAssets.get();
  let models = 0;

  if (mode === 'auto') {
    for (const name of names) {
      if (name.endsWith('.w3d')) {
        models++;
      }
    }
  }

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
): Diagnostic[] =>
  findAssetReferences(parsed)
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
      const suggestions = closestNames(
        asWritten.slice(0, asWritten.length - extension.length).toLowerCase(),
        stemsOf(names, reference.kind),
      ).map((stem) => `${prefix}${stem}${extension}`);
      const diagnostic = new Diagnostic(
        new Range(
          reference.line,
          reference.start,
          reference.line,
          reference.end,
        ),
        missingAssetMessage(reference, suggestions),
        DiagnosticSeverity.Warning,
      );

      diagnostic.source = source;
      return diagnostic;
    });

export const assetNamesToCheck = async (
  locator: EntryLocator | undefined,
): Promise<Set<string> | undefined> => {
  if (!locator) {
    return undefined;
  }

  const names = await locator.fileNames();

  return shouldCheckAssets(names) ? names : undefined;
};

export const checkedAssetDiagnostics = async (
  parsed: SageDocument,
  locator: EntryLocator | undefined,
  source: string,
): Promise<Diagnostic[]> => {
  let names = await assetNamesToCheck(locator);

  if (!names) {
    return [];
  }

  const missing = () =>
    findAssetReferences(parsed).filter((reference) =>
      reference.candidates.every((candidate) => !names!.has(candidate)),
    );
  const first = missing();

  if (
    first.length &&
    (await locator!.recheck(first.flatMap((reference) => reference.candidates)))
  ) {
    names = await locator!.fileNames();
  }
  return getAssetDiagnostics(parsed, names, source);
};
