import type * as vscode from 'vscode';
import type { TextureRegion } from '../../webview/preview/protocol';

export interface RegionKind {
  owns(id: string): boolean;
  read(
    ids: readonly string[],
    decoded: readonly [number, number],
  ): Promise<TextureRegion[]>;
  write(
    id: string,
    decoded: readonly [number, number],
    rect: readonly [number, number, number, number],
  ): Promise<boolean>;
  documentOf(id: string): vscode.Uri | undefined;
}
