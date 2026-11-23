import { element } from '../shared/element';
import type { Box } from '../shared/pickBox';
import { listFileUses } from './listFileUses';
import type { FileUse, TextureRegion } from './protocol';

export interface RegionPanelEvents {
  onSelect(id: string): void;
  onEdit(id: string, rect: Box): void;
  onReveal(source: NonNullable<TextureRegion['source']>): void;
}

export interface RegionPanelContent {
  uses?: readonly FileUse[];
  regions: readonly TextureRegion[];
  selected?: string;
  loading?: boolean;
}

const FILTER_FROM = 12;

const EDGES = ['Left', 'Top', 'Right', 'Bottom'] as const;

const createEdgeFields = (
  region: TextureRegion,
  onEdit: RegionPanelEvents['onEdit'],
): HTMLElement => {
  const fields = element('div', undefined, 'edges');
  const inputs = EDGES.map((edge, at) => {
    const input = element('input');

    input.type = 'number';
    input.step = '1';
    input.value = String(Math.round(region.rect[at]));
    input.disabled = !region.editable;
    input.title = edge;
    input.onchange = () => {
      const rect = inputs.map((each) => Number(each.value)) as Box;

      if (rect.every(Number.isFinite)) {
        onEdit(region.id, rect);
      }
    };
    fields.append(element('label', edge), input);

    return input;
  });

  return fields;
};

const createDetail = (
  region: TextureRegion,
  events: RegionPanelEvents,
): HTMLElement => {
  const detail = element('div', undefined, 'detail');

  detail.append(element('strong', region.label));
  if (region.location) {
    const where = element('p', `In ${region.location.container}`);

    where.title = region.location.detail;
    detail.append(where);
  }
  detail.append(createEdgeFields(region, events.onEdit));
  if (region.rotated) {
    detail.append(
      element(
        'p',
        'Drawn dashed: turned. The box is the rect as the file stores it.',
      ),
    );
  }
  if (region.note) {
    detail.append(element('p', region.note));
  }
  if (region.source) {
    const { source } = region;
    const open = element('button', 'Open definition');

    open.onclick = () => events.onReveal(source);
    detail.append(open);
  }
  return detail;
};

export const createRegionPanel = (
  root: HTMLElement,
  events: RegionPanelEvents,
): ((content: RegionPanelContent) => void) => {
  const heading = element('h3');
  const filter = element('input');
  const detail = element('div');
  const list = element('div');
  let last: RegionPanelContent = { regions: [] };

  filter.type = 'search';
  filter.placeholder = 'Filter what uses this texture';
  root.replaceChildren(heading, filter, detail, list);

  const render = ({ uses = [], regions, selected, loading }: RegionPanelContent) => {
    const wanted = filter.value.trim().toLowerCase();
    const total = uses.length + regions.length;
    const shownUses = uses.filter((use) =>
      (use.owner ?? use.uri).toLowerCase().includes(wanted),
    );
    const shown = regions
      .filter((region) => region.label.toLowerCase().includes(wanted))
      .sort(
        (a, b) =>
          a.label.localeCompare(b.label, undefined, { numeric: true }) ||
          (a.location?.container ?? '').localeCompare(b.location?.container ?? ''),
      );
    const chosen = regions.find((region) => region.id === selected);
    const groups = new Map<string, TextureRegion[]>();

    root.hidden = !total;
    heading.textContent = `Used by (${total})${loading ? ' · searching…' : ''}`;
    filter.hidden = total < FILTER_FROM;
    detail.replaceChildren(...(chosen ? [createDetail(chosen, events)] : []));
    for (const region of shown) {
      groups.set(region.group, [...(groups.get(region.group) ?? []), region]);
    }
    const iniGroup = element('div', undefined, 'group uses');

    iniGroup.append(
      element('h4', `INI files (${shownUses.length})`),
      ...listFileUses(shownUses, events.onReveal),
    );
    list.replaceChildren(
      ...(shownUses.length ? [iniGroup] : []),
      ...[...groups].map(([group, members]) => {
        const section = element('div', undefined, 'group');

        section.append(element('h4', `${group} (${members.length})`));
        for (const region of members) {
          const item = element('button', undefined, 'item');

          item.append(element('span', region.label));
          if (region.location) {
            item.append(element('span', region.location.container, 'where'));
            item.title = `${region.label}\n${region.location.detail}`;
          }
          item.setAttribute('aria-pressed', String(region.id === selected));
          item.onclick = () => events.onSelect(region.id);
          section.append(item);
        }
        return section;
      }),
    );
    list
      .querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  };

  filter.oninput = () => render(last);

  return (content) => {
    last = content;
    render(content);
  };
};
