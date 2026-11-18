import { commands } from 'vscode';

const KEYS = {
  scanned: 'bigfs.scanned',
  hasArchives: 'bigfs.hasArchives',
  gameView: 'bigfs.gameView',
  hasClipboard: 'bigfs.hasClipboard',
} as const;

export type ContextKey = keyof typeof KEYS;

export const setContextKey = async (
  key: ContextKey,
  value: boolean,
): Promise<void> => {
  await commands.executeCommand('setContext', KEYS[key], value);
};
