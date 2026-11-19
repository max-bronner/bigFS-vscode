import {
  FIXED_BINDING_RULES,
  FIXED_EXTERN_RULES,
  FIXED_PARAMETER_RULES,
} from './fixedSuggestionRules';
import {
  EXTERN_RULES,
  IMAGE_RULES,
  PARAMETER_RULES,
} from './iniSuggestionRules';
import type { SuggestionRule } from './suggestionKinds';

export const findParameterSuggestion = (
  call: string,
  parameter: string,
): SuggestionRule | undefined =>
  [...PARAMETER_RULES, ...FIXED_PARAMETER_RULES].find(
    (rule) => rule.call.test(call) && rule.parameter.test(parameter),
  );

export const findImageSuggestion = (key: string): SuggestionRule | undefined =>
  IMAGE_RULES.find((rule) => rule.name.test(key));

export const findExternSuggestion = (
  name: string,
): SuggestionRule | undefined =>
  [...EXTERN_RULES, ...FIXED_EXTERN_RULES].find((rule) => rule.name.test(name));

export const findBindingSuggestion = (
  name: string,
): SuggestionRule | undefined =>
  FIXED_BINDING_RULES.find((rule) => rule.name.test(name));

export const PALANTIR_STATES = [
  { value: '_good', evil: false, note: 'good sides' },
  { value: '_evil', evil: true, note: 'evil sides' },
  { value: '_goodSingle', evil: false, note: 'good, single resource bar' },
  { value: '_evilSingle', evil: true, note: 'evil, single resource bar' },
] as const;
