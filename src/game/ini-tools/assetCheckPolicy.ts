export const AUTO_MINIMUM_MODELS = 200;

export type AssetCheckMode = 'auto' | 'on' | 'off';

export type AssetCheckDecision = 'check' | 'off' | 'no-base-game';

export const decideAssetCheck = (
  mode: AssetCheckMode,
  hasBaseGameFolder: boolean,
  modelCount: number,
): AssetCheckDecision => {
  if (mode !== 'auto') {
    return mode === 'on' ? 'check' : 'off';
  }
  if (!hasBaseGameFolder) {
    return 'no-base-game';
  }
  return modelCount >= AUTO_MINIMUM_MODELS ? 'check' : 'off';
};
