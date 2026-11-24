import type { Memento } from 'vscode';
import { renderSettingsBlock } from '../../core/settingsBlock';

export type PreviewKind = 'model' | 'texture' | 'object' | 'fx' | 'apt' | 'map';

export interface PreviewSettingsStore {
  renderBlock(): string;
  keep(settings: unknown): Thenable<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const createPreviewSettingsStore = (
  state: Memento,
  kind: PreviewKind,
): PreviewSettingsStore => {
  const key = `bigfs.previewSettings.${kind}`;

  return {
    renderBlock: () => renderSettingsBlock(state.get(key)),
    keep: (settings) => (isRecord(settings) ? state.update(key, settings) : Promise.resolve()),
  };
};
