import * as vscode from 'vscode';
import type { RegionsMessage } from '../../webview/preview/protocol';
import type { FindRegions } from './createRegionDiscovery';
import type { RegionKind } from './regionKind';

interface RegionView {
  decoded: readonly [number, number];
  post(message: RegionsMessage): void;
}

export interface TextureRegions extends vscode.Disposable {
  attach(
    texture: vscode.Uri,
    decoded: readonly [number, number],
    post: (message: RegionsMessage) => void,
  ): vscode.Disposable;
  edit(
    texture: vscode.Uri,
    id: string,
    rect: readonly [number, number, number, number],
  ): Promise<void>;
  focus(texture: vscode.Uri, id: string): void;
}

interface TextureState {
  views: Set<RegionView>;
  ids: Set<string>;
  documentUris?: Set<string>;
  selected?: string;
  search?: vscode.CancellationTokenSource;
  searched: boolean;
}

export const createTextureRegions = (
  kinds: readonly RegionKind[],
  findRegions: FindRegions,
): TextureRegions => {
  const textures = new Map<string, TextureState>();

  const stateOf = (texture: vscode.Uri): TextureState => {
    const key = texture.toString();
    let state = textures.get(key);

    if (!state) {
      state = { views: new Set(), ids: new Set(), searched: false };
      textures.set(key, state);
    }
    return state;
  };

  const readRegions = async (
    ids: readonly string[],
    decoded: readonly [number, number],
  ) =>
    (
      await Promise.all(
        kinds.map((kind) =>
          kind
            .read(
              ids.filter((id) => kind.owns(id)),
              decoded,
            )
            .catch(() => []),
        ),
      )
    ).flat();

  const send = async (
    state: TextureState,
    view: RegionView,
    ids: readonly string[],
    append: boolean,
  ) =>
    view.post({
      kind: 'regions',
      regions: await readRegions(ids, view.decoded),
      append,
      selected: state.selected,
      loading: state.search !== undefined,
    });

  const sendAll = (state: TextureState) =>
    Promise.all([...state.views].map((view) => send(state, view, [...state.ids], false)));

  const search = (texture: vscode.Uri, state: TextureState) => {
    const source = new vscode.CancellationTokenSource();

    state.search = source;
    findRegions(
      texture,
      (ids) => {
        const added = ids.filter((id) => !state.ids.has(id));

        added.forEach((id) => state.ids.add(id));
        state.documentUris = undefined;
        if (added.length && !source.token.isCancellationRequested) {
          void Promise.all(
            [...state.views].map((view) => send(state, view, added, true)),
          );
        }
      },
      source.token,
    )
      .catch(() => undefined)
      .finally(() => {
        state.searched = !source.token.isCancellationRequested;
        state.search = undefined;
        source.dispose();
        void sendAll(state);
        if (!state.searched && state.views.size) {
          search(texture, state);
        }
      });
  };

  const subscription = vscode.workspace.onDidChangeTextDocument((event) => {
    const changed = event.document.uri.toString();

    for (const state of textures.values()) {
      if (!state.views.size) {
        continue;
      }
      state.documentUris ??= new Set(
        [...state.ids].flatMap((id) => {
          const document = kinds.find((kind) => kind.owns(id))?.documentOf(id);

          return document ? [document.toString()] : [];
        }),
      );
      if (state.documentUris.has(changed)) {
        void sendAll(state);
      }
    }
  });

  return {
    dispose: () => {
      subscription.dispose();
      textures.forEach((state) => state.search?.cancel());
    },
    attach(texture, decoded, post) {
      const state = stateOf(texture);
      const view: RegionView = { decoded, post };

      state.views.add(view);
      if (!state.search && !state.searched) {
        search(texture, state);
      }
      void send(state, view, [...state.ids], false);
      return new vscode.Disposable(() => {
        state.views.delete(view);
        if (!state.views.size) {
          state.search?.cancel();
        }
      });
    },
    async edit(texture, id, rect) {
      const state = stateOf(texture);
      const kind = kinds.find((each) => each.owns(id));
      const view = [...state.views][0];

      if (!kind || !view || !state.ids.has(id)) {
        return;
      }
      state.selected = id;

      if (!(await kind.write(id, view.decoded, rect))) {
        await sendAll(state);
      }
    },
    focus(texture, id) {
      const state = stateOf(texture);

      state.ids.add(id);
      state.documentUris = undefined;
      state.selected = id;
      void sendAll(state);
    },
  };
};
