export class AptSelections {
  private readonly waiting = new Map<string, number>();
  private readonly drawn = new Map<string, (character: number) => Promise<void>>();

  public async request(movie: string, character: number): Promise<void> {
    const select = this.drawn.get(movie);

    if (select) {
      await select(character);
    } else {
      this.waiting.set(movie, character);
    }
  }

  public async markDrawn(
    movie: string,
    select: (character: number) => Promise<void>,
  ): Promise<void> {
    this.drawn.set(movie, select);

    const character = this.waiting.get(movie);

    if (character !== undefined) {
      this.waiting.delete(movie);
      await select(character);
    }
  }

  public forget(movie: string): void {
    this.drawn.delete(movie);
    this.waiting.delete(movie);
  }
}
