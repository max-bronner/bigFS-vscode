import { parseSageIni } from '../../formats/ini/sageIniParser';
import type { ComposableObject } from '../../game/objects/objectComposition';
import { readObjectScene } from '../../game/objects/objectScene';
import type { ObjectScene } from '../../game/objects/objectScene';
import { loadSageIniSchema } from './loadSageIniSchema';

export const toObject = (lines: string[]): ComposableObject => {
  const schema = loadSageIniSchema();
  const parsed = parseSageIni(lines, schema);
  const scene = readObjectScene(parsed, schema, () => false, () => false, lines)!;

  return { name: scene.name, parsed, scene };
};

export const toScene = (lines: string[]): ObjectScene => toObject(lines).scene;
