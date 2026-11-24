import type * as vscode from 'vscode';
import { SPEEDS, ZOOMS } from '../../webview/apt/protocol';
import { renderWebviewPage } from '../../platform/webview/webviewPage';

const STYLE = `
  body { margin: 0; color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); display: grid; grid-template-columns: 220px minmax(0, 1fr) minmax(320px, 30%); height: 100vh; }
  aside, #side { overflow: auto; }
  aside { border-right: 1px solid var(--vscode-panel-border); display: flex; flex-direction: column; }
  #filter { margin: 6px 6px 4px; padding: 3px 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); }
  #kinds { display: flex; flex-wrap: wrap; gap: 3px; padding: 0 6px 6px; border-bottom: 1px solid var(--vscode-panel-border); }
  #kinds .chip { color: var(--vscode-foreground); background: transparent; border: 1px solid var(--vscode-button-border, var(--vscode-panel-border)); border-radius: 10px; padding: 0 7px; font-size: 0.92em; opacity: 0.8; }
  #kinds .chip[aria-pressed=true] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border-color: transparent; opacity: 1; }
  .chip .count { opacity: 0.75; margin-left: 3px; }
  #list { overflow: auto; flex: 1; }
  .group { margin: 8px 8px 2px; font-size: 0.8em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; }
  .row { display: flex; gap: 6px; align-items: baseline; padding: 1px 8px 1px 4px; cursor: pointer; white-space: nowrap; }
  .row-id { flex: none; min-width: 2.6em; text-align: right; opacity: 0.6; font-variant-numeric: tabular-nums; }
  .row-name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .row-detail { flex: 1 1 0; min-width: 0; text-align: right; overflow: hidden; text-overflow: ellipsis; opacity: 0.6; font-size: 0.9em; }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row.selected { color: var(--vscode-list-activeSelectionForeground); background: var(--vscode-list-activeSelectionBackground); }
  main { overflow: auto; scrollbar-gutter: stable; padding: 6px 12px 8px; }
  .toolbar { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
  #stage-bar { margin-bottom: 2px; }
  #stage-bar .divider { width: 1px; align-self: stretch; margin: 2px; background: var(--vscode-panel-border); }
  #frame { flex: 1 1 80px; min-width: 60px; max-width: 240px; }
  #play-from { max-width: 130px; }
  .segmented { display: inline-flex; border: 1px solid var(--vscode-button-border, var(--vscode-panel-border)); border-radius: 3px; overflow: hidden; }
  .segmented button { border-radius: 0; background: transparent; color: var(--vscode-foreground); }
  .segmented button[aria-pressed=true], button.toggle[aria-pressed=true] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  .menu-button::after { content: '▾'; margin-left: 5px; opacity: 0.75; }
  #frame-label { margin: 0 0 6px; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .menu { position: fixed; z-index: 20; min-width: 190px; max-height: calc(100vh - 8px); overflow: auto; padding: 4px 0; color: var(--vscode-menu-foreground, var(--vscode-foreground)); background: var(--vscode-menu-background, var(--vscode-editorWidget-background, Canvas)); border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border, var(--vscode-panel-border))); border-radius: 5px; box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.35)); outline: none; }
  .menu .menu-item { display: grid; grid-template-columns: 16px 1fr auto; gap: 4px; align-items: center; width: 100%; padding: 3px 12px 3px 6px; color: inherit; background: transparent; border-radius: 0; text-align: left; white-space: nowrap; }
  .menu .menu-item:hover:not(:disabled), .menu .menu-item:focus { color: var(--vscode-menu-selectionForeground, inherit); background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground)); outline: none; }
  .menu .menu-item:disabled { opacity: 0.45; cursor: default; }
  .menu-check { text-align: center; }
  .menu-key { margin-left: 24px; opacity: 0.7; }
  .menu-separator { height: 1px; margin: 4px 0; background: var(--vscode-menu-separatorBackground, var(--vscode-panel-border)); }
  .menu-heading { padding: 4px 12px 1px 26px; font-size: 0.85em; opacity: 0.65; }
  #stage { background: repeating-conic-gradient(#808080 0 25%, #a0a0a0 0 50%) 0 0 / 16px 16px; }
  #side { border-left: 1px solid var(--vscode-panel-border); display: flex; flex-direction: column; overflow: hidden; }
  .tabs { display: flex; flex: none; gap: 2px; padding: 0 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  .tabs [role=tab] { padding: 6px 8px 5px; color: var(--vscode-panelTitle-inactiveForeground, var(--vscode-foreground)); background: transparent; border-radius: 0; border-bottom: 1px solid transparent; font-size: 11px; text-transform: uppercase; opacity: 0.8; }
  .tabs [role=tab][aria-selected=true] { color: var(--vscode-panelTitle-activeForeground, var(--vscode-foreground)); border-bottom-color: var(--vscode-panelTitle-activeBorder, var(--vscode-focusBorder)); opacity: 1; }
  .tabs [role=tab]:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .badge { display: inline-block; min-width: 8px; margin-left: 5px; padding: 0 5px; border-radius: 9px; font-size: 10px; text-align: center; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); }
  .badge:empty { display: none; }
  .tab-panel { flex: 1; min-height: 0; overflow: auto; padding: 0 10px; }
  .tab-panel[hidden] { display: none; }
  #inspect-hint { margin: 10px 0; }
  #inspector:not(:empty) { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 6px; }
  #inspector:not(:empty) + #inspect-hint { display: none; }
  #atlas:not(:empty) { padding-bottom: 6px; }
  canvas.atlas { display: block; max-width: 100%; background: repeating-conic-gradient(#808080 0 25%, #a0a0a0 0 50%) 0 0 / 12px 12px; }
  #integrity .problem { cursor: default; margin: 1px 0; }
  #integrity .problem[data-character] { cursor: pointer; }
  #integrity .error { color: var(--vscode-errorForeground); }
  #integrity .warning { color: var(--vscode-editorWarning-foreground); }
  #integrity .info { opacity: 0.75; }
  #timeline .grid { overflow-x: auto; max-height: 220px; overflow-y: auto; border: 1px solid var(--vscode-panel-border); }
  #timeline table { border-collapse: collapse; font-size: 10px; }
  #timeline td { min-width: 9px; height: 13px; padding: 0 1px; text-align: center; cursor: pointer; border-right: 1px solid var(--vscode-panel-border); }
  #timeline td.depth { position: sticky; left: 0; min-width: 34px; background: var(--vscode-editor-background); cursor: default; }
  #timeline td.frame { opacity: 0.8; }
  #timeline td.held { background: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 35%, transparent); }
  #timeline td.key { background: color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 65%, transparent); }
  #timeline td.born { background: var(--vscode-charts-blue, #3794ff); }
  #timeline td.removed { background: color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 50%, transparent); }
  #timeline td.tween { background-image: linear-gradient(to bottom, transparent 40%, var(--vscode-charts-purple, #b180d7) 40%, var(--vscode-charts-purple, #b180d7) 60%, transparent 60%); }
  #timeline td.tween-start { border-left: 2px solid var(--vscode-charts-purple, #b180d7); }
  #timeline td.picked { outline: 1px solid var(--vscode-focusBorder, #007fd4); outline-offset: -1px; }
  #timeline td.label { text-align: left; white-space: nowrap; overflow: hidden; max-width: 0; padding: 0 3px; color: var(--vscode-charts-yellow, #cca700); border-left: 2px solid var(--vscode-charts-yellow, #cca700); }
  #timeline td.flow { color: var(--vscode-charts-orange, #d18616); }
  #timeline td.jump-target { box-shadow: inset 0 0 0 2px var(--vscode-charts-green, #89d185); }
  #timeline td.now { box-shadow: inset 0 0 0 1px var(--vscode-charts-orange, #d18616); }
  #timeline .field label { min-width: 0; }
  #timeline input.short { width: 44px; }
  #timeline input.line { width: 150px; }
  #timeline .error-text { color: var(--vscode-errorForeground); }
  #log { font-family: var(--vscode-editor-font-family); font-size: 12px; opacity: 0.8; }
  button.chosen { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  pre { white-space: pre-wrap; word-break: break-all; font-family: var(--vscode-editor-font-family); font-size: 12px; }
  .muted, #summary { opacity: 0.75; }
  .error { color: var(--vscode-errorForeground); padding: 12px; }
  #notice { position: fixed; bottom: 8px; left: 250px; right: 12px; z-index: 2; padding: 6px 10px; color: var(--vscode-inputValidation-errorForeground, inherit); background: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); }
  #engine-summary { display: block; margin: 8px 0 0; }
  .engine-call { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) auto; gap: 4px; align-items: center; margin: 3px 0; }
  .engine-call .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--vscode-editor-font-family, monospace); opacity: 0.85; }
  .engine-call .arguments { display: flex; gap: 4px; min-width: 0; }
  .engine-call .arguments input { flex: 1 1 0; min-width: 0; width: auto; }
  #engine .field label { min-width: 0; margin-right: 4px; font-family: var(--vscode-editor-font-family, monospace); }
  .field { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 3px 0; }
  .field label { min-width: 84px; opacity: 0.8; }
  .field input, .field textarea { color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); padding: 2px 4px; width: 90px; font: inherit; }
  .field textarea { width: 100%; min-height: 3em; }
  .field input.short { width: 52px; }
  .field label.bit { min-width: 0; opacity: 1; margin-right: 6px; white-space: nowrap; }
  .field label.bit input { width: auto; }
  .field input.line { width: 160px; }
  textarea.code { width: 100%; box-sizing: border-box; font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 12px); color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); white-space: pre; tab-size: 2; }
  .field input.invalid { border-color: var(--vscode-inputValidation-errorBorder); }
  .field button, button { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: none; padding: 2px 8px; border-radius: 2px; cursor: pointer; }
  select, input[type=range] { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); }
`;

export const renderAptPage = (
  webview: vscode.Webview,
  script: vscode.Uri,
  settingsBlock = '',
): string =>
  renderWebviewPage({
    style: STYLE,
    body: `${settingsBlock}<aside><input id="filter" placeholder="Filter characters, exports, text"><div id="kinds" role="toolbar" aria-label="Kinds of character"></div><div id="list"></div></aside>
<main>
  <p id="progress" class="muted">Opening the movie…</p>
  <div class="toolbar" id="stage-bar">
    <div class="segmented" role="group" aria-label="Mode">
      <button id="mode-inspect" aria-pressed="true" title="Inspect: pick, move and edit what is drawn (I)">Inspect</button>
      <button id="mode-interact" aria-pressed="false" title="Interact: run everything as the game does and let the pointer drive buttons (I)">Interact</button>
    </div>
    <span class="divider"></span>
    <button id="play" title="Play or pause (Space)">▶</button>
    <button id="back" title="Previous frame (, or ← with nothing selected)">‹</button>
    <input id="frame" type="range" min="0" max="0" value="0" aria-label="Frame">
    <button id="forward" title="Next frame (. or → with nothing selected)">›</button>
    <select id="speed" title="Playback speed; 1× is the game's 30 frames a second ([ and ] to change)">${SPEEDS.map((speed) => `<option value="${speed}"${speed === 1 ? ' selected' : ''}>${speed}×</option>`).join('')}</select>
    <select id="play-from" title="Play from a labelled frame, with its scripts run from there"></select>
    <span class="divider"></span>
    <button id="scripts" class="toggle" aria-pressed="false" title="Ignore action scripts (S): play every frame in order, as if no frame script stopped or jumped; off, stop() stops and gotoAndPlay jumps, as in the game">Ignore scripts</button>
    <button id="overlays" title="What the stage draws over the movie">Overlays</button>
    <select id="zoom" title="Zoom">${ZOOMS.map((zoom) => `<option value="${zoom}">${zoom === 'fit' ? 'Fit' : `${Number(zoom) * 100}%`}</option>`).join('')}</select>
  </div>
  <div id="frame-label" class="muted"></div>
  <canvas id="stage"></canvas>
  <div id="timeline"></div>
  <p id="summary"></p>
  <div id="integrity"></div>
  <div id="log"></div>
</main>
<section id="side">
  <div class="tabs" role="tablist" aria-label="Details">
    <button role="tab" id="tab-details" aria-controls="details" aria-selected="true" title="The selected character's record, frames and scripts">Character</button>
    <button role="tab" id="tab-inspector" aria-controls="inspect" aria-selected="false" tabindex="-1" title="What is picked on the stage, and the texture it is drawn from">Inspector</button>
    <button role="tab" id="tab-engine" aria-controls="engine" aria-selected="false" tabindex="-1">Engine<span id="engine-count" class="badge"></span></button>
  </div>
  <div id="details" class="tab-panel" role="tabpanel" aria-labelledby="tab-details"></div>
  <div id="inspect" class="tab-panel" role="tabpanel" aria-labelledby="tab-inspector" hidden><div id="inspector"></div><p id="inspect-hint" class="muted">Click something on the stage to inspect it.</p><div id="atlas"></div></div>
  <div id="engine" class="tab-panel" role="tabpanel" aria-labelledby="tab-engine" hidden></div>
</section>
<div id="notice" hidden></div>`,
    allow: { img: 'blob: data:', script: webview.cspSource },
    styleSources: `${webview.cspSource} 'unsafe-inline'`,
    scriptFiles: [script.toString()],
  });
