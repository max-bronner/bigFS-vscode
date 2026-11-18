import { commands, window } from 'vscode';
import type { Disposable, LogOutputChannel } from 'vscode';
import { describeError } from '../core/errors';
import { guardCommand } from './guardCommand';

let log: LogOutputChannel | undefined;

export const setCommandLog = (channel: LogOutputChannel): void => {
  log = channel;
};

export const registerCommand = (
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => unknown,
): Disposable =>
  commands.registerCommand(
    id,
    guardCommand(
      id,
      handler,
      () => ({
        showError: (message) => void window.showErrorMessage(message),
        logError: log && ((name, error) => log?.error(name, error)),
      }),
      describeError,
    ),
  );
