import type { Instance } from './instance';

export const describeInstance = (instance: Instance): string =>
  (instance.name ? `"${instance.name}" ` : "") +
  `#${instance.id}${instance.path ? " @" + instance.path : ""}`;
