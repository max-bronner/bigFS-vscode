import { getVsCodeApi } from '../shared/vscodeApi';

export interface PageState {
  zoom?: number;
  panelWidth?: number;
  sky?: string;
}

export const readPageState = (): PageState =>
  (getVsCodeApi().getState() as PageState | undefined) ?? {};

export const savePageState = (change: PageState): void =>
  getVsCodeApi().setState({ ...readPageState(), ...change });
