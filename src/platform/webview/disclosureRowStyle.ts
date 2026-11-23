export const DISCLOSURE_ROW_STYLE = `
.disclosure-row { display: flex; align-items: flex-start; gap: 2px; }
.disclosure-row > .disclosure-arrow { flex: none; display: flex; align-items: center; justify-content: center; width: 16px; height: 18px; margin: 0; padding: 0; border: none; border-radius: 3px; color: inherit; background: none; cursor: pointer; }
.disclosure-row > .disclosure-arrow:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31)); }
.disclosure-row > .disclosure-arrow:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.disclosure-row > .disclosure-arrow > svg { width: 16px; height: 16px; transition: transform 0.1s; }
.disclosure-row > .disclosure-arrow[aria-expanded="true"] > svg { transform: rotate(90deg); }
.disclosure-row > .disclosure-label { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 4px; padding: 1px 0; cursor: pointer; overflow-wrap: anywhere; }
.disclosure-row > .disclosure-label > input { flex: none; margin: 2px 0 0; }
.disclosure-text { flex: 1; min-width: 0; }
.disclosure-members { padding-left: 18px; }
.disclosure-members[hidden] { display: none; }
`;
