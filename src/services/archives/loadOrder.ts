import type { Uri } from 'vscode';
import { SCHEME } from '../../constants';
import { compareLoadPositions } from '../../game/install/gameView';
import type { LoadPosition } from '../../game/install/gameView';
import {
  buildStacks,
  isInsideSource,
  orderLayers,
} from '../../game/install/installLayers';
import type { Archive } from './archive';
import type { ArchiveSource } from './archiveSource';
import { parseNodeUri } from './nodeAddress';

export interface LoadOrderHost {
  getSources(): readonly ArchiveSource[];
  getArchivesOf(sourceId: string): readonly Archive[];
}

interface FileOrigin {
  source: ArchiveSource;
  archive?: string;
}

interface BuiltStacks {
  sources: readonly ArchiveSource[];
  bySource: Map<string, ArchiveSource[]>;
  fallback: ArchiveSource[];
}

export class LoadOrder {
  private built?: BuiltStacks;
  private readonly origins = new Map<string, FileOrigin | null>();

  public constructor(private readonly host: LoadOrderHost) {}

  private getBuilt(): BuiltStacks {
    const sources = this.host.getSources();

    if (this.built?.sources !== sources) {
      const stacks = buildStacks(sources);
      const [highest] = orderLayers(sources);

      this.origins.clear();
      this.built = {
        sources,
        bySource: new Map(
          [...stacks].map(([source, stack]) => [source.id, stack]),
        ),
        fallback: highest ? (stacks.get(highest) ?? []) : [],
      };
    }
    return this.built;
  }

  public getStack(uri?: Uri): readonly ArchiveSource[] {
    const built = this.getBuilt();
    const source = uri && this.findOrigin(uri)?.source;

    return (source && built.bySource.get(source.id)) ?? built.fallback;
  }

  public getStackKey(uri?: Uri): string {
    return this.getStack(uri)[0]?.id ?? '';
  }

  public findSource(uri: Uri): ArchiveSource | undefined {
    return this.findOrigin(uri)?.source;
  }

  private findOrigin(uri: Uri): FileOrigin | undefined {
    const { sources } = this.getBuilt();
    const key = `${uri.scheme}:${uri.path.toLowerCase()}`;
    const held = this.origins.get(key);

    if (held !== undefined) {
      return held ?? undefined;
    }

    let origin: FileOrigin | undefined;

    if (uri.scheme === SCHEME) {
      const id = uri.path.split('/')[1]?.toLowerCase();
      const source = sources.find((each) => each.id.toLowerCase() === id);
      const archive =
        source && parseNodeUri(uri, this.host.getArchivesOf(source.id))?.archive;

      origin = source && { source, archive: archive?.pathInSource ?? '' };
    } else if (uri.scheme === 'file') {
      const source = sources
        .filter((each) => isInsideSource(uri.fsPath, each.baseUri.fsPath))
        .sort((a, b) => b.baseUri.fsPath.length - a.baseUri.fsPath.length)[0];

      origin = source && { source };
    }

    this.origins.set(key, origin ?? null);

    return origin;
  }

  public findPosition(
    uri: Uri,
    stack: readonly ArchiveSource[],
  ): LoadPosition | undefined {
    const origin = this.findOrigin(uri);

    if (!origin) {
      return stack === this.getBuilt().fallback ? { layer: -1 } : undefined;
    }

    const layer = stack.indexOf(origin.source);

    return layer < 0 ? undefined : { layer, archive: origin.archive };
  }

  public orderPlaces<T extends { uri: Uri }>(
    places: readonly T[],
    from?: Uri,
  ): T[] {
    if (from) {
      const stack = this.getStack(from);

      if (places.length === 1) {
        return this.findPosition(places[0].uri, stack) ? [places[0]] : [];
      }
      return places
        .map((place) => ({ place, position: this.findPosition(place.uri, stack) }))
        .filter((each): each is { place: T; position: LoadPosition } => !!each.position)
        .sort((a, b) => compareLoadPositions(a.position, b.position))
        .map(({ place }) => place);
    }

    if (places.length < 2) {
      return [...places];
    }

    const { fallback, sources } = this.getBuilt();
    const positionOf = (uri: Uri): LoadPosition => {
      const inFallback = this.findPosition(uri, fallback);

      if (inFallback) {
        return inFallback;
      }

      const origin = this.findOrigin(uri);

      return {
        layer: fallback.length + (origin ? sources.indexOf(origin.source) : sources.length),
        archive: origin?.archive,
      };
    };

    return places
      .map((place) => ({ place, position: positionOf(place.uri) }))
      .sort((a, b) => compareLoadPositions(a.position, b.position))
      .map(({ place }) => place);
  }
}
