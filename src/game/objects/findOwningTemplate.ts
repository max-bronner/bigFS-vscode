import type { SageBlock } from '../../formats/ini/sageIniParser';

const TEMPLATE = /^(object|childobject|objectreskin)$/i;

export const findOwningTemplate = (
  blocks: readonly SageBlock[],
  line: number,
): SageBlock | undefined => {
  const owner = blocks.find(
    (block) => block.startLine <= line && line <= block.endLine,
  );

  return owner && TEMPLATE.test(owner.keyword) ? owner : undefined;
};
