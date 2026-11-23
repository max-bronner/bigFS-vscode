const PRESSED_INPUTS = new Map<string, readonly string[]>([
  ['checkbox', [' ']],
  ['radio', [' ']],
  ['color', [' ']],
  ['file', [' ']],
  ['range', []],
  ['button', []],
  ['submit', []],
  ['reset', []],
  ['image', []],
]);

export const isFieldKey = (tagName: string, type: string | undefined, key: string): boolean => {
  switch (tagName.toUpperCase()) {
    case 'TEXTAREA':
    case 'SELECT':
      return true;
    case 'INPUT':
      return PRESSED_INPUTS.get(type?.toLowerCase() ?? 'text')?.includes(key) ?? true;
    default:
      return false;
  }
};
