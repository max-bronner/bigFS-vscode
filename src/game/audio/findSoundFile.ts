import { chooseSoundVariant } from './chooseSoundVariant';
import { listSoundFileNames } from './listSoundFileNames';
import { resolveAudio } from './sageAudioResolve';
import type { AudioLookup } from './sageAudioResolve';

export const findSoundFile = async (
  name: string,
  lookup: AudioLookup,
  exists: (fileName: string) => boolean | Promise<boolean>,
): Promise<string | undefined> => {
  const variant = chooseSoundVariant(await resolveAudio(name, lookup));

  for (const candidate of listSoundFileNames(variant?.file ?? name)) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  return undefined;
};
