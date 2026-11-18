import { workspace } from 'vscode';
import type { Disposable } from 'vscode';
import { createSettings } from './createSettings';

export const settings = createSettings(() => workspace.getConfiguration());

export const onDidChangeSetting = (
  changed: ReadonlyArray<{ readonly key: string }>,
  listener: () => void,
): Disposable =>
  workspace.onDidChangeConfiguration((event) => {
    if (changed.some(({ key }) => event.affectsConfiguration(key))) {
      listener();
    }
  });
