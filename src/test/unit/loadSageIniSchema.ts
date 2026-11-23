import { readFileSync } from 'fs';
import { join } from 'path';
import { createSageIniSchema } from '../../formats/ini/sageIniSchema';
import type { SageGame, SageIniSchema } from '../../formats/ini/sageIniSchema';

let schemaFile: ReturnType<typeof JSON.parse>;
const schemas = new Map<SageGame, SageIniSchema>();

export const readSageIniSchemaFile = (): typeof schemaFile =>
  (schemaFile ??= JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', 'assets', 'sageIniSchema.json'), 'utf8'),
  ));

export const loadSageIniSchema = (game: SageGame = 'rotwk'): SageIniSchema => {
  let schema = schemas.get(game);

  if (!schema) {
    schema = createSageIniSchema(readSageIniSchemaFile(), game);
    schemas.set(game, schema);
  }

  return schema;
};
