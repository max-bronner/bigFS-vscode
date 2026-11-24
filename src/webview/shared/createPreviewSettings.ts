import { SETTINGS_BLOCK_ID, readSettingsBlock } from '../../core/settingsBlock';

export type SettingCheck<V> = (value: unknown) => value is V;

export interface SettingRule<V> {
  fallback: V;
  check: SettingCheck<V>;
}

export type SettingRules<T> = { [K in keyof T]: SettingRule<T[K]> };

export interface SettingsSection<T> {
  readonly values: Readonly<T>;
  set<K extends keyof T>(key: K, value: T[K]): void;
}

export interface PreviewSettings {
  section<T>(name: string, rules: SettingRules<T>): SettingsSection<T>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

export const isColour = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export const isOneOf =
  <V>(values: readonly V[]): SettingCheck<V> =>
  (value): value is V =>
    values.includes(value as V);

export const isNullOr =
  <V>(check: SettingCheck<V>): SettingCheck<V | null> =>
  (value): value is V | null =>
    value === null || check(value);

export const readSettings = <T>(kept: unknown, rules: SettingRules<T>): T => {
  const read = isRecord(kept) ? kept : {};

  return Object.fromEntries(
    Object.entries<SettingRule<unknown>>(rules).map(([key, { fallback, check }]) => [
      key,
      check(read[key]) ? read[key] : fallback,
    ]),
  ) as T;
};

export const createPreviewSettings = (
  kept: unknown,
  keep: (settings: Record<string, unknown>) => void,
): PreviewSettings => {
  const all: Record<string, unknown> = isRecord(kept) ? { ...kept } : {};

  return {
    section: <T>(name: string, rules: SettingRules<T>): SettingsSection<T> => {
      const values = readSettings(all[name], rules);

      return {
        values,
        set: (key, value) => {
          if (values[key] !== value) {
            values[key] = value;
            all[name] = values;
            keep({ ...all });
          }
        },
      };
    },
  };
};

export const readKeptSettings = (): unknown =>
  readSettingsBlock(document.getElementById(SETTINGS_BLOCK_ID)?.textContent);
