const SOUND_EXTENSIONS = ['wav', 'mp3'];

export const listSoundFileNames = (name: string): string[] => {
  const base = name.replace(/^.*[\\/]/, '').toLowerCase();

  return /\.[a-z0-9]+$/.test(base)
    ? [base]
    : SOUND_EXTENSIONS.map((extension) => `${base}.${extension}`);
};
