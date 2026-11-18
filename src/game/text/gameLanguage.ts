export const AUTO_LANGUAGE = 'auto';

export const languageOfArchive = (archivePath: string): string | undefined => {
  const match = /(?:^|[\\/])lang[\\/]([^\\/]+)\.big$/i.exec(archivePath);
  const name = match?.[1].toLowerCase();

  return name && !name.endsWith('audio') ? name : undefined;
};

export const installedLanguages = (
  archivePaths: Iterable<string>,
): string[] => {
  const found = new Set<string>();

  for (const path of archivePaths) {
    const language = languageOfArchive(path);

    if (language) {
      found.add(language);
    }
  }
  return [...found];
};

export interface LanguageChoice {
  language?: string;
  ask: boolean;
}

export const chooseLanguage = (
  setting: string,
  installed: readonly string[],
  remembered?: string,
): LanguageChoice => {
  const wanted = setting.trim().toLowerCase();

  if (wanted && wanted !== AUTO_LANGUAGE) {
    return { language: wanted, ask: false };
  }
  if (installed.length === 1) {
    return { language: installed[0], ask: false };
  }
  if (remembered && installed.includes(remembered)) {
    return { language: remembered, ask: false };
  }
  return { ask: installed.length > 1 };
};
