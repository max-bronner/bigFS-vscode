import * as os from 'os';
import * as vscode from 'vscode';
import { SCHEME } from '../../constants';
import { registerCommand } from '../../platform/commands';
import { settings } from '../../platform/settings';
import { findInstalls, systemHost } from '../../node/installDiscovery';
import type { FoundInstall } from '../../node/installDiscovery';

const OFFERED_KEY = `${SCHEME}.installsOffered`;

interface InstallItem extends vscode.QuickPickItem {
  install: FoundInstall;
}

const detect = async (): Promise<FoundInstall[]> => {
  try {
    return await findInstalls(
      systemHost({
        platform: process.platform,
        env: process.env,
        home: os.homedir(),
      }),
    );
  } catch {
    return [];
  }
};

const pick = async (installs: FoundInstall[]): Promise<void> => {
  const items: InstallItem[] = installs.map((install) => ({
    label: install.game.title,
    description: install.folder,
    detail:
      install.game.id === 'rotwk' &&
      installs.some(({ game }) => game.id === 'bfme2')
        ? 'Also sets the BFME II install found as the game beneath it'
        : undefined,
    install,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Game installs found: use one as the base game',
    placeHolder:
      'The folder becomes bigfs.baseGameFolder; it is never written to',
    ignoreFocusOut: true,
  });

  if (!picked) {
    return;
  }

  const target = vscode.ConfigurationTarget.Global;

  await settings.baseGameFolder.update(picked.install.folder, target);

  const underlying =
    picked.install.game.id === 'rotwk'
      ? installs.find(({ game }) => game.id === 'bfme2')
      : undefined;

  if (underlying) {
    await settings.underlyingGameFolder.update(underlying.folder, target);
  }
};

export const registerInstallDetectCommands = (
  context: vscode.ExtensionContext,
  whenReady: Promise<void>,
): void => {
  const isUnset = (): boolean =>
    !settings.baseGameFolder.get().trim() &&
    !settings.underlyingGameFolder.get().trim();

  context.subscriptions.push(
    registerCommand('bigfs.findGameInstalls', async () => {
      const installs = await detect();

      if (!installs.length) {
        void vscode.window.showInformationMessage(
          'No game install was found. Set bigfs.baseGameFolder to its folder.',
        );
        return;
      }

      await pick(installs);
    }),
  );

  void whenReady
    .then(async () => {
      if (!isUnset() || context.globalState.get<boolean>(OFFERED_KEY)) {
        return;
      }

      const installs = await detect();

      if (!installs.length) {
        return;
      }

      await context.globalState.update(OFFERED_KEY, true);
      await pick(installs);
    })
    .catch(() => undefined);
};
