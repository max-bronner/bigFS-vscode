import type { Memento } from 'vscode';
import type { AptToolbar } from '../../webview/apt/protocol';

export const APT_TOOLBAR = 'bigfs.apt.toolbar';

export const readAptToolbar = (state: Memento): unknown => state.get(APT_TOOLBAR);

export const keepAptToolbar = (state: Memento, toolbar: AptToolbar): Thenable<void> =>
  state.update(APT_TOOLBAR, toolbar);
