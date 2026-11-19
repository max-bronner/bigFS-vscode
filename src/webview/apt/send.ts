import type { AptEdit } from '../../formats/apt/writer/aptEdit';
import { getVsCodeApi } from '../shared/vscodeApi';
import type { FromPage } from './protocol';

const vscode = getVsCodeApi<FromPage>();

export const send = (edit: AptEdit): void =>
  vscode.postMessage({ kind: 'edit', edit });
