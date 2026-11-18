import * as vscode from 'vscode';
import { decodeBlock } from '../../formats/apt/aptBytecode';
import type { AptInstruction } from '../../formats/apt/aptBytecode';
import type { ToolBox } from '../../services/toolRegistry';
import { decodeTgaTool } from '../../formats/texture/textureTools';
import type { EntryLocator } from '../../services/entryLocator';
import {
  parseAptMovie,
  parseConst,
  parseSpriteFrames,
} from '../../formats/apt/aptMovie';
import type { AptMovie, ConstFile, Frame } from '../../formats/apt/aptMovie';
import { AptImage } from '../../formats/apt/writer/aptImage';
import { changeConstItem } from '../../formats/apt/writer/changeConstItem';
import type { ConstItemChange } from '../../formats/apt/writer/aptEdit';
import { appendConstItems } from '../../formats/apt/aptScript';
import { findBeside } from './aptAccess';
import {
  getTexturePath,
  parseDat,
  parseRu,
} from '../../formats/apt/aptGeometry';
import { addTexture, setShapeGeometry } from '../../formats/apt/aptAssets';
import type { DatLocation, RuRun } from '../../formats/apt/aptGeometry';
import { behaviourOf } from '../../formats/apt/aptBehaviour';
import type { Behaviour } from '../../formats/apt/aptBehaviour';
import type { PageMovie, TexturePixels } from '../../webview/apt/protocol';
import { movieKey } from './aptLibrary';
import { decodeWindows1252 } from '../../core/windows1252';
import { describeError } from '../../core/errors';
import { packSnapshot, unpackSnapshot } from './aptSnapshot';
import type { AptSnapshot } from './aptSnapshot';

export interface BuiltMovie {
  movie: PageMovie;
  textures: Record<string, TexturePixels>;
  summary: string;
}

const actionBlocks = (
  movie: AptMovie,
  spriteFrames: Record<number, Frame[]>,
): number[] => {
  const blocks = new Set<number>();

  for (const frames of [movie.frames, ...Object.values(spriteFrames)]) {
    for (const frame of frames) {
      for (const item of frame.items) {
        if (item.type === 'action' || item.type === 'initAction') {
          blocks.add(item.block);
        } else if (item.type === 'placeObject') {
          item.clipActions?.forEach((clip) => blocks.add(clip.block));
        }
      }
    }
  }
  for (const character of movie.characters) {
    if (character.type === 'button') {
      character.actions.forEach((action) => blocks.add(action.block));
    }
  }
  return [...blocks];
};

const removedOr = (bytes: Uint8Array): Uint8Array | undefined =>
  bytes.length ? bytes : undefined;

const tryRead = async (uri: vscode.Uri): Promise<Uint8Array | undefined> => {
  try {
    return await vscode.workspace.fs.readFile(uri);
  } catch {
    return undefined;
  }
};

const readOwn = async (
  aptUri: vscode.Uri,
  relative: string,
): Promise<Uint8Array | undefined> => {
  const exact = await tryRead(
    vscode.Uri.joinPath(vscode.Uri.joinPath(aptUri, '..'), relative),
  );

  if (exact) {
    return exact;
  }

  const found = await findBeside(aptUri, relative, vscode.FileType.File);

  return found ? tryRead(found) : undefined;
};

const latin1 = decodeWindows1252;

export class AptDocument implements vscode.CustomDocument {
  public image: AptImage;

  public version = 0;

  public files = new Map<string, Uint8Array>();

  private constBytes: Uint8Array;
  private readonly savedConst: Uint8Array;
  private parsedConst: ConstFile;

  private readonly read: (relative: string) => Promise<Uint8Array | undefined>;
  private readonly cache = new Map<string, Promise<Uint8Array | undefined>>();
  private readonly textures = new Map<
    string,
    TexturePixels | undefined
  >();

  private constructor(
    public readonly uri: vscode.Uri,
    apt: Uint8Array,
    constBytes: Uint8Array,
    public readonly name: string,
    locator: EntryLocator,
    private readonly tools: ToolBox,
  ) {
    this.image = new AptImage(apt);
    this.constBytes = constBytes;
    this.savedConst = constBytes;
    this.parsedConst = parseConst(constBytes);
    this.read = (relative) =>
      this.files.has(relative)
        ? Promise.resolve(removedOr(this.files.get(relative)!))
        : this.cached(
            relative,
            async () =>
              (await readOwn(uri, relative)) ??
              (await locator.read(
                relative.slice(relative.lastIndexOf('/') + 1),
                uri,
              )),
          );
  }

  public static async open(
    uri: vscode.Uri,
    locator: EntryLocator,
    tools: ToolBox,
  ): Promise<AptDocument> {
    const name = uri.path
      .slice(uri.path.lastIndexOf('/') + 1)
      .replace(/\.apt$/i, '');
    const apt = await vscode.workspace.fs.readFile(uri);
    const constBytes =
      (await readOwn(uri, `${name}.const`)) ??
      (await locator.read(`${name}.const`, uri));

    if (!constBytes) {
      throw new Error(`${name}.const is not beside the movie`);
    }

    return new AptDocument(uri, apt, constBytes, name, locator, tools);
  }

  public get constFile(): ConstFile {
    return this.parsedConst;
  }

  public get editedFiles(): Map<string, Uint8Array> {
    return new Map([...this.files, [`${this.name}.const`, this.constBytes]]);
  }

  public changeConstItem(change: ConstItemChange): void {
    this.constBytes = changeConstItem(this.constBytes, change);
    this.parsedConst = parseConst(this.constBytes);
  }

  public addConstItems(items: ConstFile['items']): void {
    if (items.length) {
      this.constBytes = appendConstItems(this.constBytes, items);
      this.parsedConst = parseConst(this.constBytes);
    }
  }

  public backup(): Uint8Array {
    return packSnapshot(this.snapshot());
  }

  public restoreBackup(bytes: Uint8Array): void {
    this.restore(unpackSnapshot(bytes));
  }

  public dispose(): void {
    this.cache.clear();
  }

  private cached(
    key: string,
    load: () => Promise<Uint8Array | undefined>,
  ): Promise<Uint8Array | undefined> {
    let entry = this.cache.get(key);

    if (!entry) {
      entry = load();
      this.cache.set(key, entry);
    }

    return entry;
  }

  public readBeside(relative: string): Promise<Uint8Array | undefined> {
    return this.read(relative);
  }

  public snapshot(): AptSnapshot {
    return {
      apt: this.image.bytes,
      constBytes: this.constBytes,
      files: new Map(this.files),
    };
  }

  public restore(snapshot: AptSnapshot): void {
    this.version++;
    this.image = new AptImage(snapshot.apt);
    this.constBytes = snapshot.constBytes;
    this.parsedConst = parseConst(snapshot.constBytes);
    this.files = new Map(snapshot.files);
  }

  private async texture(path: string, problems: string[]) {
    if (!this.textures.has(path)) {
      const bytes = await this.read(path);
      let texture: TexturePixels | undefined;

      if (bytes) {
        try {
          texture = (await this.tools.use(decodeTgaTool)(bytes)).levels[0];
        } catch (error) {
          problems.push(
            `${path}: ${describeError(error)}`,
          );
        }
      }

      this.textures.set(path, texture);
    }

    const texture = this.textures.get(path);

    if (!texture) {
      problems.push(`texture ${path}`);
    }

    return texture;
  }

  public async build(): Promise<BuiltMovie> {
    const apt = this.image.bytes;
    const movie = parseAptMovie(apt, this.constFile.movieOffset);
    const datBytes = await this.read(`${this.name}.dat`);
    const dat = datBytes ? parseDat(latin1(datBytes)) : new Map();
    const spriteFrames: Record<number, Frame[]> = {};

    const shapes: Record<number, RuRun[]> = {};
    const imageTextures: Record<number, string> = {};
    const imageLocations: Record<number, DatLocation> = {};
    const problems: string[] = [];

    await Promise.all(
      movie.characters.map(async (character) => {
        try {
          if (character.type === 'sprite') {
            spriteFrames[character.id] = parseSpriteFrames(apt, character);
          } else if (character.type === 'shape') {
            const ru = await this.read(
              `${this.name}_geometry/${character.geometry}.ru`,
            );

            shapes[character.id] = ru ? parseRu(latin1(ru)) : [];

            if (!ru) {
              problems.push(`geometry of shape #${character.id}`);
            }
          } else if (character.type === 'image') {
            const location = dat.get(character.texture);

            if (location) {
              imageLocations[character.id] = location;
              imageTextures[character.id] = getTexturePath(
                this.name,
                character.texture,
                location,
              );
            }
          }
        } catch (error) {
          problems.push(
            `#${character.id}: ${describeError(error)}`,
          );
        }
      }),
    );

    const textures: Record<string, TexturePixels> = {};
    const textureKey = (path: string) => `${movieKey(this.name)}/${path}`;

    for (const path of new Set(Object.values(imageTextures))) {
      const texture = await this.texture(path, problems);

      if (texture) {
        textures[textureKey(path)] = texture;
      }
    }
    for (const id of Object.keys(imageTextures)) {
      imageTextures[Number(id)] = textureKey(imageTextures[Number(id)]);
    }

    const counts = new Map<string, number>();

    movie.characters.forEach((character) =>
      counts.set(character.type, (counts.get(character.type) ?? 0) + 1),
    );

    const summary = [
      `${movie.record.screenWidth}×${movie.record.screenHeight}`,
      `${movie.characters.length} characters (${[...counts].map(([type, count]) => `${count} ${type}`).join(', ')})`,
      `${movie.imports.length} imports, ${movie.exports.length} exports`,
      problems.length
        ? `not found: ${problems.slice(0, 6).join('; ')}${problems.length > 6 ? '…' : ''}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      summary,
      movie: {
        ...movie,
        name: this.name,
        spriteFrames,
        behaviours: this.behaviours(movie, spriteFrames),
        code: this.code(movie, spriteFrames),
        consts: this.constFile.items.map((item) => item.value),
        shapes,
        imageTextures,
        imageLocations,
      },
      textures,
    };
  }

  private code(
    movie: AptMovie,
    spriteFrames: Record<number, Frame[]>,
  ): Record<number, AptInstruction[]> {
    const code: Record<number, AptInstruction[]> = {};

    for (const block of actionBlocks(movie, spriteFrames)) {
      try {
        code[block] = decodeBlock(this.image.bytes, block);
      } catch {
      }
    }
    return code;
  }

  private behaviours(
    movie: AptMovie,
    spriteFrames: Record<number, Frame[]>,
  ): Record<number, Behaviour> {
    const behaviours: Record<number, Behaviour> = {};

    for (const block of actionBlocks(movie, spriteFrames)) {
      try {
        behaviours[block] = behaviourOf(
          this.image.bytes,
          block,
          this.constFile.items,
        );
      } catch {
        behaviours[block] = { commands: [], skipped: 1, conditional: false };
      }
    }
    return behaviours;
  }

  public setGeometry(shape: number, runs: RuRun[]): void {
    for (const [path, bytes] of setShapeGeometry(
      this.image,
      this.constFile.movieOffset,
      this.name,
      shape,
      runs,
    )) {
      this.files.set(path, bytes);
    }
  }

  public async addTexture(
    width: number,
    height: number,
    pixels: Uint8Array,
  ): Promise<number> {
    const dat = await this.read(`${this.name}.dat`);
    const { id, files } = addTexture(
      this.image,
      this.constFile.movieOffset,
      this.name,
      dat ? latin1(dat) : '',
      { width, height, pixels },
    );

    files.forEach((bytes, path) => this.files.set(path, bytes));
    return id;
  }

  public async save(target: vscode.Uri = this.uri): Promise<void> {
    const folder = vscode.Uri.joinPath(target, '..');

    await vscode.workspace.fs.writeFile(target, this.image.bytes);

    if (
      target.toString() !== this.uri.toString() ||
      this.constBytes !== this.savedConst
    ) {
      const stem = target.path
        .slice(target.path.lastIndexOf('/') + 1)
        .replace(/\.apt$/i, '');

      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(folder, `${stem}.const`),
        this.constBytes,
      );
    }

    for (const [relative, bytes] of this.files) {
      if (!bytes.length) {
        await Promise.resolve(
          vscode.workspace.fs.delete(vscode.Uri.joinPath(folder, relative)),
        ).catch(() => undefined);
        continue;
      }
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(folder, relative),
        bytes,
      );
    }
  }
}