const SAMPLE_LENGTH = 4096;

export const looksBinary = (bytes: Uint8Array): boolean =>
  bytes.subarray(0, SAMPLE_LENGTH).includes(0);
