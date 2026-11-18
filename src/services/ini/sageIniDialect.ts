import { languages, workspace } from 'vscode';
import type { Disposable, TextDocument } from 'vscode';
import { SAGE_INI_LANGUAGE } from '../../constants';

const DIALECT_PATTERN =
  /^\s*(?:Object|Weapon|Armor|FXList|AudioEvent|CommandButton|CommandSet|Upgrade|ObjectCreationList|FXParticleSystem|MappedImage|WindowTransition)\s+\S|^\s*End\s*$/im;

const ADOPTABLE_LANGUAGES = new Set(['ini', 'plaintext']);

const looksLikeSageIni = (document: TextDocument): boolean =>
  DIALECT_PATTERN.test(document.getText());

const adoptDocument = (document: TextDocument): void => {
  if (
    !ADOPTABLE_LANGUAGES.has(document.languageId) ||
    !document.uri.path.toLowerCase().endsWith('.ini') ||
    !looksLikeSageIni(document)
  ) {
    return;
  }

  languages.setTextDocumentLanguage(document, SAGE_INI_LANGUAGE);
};

export const watchSageIniDialect = (): Disposable => {
  workspace.textDocuments.forEach(adoptDocument);

  return workspace.onDidOpenTextDocument(adoptDocument);
};
