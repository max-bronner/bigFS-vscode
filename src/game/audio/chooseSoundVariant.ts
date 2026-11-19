import type { AudioVariant } from './sageAudioResolve';

const lastLabel = (label: string) => label.split(' › ').pop() ?? label;

export const chooseSoundVariant = (
  variants: readonly AudioVariant[],
): AudioVariant | undefined =>
  variants.find((variant) => /^sounds\w*$/i.test(lastLabel(variant.label))) ??
  variants[0];
