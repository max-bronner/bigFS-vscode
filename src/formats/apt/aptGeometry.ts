export type Rgba = [number, number, number, number];

export type RuStyle =
  | { kind: 'solid'; color: Rgba }
  | { kind: 'line'; width: number; color: Rgba }
  | {
      kind: 'texture';
      color: Rgba;
      character: number;
      transform: [number, number, number, number, number, number];
    };

export interface RuRun {
  style: RuStyle;
  triangles: number[];
  lines: number[];
}

export const parseRu = (text: string): RuRun[] => {
  const runs: RuRun[] = [];
  let current: RuRun | undefined;

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();

    if (!line || line === 'c') {
      return;
    }

    const [kind, body = ''] = line.split(/\s+/, 2);
    const fields = body.split(':');
    const numbers = fields.map(Number);
    const fail = (reason: string) => {
      throw new Error(`.ru line ${index + 1}: ${reason}`);
    };

    if (kind === 's') {
      const [styleKind, ...values] = fields;
      const n = values.map(Number);
      let style: RuStyle;

      if (styleKind === 's' && n.length === 4) {
        style = { kind: 'solid', color: [n[0], n[1], n[2], n[3]] };
      } else if (styleKind === 'l' && n.length === 5) {
        style = { kind: 'line', width: n[0], color: [n[1], n[2], n[3], n[4]] };
      } else if (styleKind === 'tc' && n.length === 11) {
        style = {
          kind: 'texture',
          color: [n[0], n[1], n[2], n[3]],
          character: n[4],
          transform: [n[5], n[6], n[7], n[8], n[9], n[10]],
        };
      } else {
        return fail(`unknown style '${body}'`);
      }

      if (n.some((value) => !Number.isFinite(value))) {
        return fail('a style value is not a number');
      }

      current = { style, triangles: [], lines: [] };
      runs.push(current);
      return;
    }

    if (!current) {
      return fail('a primitive before any style');
    }

    if (
      kind === 't' &&
      numbers.length === 6 &&
      numbers.every(Number.isFinite)
    ) {
      current.triangles.push(...numbers);
    } else if (
      kind === 'l' &&
      numbers.length === 4 &&
      numbers.every(Number.isFinite)
    ) {
      current.lines.push(...numbers);
    } else {
      fail(`cannot read '${line}'`);
    }
  });

  return runs;
};

export type DatLocation =
  | { kind: 'atlas'; page: number }
  | { kind: 'standalone'; rect: [number, number, number, number] };

export const parseDat = (text: string): Map<number, DatLocation> => {
  const entries = new Map<number, DatLocation>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();

    if (!line || line.startsWith(';')) {
      return;
    }

    const atlas = /^(\d+)\s*->\s*(\d+)$/.exec(line);
    const standalone = /^(\d+)\s*=\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/.exec(line);

    if (atlas) {
      entries.set(Number(atlas[1]), { kind: 'atlas', page: Number(atlas[2]) });
    } else if (standalone) {
      const [, id, ...rect] = standalone.map(Number);

      entries.set(id, {
        kind: 'standalone',
        rect: rect as [number, number, number, number],
      });
    } else {
      throw new Error(`.dat line ${index + 1}: cannot read '${line}'`);
    }
  });

  return entries;
};

export const getTexturePath = (
  movie: string,
  id: number,
  location: DatLocation,
): string =>
  `art/textures/apt_${movie.toLowerCase()}_${location.kind === 'atlas' ? location.page : id}.tga`;

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));

export const writeRu = (runs: RuRun[]): string => {
  const lines: string[] = [];
  const join = (values: number[]) => values.map(formatNumber).join(':');

  for (const run of runs) {
    const { style } = run;

    lines.push('c');
    lines.push(
      style.kind === 'solid'
        ? `s s:${join(style.color)}`
        : style.kind === 'line'
          ? `s l:${join([style.width, ...style.color])}`
          : `s tc:${join([...style.color, style.character, ...style.transform])}`,
    );
    for (let i = 0; i < run.triangles.length; i += 6) {
      lines.push(`t ${join(run.triangles.slice(i, i + 6))}`);
    }
    for (let i = 0; i < run.lines.length; i += 4) {
      lines.push(`l ${join(run.lines.slice(i, i + 4))}`);
    }
  }
  return lines.join('\n') + '\n';
};

export const writeDat = (entries: Map<number, DatLocation>): string => {
  const sorted = [...entries].sort((a, b) => a[0] - b[0]);
  const header = '; Created by AptToBigc.';

  return (
    [
      header,
      ...sorted.flatMap(([id, location]) =>
        location.kind === 'standalone'
          ? [`${id}=${location.rect.join(' ')}`]
          : [],
      ),
      header,
      ...sorted.flatMap(([id, location]) =>
        location.kind === 'atlas' ? [`${id}->${location.page}`] : [],
      ),
    ].join('\r\n') + '\r\n'
  );
};

export const runBounds = (
  runs: RuRun[],
): [number, number, number, number] | undefined => {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const run of runs) {
    for (const points of [run.triangles, run.lines]) {
      for (let i = 0; i < points.length; i += 2) {
        xs.push(points[i]);
        ys.push(points[i + 1]);
      }
    }
  }
  return xs.length
    ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    : undefined;
};

export const fitTexture = (
  [left, top, right, bottom]: [number, number, number, number],
  [u0, v0, u1, v1]: [number, number, number, number],
): [number, number, number, number, number, number] => {
  const scaleU = (u1 - u0) / (right - left || 1);
  const scaleV = (v1 - v0) / (bottom - top || 1);

  return [scaleU, 0, 0, scaleV, u0 - left * scaleU, v0 - top * scaleV];
};

export const checkRuns = (runs: unknown): runs is RuRun[] =>
  Array.isArray(runs) &&
  runs.every((run: RuRun) => {
    const style = run?.style;
    const numbers = (values: unknown, size: number) =>
      Array.isArray(values) &&
      values.length % size === 0 &&
      values.every((value) => Number.isFinite(value));

    return (
      numbers(run?.triangles, 6) &&
      numbers(run?.lines, 4) &&
      numbers(style?.color, 4) &&
      style.color.length === 4 &&
      (style.kind === 'solid' ||
        (style.kind === 'line' && Number.isFinite(style.width)) ||
        (style.kind === 'texture' &&
          Number.isInteger(style.character) &&
          numbers(style.transform, 6) &&
          style.transform.length === 6))
    );
  });

export const fitRunTo = (
  run: RuRun,
  image: number,
  box: [number, number, number, number],
): RuRun => ({
  ...run,
  style: {
    kind: 'texture',
    color:
      run.style.kind === 'texture' ? run.style.color : [255, 255, 255, 255],
    character: image,
    transform: fitTexture(runBounds([run]) ?? [0, 0, 1, 1], box),
  },
});
