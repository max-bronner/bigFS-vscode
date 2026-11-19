import type { BlingView, HeroView, PowerView } from './protocol';

export const describeBanner = (hero: HeroView): string[] => {
  const notes: string[] = [];

  if (hero.readOnly) {
    notes.push(
      'Read-only: this file belongs to a game install or a read-only source. Use Save As to keep an edited copy.',
    );
  }
  if (!hero.hasSystem) {
    notes.push(
      'No CreateAHeroSystem was found in the INI files, so classes, bling and powers are shown as stored.',
    );
  }
  if (hero.file.storedCrc !== undefined && !hero.file.document) {
    notes.push(
      'The stored checksum does not match the file; the game would drop this hero. Saving writes the correct one.',
    );
  }
  return notes;
};

export const describePoints = (points: HeroView['points']): string =>
  points
    ? `${
        points.total === undefined
          ? 'The subclass does not say how many points it has.'
          : `${points.spent} of ${points.total} spent`
      } (derived from the bling choices; the file does not store points)`
    : 'Not stored in the file; shown when the class and subclass resolve.';

export const describePower = (power: PowerView): string =>
  [
    power.label,
    power.specialPower &&
      `special power ${power.specialPower}${power.specialPowerKnown === false ? ' (not found)' : ''}`,
  ]
    .filter(Boolean)
    .join(', ');

export const describeBling = (bling: BlingView): string =>
  [bling.binder, bling.kind, bling.upgrade, bling.label]
    .filter(Boolean)
    .join(' - ');

const formatHex32 = (value: number): string => value.toString(16).padStart(8, '0');

export const describeChecksum = (file: HeroView['file']): string =>
  `${file.storedCrc === undefined ? 'none stored' : `stored ${formatHex32(file.storedCrc)}`}, will save as ${formatHex32(file.crc)}`;

export const describeVersion = (version: number): string =>
  version + (version < 8 ? ' (saving writes version 8)' : '');
