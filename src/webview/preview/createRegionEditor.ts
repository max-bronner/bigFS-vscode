import type { Box } from '../shared/pickBox';
import { createPanelSplitter } from './createPanelSplitter';
import type { VisibleBox } from './getOverlayWindow';
import type { SettingsSection } from '../shared/createPreviewSettings';
import type { TextureSettings } from './previewPageSettings';
import { createRegionLayer } from './regionLayer';
import { createRegionPanel } from './regionPanel';
import type { FileUse, FromPreviewPage, RegionsMessage } from './protocol';

export interface RegionEditor {
  mount(stage: HTMLElement): void;
  show(message: RegionsMessage): void;
  showUses(uses: readonly FileUse[]): void;
  fit(
    cssWidth: number,
    cssHeight: number,
    pixelWidth: number,
    visible: VisibleBox,
  ): void;
}

export const createRegionEditor = (
  panelRoot: HTMLElement,
  post: (message: FromPreviewPage) => void,
  settings: SettingsSection<Pick<TextureSettings, 'panelWidth'>>,
): RegionEditor => {
  let content: RegionsMessage = { kind: 'regions', regions: [] };
  let uses: readonly FileUse[] = [];

  const select = (id: string) => {
    content = { ...content, selected: id };
    render();
  };
  const edit = (id: string, rect: Box) => {
    content = {
      ...content,
      regions: content.regions.map((region) =>
        region.id === id ? { ...region, rect } : region,
      ),
    };
    render();
    post({ kind: 'editRegion', id, rect });
  };
  const layer = createRegionLayer({ onSelect: select, onEdit: edit });
  const show = createRegionPanel(panelRoot, {
    onSelect: select,
    onEdit: edit,
    onReveal: ({ uri, line }) => post({ kind: 'reveal', uri, line }),
  });

  const setPanelWidth = createPanelSplitter(panelRoot, {
    onResize: (width) => settings.set('panelWidth', width),
  });
  const saved = settings.values.panelWidth;

  if (saved) {
    setPanelWidth(saved);
  }

  function render() {
    layer.setRegions(content.regions, content.selected);
    show({ ...content, uses });
  }

  return {
    mount(stage) {
      content = { kind: 'regions', regions: [] };
      uses = [];
      stage.append(layer.element);
      render();
    },
    show(message) {
      content = {
        ...message,
        append: undefined,
        selected: message.selected ?? content.selected,
        regions: message.append
          ? [
              ...content.regions.filter(
                (old) => !message.regions.some((each) => each.id === old.id),
              ),
              ...message.regions,
            ]
          : message.regions,
      };
      render();
    },
    showUses(found) {
      uses = found;
      render();
    },
    fit: layer.fit,
  };
};
