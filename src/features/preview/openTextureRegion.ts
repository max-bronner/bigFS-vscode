import * as vscode from 'vscode';
import { PREVIEW_VIEW_TYPE } from '../../constants';
import type { TextureRegions } from './createTextureRegions';

export const openTextureRegion = async (
  regions: TextureRegions,
  texture: vscode.Uri,
  regionId: string,
): Promise<void> => {
  regions.focus(texture, regionId);
  await vscode.commands.executeCommand(
    'vscode.openWith',
    texture,
    PREVIEW_VIEW_TYPE,
    vscode.ViewColumn.Beside,
  );
};
