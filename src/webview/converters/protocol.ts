import type { TextureTarget } from '../../formats/texture/textureTargets';

export type ConverterKind = 'image' | 'cursor' | 'video' | 'strings';

export interface ImageSettings {
  target: TextureTarget;
  mipmaps: boolean;
  output: 'beside' | 'folder';
}

export type FromConvertersPage =
  | { kind: 'ready' }
  | { kind: 'pick'; converter: ConverterKind; settings: ImageSettings }
  | { kind: 'decoded'; id: number; width: number; height: number; pixels: Uint8Array }
  | { kind: 'decodeFailed'; id: number; message: string };

export type ToConvertersPage =
  | { kind: 'decode'; id: number; name: string; bytes: Uint8Array }
  | { kind: 'log'; converter: ConverterKind; text: string; isError?: boolean };
