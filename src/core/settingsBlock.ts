export const SETTINGS_BLOCK_ID = 'previewSettings';

export const renderSettingsBlock = (settings: unknown): string =>
  `<script type="application/json" id="${SETTINGS_BLOCK_ID}">${
    (JSON.stringify(settings ?? null) ?? 'null').replace(/</g, '\\u003c')
  }</script>`;

export const readSettingsBlock = (text: string | null | undefined): unknown => {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};
