import type { WndBox } from '../../formats/wnd/wndLayout';

export interface PreviewImage {
  texture: string;
  uv: [number, number, number, number];
  rotated: boolean;
  extent: [number, number];
}

export interface WndLayoutMessage {
  kind: 'layout';
  boxes: WndBox[];
  images: Record<string, PreviewImage>;
  textures: Record<string, string>;
}

export type ToWndPage = WndLayoutMessage;

export type FromWndPage =
  | { kind: 'ready' }
  | { kind: 'reveal'; offset: number };
