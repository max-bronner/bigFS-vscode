import type { ConstItem } from '../../aptMovie';
import type { AptEdit, ConstItemChange } from '../../writer/aptEdit';
import type { MovieText } from '../textModel';
import { saveCharacters } from './characters';
import { saveConstants } from './constants';
import { saveExports, saveImports } from './importsAndExports';
import { createSaveSession } from './saveSession';
import { saveScripts } from './scripts';
import { saveTimelines, writeOrders } from './timelines';
import { checkSavedText } from './verification';

export interface TextSave {
  apt: Uint8Array;
  constBytes: Uint8Array;
  edits: AptEdit[];
  constChanges: ConstItemChange[];
  constAdded: ConstItem[];
  scripts: { block: number; start: number }[];
}

export const saveMovieText = (
  apt: Uint8Array,
  constBytes: Uint8Array,
  before: MovieText,
  after: MovieText,
): TextSave => {
  const session = createSaveSession(apt, constBytes, before);

  saveConstants(session, before, after);
  saveImports(session, before, after);
  saveCharacters(session, after);
  saveExports(session, session.readCurrentText(), after);
  saveTimelines(session, after);
  saveScripts(session);
  writeOrders(session);
  checkSavedText(after, session.readCurrentText());

  return {
    apt:
      session.edits.length || session.scripts.length
        ? session.image.bytes
        : apt,
    constBytes: session.constBytes,
    edits: session.edits,
    constChanges: session.constChanges,
    constAdded: session.constAdded,
    scripts: session.scripts,
  };
};
