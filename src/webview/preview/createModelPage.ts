import type { W3dAnimation } from '../../formats/w3d/w3dAnimation';
import type { ForeignClip } from '../../formats/w3d/w3dModelFinder';
import type { SceneSkeleton } from '../../formats/w3d/w3dScene';
import type { RelatedModel } from '../../game/objects/findRelatedModels';
import type { TextureVariant } from '../../game/objects/objectAppearance';
import { element } from '../shared/element';
import { createViewer } from '../shared/viewer/createViewer';
import type { ClipChoice } from '../shared/viewer/createClipPicker';
import { chooseRelatedStep } from './chooseRelatedStep';
import { createRelatedPicker } from './createRelatedPicker';
import { createTexturePicker } from './createTexturePicker';
import { createDetailPicker } from '../shared/viewer/createDetailPicker';
import type { DetailLevel } from '../../game/objects/detailModels';
import { listFileClips } from './listFileClips';
import { listFileUses } from './listFileUses';
import { readPageState, savePageState } from './pageState';
import type { FileUse, FromPreviewPage, ModelMessage } from './protocol';

const OWN = '#own';
const PARTS_HINT =
  "A .w3d alone knows only its own HIDDEN flags. The game hides more from the object's INI and scripts: use ▶ Preview object under Used in to see those.";
const OBJECT_DEFINITION = /^(Object|ChildObject|ObjectReskin)\s/i;

type SectionKey = 'uses' | 'related' | 'textures';

const setSectionTitle = (section: HTMLDetailsElement, title: string) => {
  section.querySelector('summary')!.textContent = title;
};

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
  setUses(uses: readonly FileUse[]): void;
  setRelated(openedFile: string, files: RelatedModel[], textures: TextureVariant[]): void;
}

export const createModelPage = (
  main: HTMLElement,
  post: (
    message: Extract<
      FromPreviewPage,
      { kind: 'animation' | 'reveal' | 'previewObject' | 'showModel' }
    >,
  ) => void,
): ModelPage => {
  const usedIn = element('div', 'Looking for the INI lines that name this file…', 'uses');
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
  const texturePicker = createTexturePicker({
    onPick: (textures) => {
      viewer.showStatus('Loading textures…');
      post({ kind: 'showModel', file: message?.relatedFile, textures });
    },
    onListed: (count) => {
      texturesSection.hidden = !count;
      setSectionTitle(texturesSection, `Texture sets (${count + 1})`);
    },
  });
  let detailSwitch: { file?: string } | undefined;
  const detailPicker = createDetailPicker((level) => {
    const file = message?.detail?.files[level];

    if (file) {
      const shown = file === openedFile.toLowerCase() ? undefined : file;

      detailSwitch = { file: shown };
      requestModel(shown);
    }
  });
  const listTextures = () => {
    if (message) {
      texturePicker.showModel(
        (message.relatedFile ?? message.shownOn ?? openedFile).toLowerCase(),
        message.textureNames ?? [],
      );
    }
  };

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

  const addSection = (key: SectionKey, title: string, content: Node[]) => {
    const section = viewer.addSection(
      title,
      content,
      !readPageState().foldedSections?.includes(key),
    );

    section.ontoggle = () => {
      const folded = new Set(readPageState().foldedSections);

      if (section.open) {
        folded.delete(key);
      } else {
        folded.add(key);
      }
      savePageState({ foldedSections: [...folded] });
    };
    return section;
  };
  const usesSection = addSection('uses', 'Used in', [usedIn]);
  const relatedSection = addSection('related', 'Related files', [related.list]);
  const texturesSection = addSection('textures', 'Texture sets', [texturePicker.list]);

  relatedSection.hidden = true;
  texturesSection.hidden = true;
  viewer.side.prepend(usesSection, relatedSection, texturesSection);
  viewer.viewBar.prepend(detailPicker.select);

  return {
    show: (next) => {
      if (next.isRetextured) {
        if (next.relatedFile !== message?.relatedFile) {
          return;
        }
        viewer.setModel(next, true);
        viewer.showStatus(
          next.missing.length ? `Not found: ${next.missing.join(', ')}` : '',
        );
        return;
      }

      const isFirst = !message;
      const keepsClip = !!detailSwitch && detailSwitch.file === next.relatedFile;

      detailSwitch = undefined;
      message = next;
      detailPicker.show(
        Object.keys(next.detail?.files ?? {}) as DetailLevel[],
        next.detail?.level ?? 'high',
      );
      viewer.setModel(next, true);
      related.show(next.relatedFile);
      listTextures();
      thisFile =
        next.animation && next.skeleton
          ? [{ id: OWN, label: `${next.animation.name} (this file)` }]
          : [];
      if (keepsClip) {
        viewer.showStatus('');
        return;
      }
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
      detailSwitch = undefined;
      related.show(message?.relatedFile);
      viewer.showStatus(text);
    },
    setRelated: (opened, files, textures) => {
      openedFile = opened;
      texturePicker.setList(textures);
      listTextures();
      related.setList(opened, files);
      related.show(message?.relatedFile);
      relatedSection.hidden = !files.length;
      setSectionTitle(relatedSection, `Related files (${files.length})`);
    },
    setUses: (uses) => {
      setSectionTitle(usesSection, uses.length ? `Used in (${uses.length})` : 'Used in');
      usedIn.replaceChildren(
        ...listFileUses(
          uses,
          (use) => post({ kind: 'reveal', uri: use.uri, line: use.line }),
          (use) => {
            if (!use.owner || !OBJECT_DEFINITION.test(use.owner)) {
              return [];
            }

            const preview = element('button', '▶ Preview object');

            preview.title = 'Open the object preview on this line: the model as the game draws the object';
            preview.onclick = () => post({ kind: 'previewObject', uri: use.uri, line: use.line });
            return [' ', preview];
          },
        ),
      );
    },
  };
};
