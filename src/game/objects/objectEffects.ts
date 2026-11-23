export interface ObjectEffect {
  field: string;
  name: string;
  module?: string;
  isSystem?: boolean;
  bone?: string;
  phase?: string;
  when?: string[];
}

const DAMAGE: readonly [RegExp, string][] = [
  [/^reallydamaged/, 'REALLYDAMAGED'],
  [/^damaged/, 'DAMAGED'],
  [/^rubble/, 'RUBBLE'],
];

export const getEffectConditions = (
  module: string | undefined,
  field: string,
): string[] | undefined => {
  const type = module?.toLowerCase() ?? '';
  const key = field.toLowerCase();

  if (type === 'transitiondamagefx') {
    const damage = DAMAGE.find(([pattern]) => pattern.test(key));

    return damage && [damage[1]];
  }
  if (key === 'burningdeathfx') {
    return ['BURNINGDEATH'];
  }
  if (key === 'wadingparticlesys') {
    return ['WADING'];
  }
  if (key === 'becomestealthedfx') {
    return ['INVISIBLE_STEALTH'];
  }
  if (type === 'structurecollapseupdate') {
    return ['COLLAPSING', 'RUBBLE'];
  }
  if (type === 'rubbleriseupdate') {
    return ['POST_COLLAPSE', 'POST_RUBBLE'];
  }
  if (type === 'structuretoppleupdate') {
    return ['COLLAPSING', 'DYING'];
  }
  return /slowdeath|fxlistdie/.test(type) ? ['DYING'] : undefined;
};

export const describeCondition = (condition: string): string => {
  const text = condition.toLowerCase().replace(/^reallydamaged$/, 'really damaged');

  return text
    .replace(/^burningdeath$/, 'burning to death')
    .replace(/_/g, ' ')
    .trim();
};

export const describeOccasion = ({ when, module }: ObjectEffect): string => {
  if (when?.length) {
    return `When ${when.map(describeCondition).join(' or ')}`;
  }

  const words = (module ?? 'The object itself')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/ (Update|Behavior|Module)$/, '');

  return `Event: ${words}`;
};
