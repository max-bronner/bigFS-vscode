import { createNonce } from './webviewNonce';

export interface WebviewPage {
  style: string;
  body: string;
  script?: string;
  allow?: { img?: string; media?: string; script?: string };
  scriptFiles?: string[];
  styleSources?: string;
}

export const renderWebviewPage = ({
  style,
  body,
  script,
  allow = {},
  scriptFiles = [],
  styleSources,
}: WebviewPage): string => {
  const nonce = createNonce();
  const policy = [
    "default-src 'none'",
    allow.img && `img-src ${allow.img}`,
    allow.media && `media-src ${allow.media}`,
    `style-src ${styleSources ?? `'nonce-${nonce}'`}`,
    `script-src 'nonce-${nonce}'${allow.script ? ` ${allow.script}` : ''}`,
  ]
    .filter(Boolean)
    .join('; ');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${policy};">
<style nonce="${nonce}">${style}</style>
</head><body>
${body}
${scriptFiles.map((file) => `<script nonce="${nonce}" src="${file}"></script>`).join('\n')}
${script ? `<script nonce="${nonce}">${script}</script>` : ''}
</body></html>`;
};
