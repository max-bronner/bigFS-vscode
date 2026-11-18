export class TextSaveError extends Error {
  public constructor(
    message: string,
    public readonly line = 0,
  ) {
    super(message);
  }
}
