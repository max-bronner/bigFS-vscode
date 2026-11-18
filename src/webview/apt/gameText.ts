import {
  resolveAptText,
  stripTextStyle,
  textKey,
} from '../../formats/apt/aptText';

let texts: Record<string, string> | undefined;

export const setGameText = (resolved: Record<string, string> | undefined) => {
  texts = resolved;
};

export const localise = (text: string): string => {
  if (!texts) {
    return text;
  }

  const key = textKey(text);

  return key
    ? (texts[key.toLowerCase()] ?? resolveAptText(text, () => undefined))
    : stripTextStyle(text);
};

export const mergeGameText = (more: Record<string, string> | undefined) => {
  if (more) {
    texts = { ...texts, ...more };
  }
};
