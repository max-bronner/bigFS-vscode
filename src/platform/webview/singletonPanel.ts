import * as vscode from 'vscode';

export type PanelColumn =
  | vscode.ViewColumn
  | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean };

export interface SingletonPanelConfig<Incoming> {
  viewType: string;
  title: string;
  column: PanelColumn;
  options: vscode.WebviewPanelOptions & vscode.WebviewOptions;
  render: (panel: vscode.WebviewPanel) => vscode.Disposable[] | void;
  onMessage?: (message: Incoming) => unknown;
  onDispose?: () => void;
}

export interface RevealOptions {
  column?: vscode.ViewColumn;
  preserveFocus?: boolean;
}

export interface SingletonPanel<Outgoing = unknown> {
  show: (reveal?: RevealOptions) => vscode.WebviewPanel;
  post: (message: Outgoing) => Thenable<boolean>;
  dispose: () => void;
  isOpen: () => boolean;
}

export const createSingletonPanel = <Incoming = unknown, Outgoing = unknown>({
  viewType,
  title,
  column,
  options,
  render,
  onMessage,
  onDispose,
}: SingletonPanelConfig<Incoming>): SingletonPanel<Outgoing> => {
  let current: vscode.WebviewPanel | undefined;

  const show = (reveal: RevealOptions = {}): vscode.WebviewPanel => {
    if (current) {
      current.reveal(reveal.column, reveal.preserveFocus);
      return current;
    }

    const panel = vscode.window.createWebviewPanel(
      viewType,
      title,
      column,
      options,
    );
    const disposables = [...(render(panel) ?? [])];

    if (onMessage) {
      disposables.push(panel.webview.onDidReceiveMessage(onMessage));
    }
    panel.onDidDispose(() => {
      current = undefined;
      disposables.forEach((each) => each.dispose());
      onDispose?.();
    });
    current = panel;
    return panel;
  };

  return {
    show,
    post: (message) =>
      current?.webview.postMessage(message) ?? Promise.resolve(false),
    dispose: () => current?.dispose(),
    isOpen: () => current !== undefined,
  };
};
