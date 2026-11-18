export const editorRows = (value: string): number =>
  Math.max(2, value.split('\n').length);

export const isEdited = (original: string, edited: string): boolean =>
  edited !== original.replace(/\r\n?/g, '\n');
