import type { WorkspaceConfiguration } from 'vscode';

export type CheckMode = 'auto' | 'on' | 'off';
export type SageGameId = 'rotwk' | 'bfme2' | 'bfme1';
export type ExplorerView = 'archives' | 'game';

export type ConfigurationSource = () => Pick<
  WorkspaceConfiguration,
  'get' | 'update'
>;

export interface Setting<Value> {
  readonly key: string;
  readonly defaultValue: Value;
  get: () => Value;
  update: (value: Value, target?: number | boolean) => Thenable<void>;
}

const defineSetting =
  (source: ConfigurationSource) =>
  <Value>(key: string, defaultValue: Value): Setting<Value> => ({
    key,
    defaultValue,
    get: () => source().get<Value>(key, defaultValue),
    update: (value, target) => source().update(key, value, target),
  });

export const createSettings = (source: ConfigurationSource) => {
  const define = defineSetting(source);

  return {
    iniGame: define<SageGameId>('bigfs.ini.game', 'rotwk'),
    iniCheckReferences: define<CheckMode>('bigfs.ini.checkReferences', 'auto'),
    iniCheckAssets: define<CheckMode>('bigfs.ini.checkAssets', 'auto'),
    iniCheckStrings: define<CheckMode>('bigfs.ini.checkStrings', 'auto'),
    language: define<string>('bigfs.language', 'auto'),
    explorerView: define<ExplorerView>('bigfs.explorer.view', 'archives'),
    baseGameFolder: define<string>('bigfs.baseGameFolder', ''),
    underlyingGameFolder: define<string>('bigfs.underlyingGameFolder', ''),
    gameExecutable: define<string>('bigfs.game.executable', ''),
    gameArguments: define<string[]>('bigfs.game.arguments', []),
    ffmpegPath: define<string>('bigfs.ffmpegPath', ''),
    vp6KeyFrameSeconds: define<number>('bigfs.vp6.keyFrameSeconds', 2),
  };
};
