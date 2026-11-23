import type { PartGroup } from '../../game/objects/groupComposedParts';

export interface PartGroupLabel {
  title: string;
  detail: string;
}

export const describeModuleTag = (tag: string): string => {
  const words = tag
    .replace(/^moduletag_?/i, '')
    .replace(/^draw_?(?=.)/i, '')
    .replace(/_?draw(?=_?\d*$)/i, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z\d])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .map((word) => (/^[A-Z][A-Z\d]+$/.test(word) ? word : word.toLowerCase()))
    .join(' ');

  return /[a-z]/i.test(words) ? words.charAt(0).toUpperCase() + words.slice(1) : tag;
};

export const describePartGroup = (group: PartGroup, previewed: string): PartGroupLabel => {
  const [first] = group.parts;
  const { owner, moduleType, moduleTag, field } = first.source;
  const isOwn = owner.toLowerCase() === previewed.toLowerCase();
  const isModule = !first.object && !!first.draw;
  const module = isModule ? moduleType : [moduleType, moduleTag].filter(Boolean).join(' ');
  const where = field === 'Draw' ? module : `${field} of ${module}`;

  return {
    title: isModule ? describeModuleTag(first.draw!) : group.name,
    detail: isOwn ? where : `${where} in ${owner}`,
  };
};
