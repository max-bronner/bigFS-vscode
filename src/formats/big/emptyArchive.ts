import { computeArchiveLayout, serializeIndexTable } from './bigFormat';

const BIG4_TRAILER_LENGTH = 8;

export const createEmptyArchive = (): Buffer =>
  serializeIndexTable(
    'BIG4',
    computeArchiveLayout([], new Uint8Array(BIG4_TRAILER_LENGTH)),
  );
