const VIEWER_STYLE = `
.viewer { display: flex; height: 100%; min-height: 0; }
.viewer-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.viewer-bar { flex: none; display: flex; flex-wrap: wrap; gap: 2px 4px; align-items: center; padding: 3px 6px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); }
.viewer-bar[hidden] { display: none; }
.viewer-group { display: flex; gap: 2px; align-items: center; }
.viewer-group:empty { display: none; }
.viewer-bar input[type=range] { flex: 2 1 50px; min-width: 40px; margin: 0 2px; }
.viewer-clips { flex: 1 1 90px; width: 90px; max-width: 240px; min-width: 64px; text-overflow: ellipsis; }
.viewer-time { min-width: 5em; font-size: 11px; text-align: right; font-variant-numeric: tabular-nums; opacity: 0.8; white-space: nowrap; }
.viewer-settings-button { margin-left: auto; }
.viewer-help { position: absolute; right: 8px; bottom: 8px; display: inline-flex; color: #ddd; background: rgba(0, 0, 0, 0.35); align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; border: 1px solid currentColor; font-size: 11px; opacity: 0.6; cursor: help; }
.viewer-help:hover, .viewer-help:focus { opacity: 1; }
.viewer-status { position: absolute; left: 8px; bottom: 6px; max-width: calc(100% - 16px); font-size: 11px; color: #ddd; text-shadow: 0 1px 2px #000; pointer-events: none; overflow-wrap: anywhere; }
.viewer-stage { flex: 1; min-height: 0; position: relative; }
.viewer-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
.viewer-bone-labels { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.viewer-bone-label { position: absolute; transform: translate(7px, -50%); font-size: 11px; white-space: nowrap; color: #ffcf6e; text-shadow: 0 0 2px #000, 0 0 3px #000; }
.viewer-bone-label.attachment { color: #7fdcff; font-weight: bold; }
.viewer-bar input[type=color] { width: 2.2em; height: 1.6em; padding: 0; border: none; background: none; cursor: pointer; }
.viewer-side { flex: none; width: 340px; overflow-y: auto; padding: 8px 10px; box-sizing: border-box; border-left: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
.viewer-side p { margin: 6px 0; overflow-wrap: anywhere; }
.viewer-side p:empty { display: none; }
.viewer-section { border-top: 1px solid var(--vscode-panel-border); padding: 4px 0 6px; }
.viewer-section:first-child { border-top: none; }
.viewer-section > summary { cursor: pointer; font-weight: 600; padding: 2px 0; user-select: none; }
.viewer-section[open] > summary { margin-bottom: 4px; }
.viewer-section .viewer-section { border-top: none; padding: 0; }
.viewer-section .viewer-section > summary { font-weight: normal; }
.viewer-part-actions { display: flex; flex-wrap: wrap; gap: 4px; margin: 2px 0 6px; }
.viewer-filter { width: 100%; box-sizing: border-box; margin-bottom: 4px; padding: 3px 5px; }
.viewer-filter[hidden] { display: none; }
.viewer-part-group { margin: 6px 0 2px; opacity: 0.7; }
.viewer-part { margin: 2px 0 2px 8px; overflow-wrap: anywhere; }
.viewer-part-reason { margin-left: 22px; font-size: 11px; opacity: 0.7; }
:where(.viewer) button, :where(.viewer) select { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: none; padding: 3px 8px; border-radius: 2px; font: inherit; cursor: pointer; }
:where(.viewer) button[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
:where(.viewer) button:disabled, :where(.viewer) select:disabled { opacity: 0.5; cursor: default; }
.viewer-bar button { min-width: 24px; height: 24px; padding: 0 5px; border: 1px solid transparent; border-radius: 3px; color: var(--vscode-foreground); background: transparent; line-height: 1; }
.viewer-bar button:hover { background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31)); }
.viewer-bar button[aria-pressed="true"] { color: var(--vscode-inputOption-activeForeground, inherit); background: var(--vscode-inputOption-activeBackground, rgba(0, 127, 212, 0.4)); border-color: var(--vscode-inputOption-activeBorder, #007acc); }
.viewer-bar button[hidden], .viewer-bar select[hidden], .viewer-bar input[hidden], .viewer-bar span[hidden] { display: none; }
.viewer-bar select { height: 24px; padding: 0 4px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent); border-radius: 2px; }
`;

export const adoptViewerStyle = (): void => {
  const sheet = new CSSStyleSheet();

  sheet.replaceSync(VIEWER_STYLE);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
};
