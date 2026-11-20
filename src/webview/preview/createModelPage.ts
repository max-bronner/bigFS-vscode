import type { W3dAnimation } from '../../formats/w3d/w3dAnimation';
import type { ForeignClip } from '../../formats/w3d/w3dModelFinder';
import type { SceneSkeleton } from '../../formats/w3d/w3dScene';
import type { RelatedModel } from '../../game/objects/findRelatedModels';
import { element } from '../shared/element';
import { createViewer } from '../shared/viewer/createViewer';
import type { ClipChoice } from '../shared/viewer/createClipPicker';
import { chooseRelatedStep } from './chooseRelatedStep';
import { createRelatedPicker } from './createRelatedPicker';
import { listFileClips } from './listFileClips';
import { readPageState, savePageState } from './pageState';
import type { FileUse, FromPreviewPage, ModelMessage } from './protocol';

const OWN = '#own';
const PARTS_HINT =
  "A .w3d alone knows only its own HIDDEN flags. The game hides more from the object's INI and scripts: use Preview object on its INI to see those.";

export interface ModelPage {
  show(message: ModelMessage): void;
  setAnimations(own: string[], foreign: ForeignClip[]): void;
  play(message: {
    file: string;
    animation: W3dAnimation;
    skeleton?: SceneSkeleton;
  }): void;
  showNotice(text: string): void;
  showModelError(text: string): void;
  setUses(uses: FileUse[]): void;
  setRelated(openedFile: string, files: RelatedModel[]): void;
}

export const createModelPage = (
  main: HTMLElement,
  post: (
    message: Extract<
      FromPreviewPage,
      { kind: 'animation' | 'reveal' | 'showModel' }
    >,
  ) => void,
): ModelPage => {
  const usedIn = element('p');
  let thisFile: ClipChoice[] = [];
  let message: ModelMessage | undefined;
  let openedFile = '';
  let pendingClip: { model?: string; file: string } | undefined;

  const requestModel = (file: string | undefined) => {
    viewer.showStatus(`Loading ${file ?? openedFile}…`);
    post({ kind: 'showModel', file });
  };
  const requestClip = (file: string) => {
    viewer.showStatus(`Loading ${file}…`);
    post({ kind: 'animation', file });
  };
  const pickRelated = (entry: RelatedModel | undefined) => {
    if (!entry) {
      pendingClip = undefined;
      requestModel(undefined);
      return;
    }

    const step = chooseRelatedStep(entry, {
      file:
        message?.relatedFile ?? message?.shownOn?.toLowerCase() ?? openedFile,
      openedFile,
      hierarchy: message?.hierarchy ?? message?.skeleton?.name,
    });

    pendingClip = undefined;
    if (step.kind === 'show') {
      requestModel(step.file);
    } else if (step.kind === 'play') {
      requestClip(step.file);
    } else {
      pendingClip = { model: step.model, file: step.file };
      requestModel(step.model);
    }
  };
  const related = createRelatedPicker(pickRelated);

  const pickClip = (id: string) => {
    if (id === OWN && message?.animation) {
      viewer.playClip({
        id,
        animation: message.animation,
        skeleton: message.animationSkeleton,
      });
    } else {
      post({ kind: 'animation', file: id });
    }
  };

  document.body.classList.add('model-page');

  const viewer = createViewer(main, {
    onPickClip: pickClip,
    partsHint: PARTS_HINT,
    sky: {
      initial: readPageState().sky,
      onChange: (sky) => savePageState({ sky }),
    },
  });

  viewer.side.append(usedIn);
  viewer.bar.prepend(related.select);

  return {
    show: (next) => {
      const isFirst = !message;

      message = next;
      viewer.setModel(next);
      related.show(next.relatedFile);
      thisFile =
        next.animation && next.skeleton
          ? [{ id: OWN, label: `${next.animation.name} (this file)` }]
          : [];
      if (!isFirst) {
        viewer.clearClip();
      }
      if (thisFile.length || !isFirst) {
        viewer.setClips({ own: thisFile });
      }
      if (pendingClip && pendingClip.model === next.relatedFile) {
        requestClip(pendingClip.file);
        pendingClip = undefined;
      } else if (thisFile.length) {
        pickClip(OWN);
      } else if (!isFirst) {
        viewer.showStatus('');
      }
    },
    setAnimations: (own, foreign) =>
      viewer.setClips(listFileClips(thisFile, own, foreign)),
    play: ({ file, animation, skeleton }) => {
      if (message?.skeleton) {
        viewer.playClip({ id: file, animation, skeleton });
      }
    },
    showNotice: viewer.showStatus,
    showModelError: (text) => {
      pendingClip = undefined;
      related.show(message?.relatedFile);
      viewer.showStatus(text);
    },
    setRelated: (opened, files) => {
      openedFile = opened;
      related.setList(opened, files);
      related.show(message?.relatedFile);
    },
    setUses: (uses) => {
      usedIn.replaceChildren(
        uses.length ? 'Used in: ' : 'No INI file the index holds uses this file',
        ...uses.flatMap((use, at) => {
          const link = element(
            'a',
            `${use.owner ?? use.uri.slice(use.uri.lastIndexOf('/') + 1)} (${use.field}, line ${use.line + 1})`,
          );

          link.href = '#';
          link.onclick = (event) => {
            event.preventDefault();
            post({ kind: 'reveal', uri: use.uri, line: use.line });
          };
          return at ? [' · ', link] : [link];
        }),
      );
    },
  };
};
