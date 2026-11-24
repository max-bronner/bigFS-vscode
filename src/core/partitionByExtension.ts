export const partitionByExtension = <T>(
  files: readonly T[],
  getName: (file: T) => string,
  extensions: readonly string[],
): { accepted: T[]; skipped: T[] } => {
  const accepted: T[] = [];
  const skipped: T[] = [];

  for (const file of files) {
    const name = getName(file);
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';

    (extensions.includes(extension) ? accepted : skipped).push(file);
  }
  return { accepted, skipped };
};
