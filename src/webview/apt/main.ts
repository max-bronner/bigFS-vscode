import { pageSoundPlayer } from '../shared/pageSoundPlayer';
import { showNotice } from '../shared/noticeBar';
import { onEngineRestart, showEngine } from './enginePanel';
import { keepAnswers } from './engineState';
import { setGameText } from './gameText';
import { movieArrived, storeTextures } from './movieLoads';
import { byId, escapeHtml } from './dom';
import { markSelected, onCharacterSelect, showList } from './characterList';
import { attachMenu } from './popupMenu';
import type { MenuEntry } from './popupMenu';
import { getSideTab, showSideTab } from './sideTabs';
import { showScript } from './blocks/scriptBlock';
import { GO_TO_FRAME, showDetails } from './details';
import { send } from './send';
import { getVsCodeApi } from '../shared/vscodeApi';
import { scriptSaved } from './blocks/scriptBlock';
import { installBlockStyles } from './blocks/blockStyles';
import type { FromPage, ToPage } from './protocol';
import { showAtlas } from './atlas';
import './gadgets';
import { mappedImagesArrived } from './mappedSurfaces';
import { renderObjectArrived } from './view3dSurface';
import { suggestionsArrived } from './suggestingInput';
import { showIntegrity } from './integrity';
import { nudge } from './edit';
import './geometry';
import { findFreeDepth, showInspector, updateInspector } from './inspector';
import { markPlayhead, setOnion, showTimeline } from './timelinePanel';
import {
  currentPlayer,
  goToFrame,
  play,
  playFrom,
  pointAt,
  remeasure,
  render,
  restart,
  setInspectorView,
  view,
} from './stage';
import { SPEEDS } from './protocol';
import type { AptToolbar } from './protocol';
import { TOOLBAR_SECTION, TOOLBAR_SETTINGS } from './toolbarSettings';
import { createPreviewSettings, readKeptSettings } from '../shared/createPreviewSettings';
import { state } from './state';

const vscode = getVsCodeApi<FromPage>();
const toolbarSettings = createPreviewSettings(readKeptSettings(), (settings) =>
  vscode.postMessage({ kind: 'keepSettings', settings }),
).section(TOOLBAR_SECTION, TOOLBAR_SETTINGS);

const showPanels = () => {
  showInspector();
  showAtlas();
  showTimeline();
};

const frameInput = byId<HTMLInputElement>('frame');
const zoomSelect = byId<HTMLSelectElement>('zoom');
const playFromSelect = byId<HTMLSelectElement>('play-from');

playFromSelect.onchange = () => {
  if (playFromSelect.value !== '') {
    playFrom(Number(playFromSelect.value));
    showPanels();
  }
  playFromSelect.value = '';
};

onEngineRestart(() => {
  restart();
  goToFrame(0);
  showPanels();
  showDetails();
  render();
});

const select = (id: number) => {
  state.selected = id;
  state.frame = 0;
  restart();
  showPlayFrom();
  showPanels();
  markSelected();
  showDetails();
  render();
};

const showPlayFrom = () => {
  const root = currentPlayer().root;

  playFromSelect.replaceChildren(
    new Option('Play from…', ''),
    new Option('frame 0', '0'),
    ...currentPlayer()
      .labels(root)
      .map(
        ({ label, frame }) =>
          new Option(`${label} (frame ${frame})`, String(frame)),
      ),
  );
};

onCharacterSelect(select);

const goTo = (frame: number) => {
  goToFrame(frame);
  showDetails();
  render();
};

const step = (by: number) => {
  play(false);
  goTo(state.frame + by);
};

type Switch = 'origin' | 'boxes' | 'masks' | 'scripts' | 'interact' | 'wireframe';

const SWITCHES: Switch[] = ['origin', 'boxes', 'masks', 'scripts', 'interact', 'wireframe'];

const inspectButton = byId('mode-inspect');
const interactButton = byId('mode-interact');
const scriptsButton = byId('scripts');
const overlaysButton = byId<HTMLButtonElement>('overlays');

const showSwitches = () => {
  const overlays = [view.origin, view.boxes, !view.masks, view.wireframe, view.onion > 0].filter(Boolean).length;

  inspectButton.setAttribute('aria-pressed', String(!view.interact));
  interactButton.setAttribute('aria-pressed', String(view.interact));
  scriptsButton.setAttribute('aria-pressed', String(!view.scripts));
  overlaysButton.textContent = overlays ? `Overlays (${overlays})` : 'Overlays';
};

const keepToolbar = () => {
  const toolbar: AptToolbar = {
    zoom: zoomSelect.value,
    speed: view.speed,
    origin: view.origin,
    boxes: view.boxes,
    masks: view.masks,
    scripts: view.scripts,
    interact: view.interact,
    wireframe: view.wireframe,
  };

  for (const key of Object.keys(toolbar) as (keyof AptToolbar)[]) {
    toolbarSettings.set(key, toolbar[key]);
  }
};

const toggle = (key: Switch) => {
  view[key] = !view[key];
  showSwitches();
  keepToolbar();
  if (key === 'masks') {
    remeasure();
  }
  if (key === 'scripts' || key === 'interact') {
    const inspected = state.inspected;

    restart();
    state.inspected = inspected;
    goToFrame(state.frame);
    if (key === 'interact' && view.interact && !view.playing) {
      play(true);
    }
    showPanels();
  }
  render();
};

const stage = byId<HTMLCanvasElement>('stage');

stage.addEventListener('dragover', (event) => {
  if (event.dataTransfer?.types.includes('application/x-apt-character')) {
    event.preventDefault();
  }
});
stage.addEventListener('drop', (event) => {
  const id = Number(event.dataTransfer?.getData('application/x-apt-character'));
  const root = currentPlayer().root;

  event.preventDefault();
  if (
    !Number.isInteger(id) ||
    root.movie !== state.movie ||
    !['sprite', 'movie'].includes(root.character?.type ?? '')
  ) {
    return;
  }

  const depth = findFreeDepth(root);

  state.inspected = `/${depth}`;
  send({
    kind: 'placeObject',
    timeline: root.id,
    frame: root.frame,
    depth,
    character: id,
    translate: pointAt(event),
  });
});

zoomSelect.onchange = () => {
  keepToolbar();
  render();
};
frameInput.oninput = () => goTo(Number(frameInput.value));
byId('play').onclick = () => play(!view.playing);
byId('back').onclick = () => step(-1);
byId('forward').onclick = () => step(1);
const speedSelect = byId<HTMLSelectElement>('speed');
const setSpeed = (speed: number) => {
  view.speed = speed;
  speedSelect.value = String(speed);
};

speedSelect.onchange = () => {
  setSpeed(Number(speedSelect.value));
  keepToolbar();
};
const stepSpeed = (by: number) => {
  const at = SPEEDS.indexOf(view.speed);

  setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, at + by))]);
  keepToolbar();
};
inspectButton.onclick = () => view.interact && toggle('interact');
interactButton.onclick = () => !view.interact && toggle('interact');
scriptsButton.onclick = () => toggle('scripts');

const changeOnion = (frames: number) => {
  setOnion(frames);
  showSwitches();
};

const overlayEntries = (): MenuEntry[] => [
  { label: 'Origin', key: 'O', checked: view.origin, title: "The shown character's 0, 0", run: () => toggle('origin') },
  { label: 'Boxes', key: 'B', checked: view.boxes, title: 'The bounds of what is drawn', run: () => toggle('boxes') },
  {
    label: 'Show Masks',
    key: 'M',
    checked: !view.masks,
    title: 'Draw everything, what a clip mask hides faintly, with the masks outlined; off draws the masks applied, as the game does',
    run: () => toggle('masks'),
  },
  {
    label: 'Wireframe',
    key: 'W',
    checked: view.wireframe,
    title: "Draw the triangles of what is picked; a shape's vertices can then be dragged",
    run: () => toggle('wireframe'),
  },
  'separator',
  { heading: 'Onion skin (N steps through)' },
  ...[0, 1, 2, 3].map((frames) => ({
    label: frames ? `±${frames} Frame${frames > 1 ? 's' : ''}` : 'Off',
    title: 'Frames either side of the shown one, drawn faintly while paused',
    checked: view.onion === frames,
    run: () => changeOnion(frames),
  })),
];

attachMenu(overlaysButton, overlayEntries);

const applyToolbar = () => {
  const toolbar = toolbarSettings.values;

  zoomSelect.value = toolbar.zoom;
  setSpeed(toolbar.speed);
  for (const key of SWITCHES) {
    view[key] = toolbar[key];
  }
  showSwitches();
};
setInspectorView(() => {
  if (state.inspected !== undefined && getSideTab() === 'details') {
    showSideTab('inspector');
  }
  showPanels();
}, () => {
  updateInspector();
  markPlayhead();
});
window.addEventListener('resize', () => state.movie && render());
window.addEventListener(GO_TO_FRAME, (event) => {
  play(false);
  goTo((event as CustomEvent<number>).detail);
  showTimeline();
});

document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;

  if (
    !state.movie ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.closest('#details, .bk-popup, .menu')
  ) {
    return;
  }

  const actions: Record<string, () => void> = {
    ' ': () => play(!view.playing),
    ArrowLeft: () => nudge(event.shiftKey ? -10 : -1, 0) || step(-1),
    ArrowRight: () => nudge(event.shiftKey ? 10 : 1, 0) || step(1),
    ArrowUp: () => void nudge(0, event.shiftKey ? -10 : -1),
    ArrowDown: () => void nudge(0, event.shiftKey ? 10 : 1),
    ',': () => step(-1),
    '.': () => step(1),
    o: () => toggle('origin'),
    b: () => toggle('boxes'),
    m: () => toggle('masks'),
    s: () => toggle('scripts'),
    i: () => toggle('interact'),
    w: () => toggle('wireframe'),
    '[': () => stepSpeed(-1),
    ']': () => stepSpeed(1),
    n: () => changeOnion((view.onion + 1) % 4),
  };
  const action = actions[event.key];

  if (action) {
    event.preventDefault();
    action();
  }
});

window.addEventListener('message', ({ data }: MessageEvent<ToPage>) => {
  switch (data.kind) {
    case 'movie': {
      const isFirst = !state.movie;

      state.movie = data.movie;
      setGameText(data.texts);
      if (data.answers) {
        keepAnswers(data.answers);
      }
      for (const [key, imported] of Object.entries(data.library)) {
        state.library.set(key, imported);
      }
      storeTextures(data.textures);
      byId('summary').textContent = data.summary;
      if (isFirst) {
        applyToolbar();
      }
      if (isFirst || !data.movie.characters[state.selected]) {
        state.selected = 0;
        state.frame = 0;
      }

      const inspected = state.inspected;

      restart();
      state.inspected = inspected;
      goToFrame(state.frame);
      showPlayFrom();
      showPanels();
      showList();
      showDetails();
      render();
      if (isFirst) {
        play(true);
      }
      break;
    }
    case 'movieLoaded':
      movieArrived(data);
      render();
      break;
    case 'renderObject':
      renderObjectArrived(data);
      break;
    case 'suggestions':
      suggestionsArrived(data);
      break;
    case 'mappedImages':
      mappedImagesArrived(data);
      break;
    case 'select':
      showList();
      select(data.character);
      break;
    case 'progress': {
      const progress = byId('progress');

      progress.textContent = data.text;
      progress.hidden = !data.text;
      break;
    }
    case 'integrity':
      showIntegrity(data.problems, (character) => {
        showList();
        select(character);
      });
      break;
    case 'script':
      showScript(data);
      break;
    case 'scriptSaved': {
      scriptSaved(data.previous, data.block);
      break;
    }
    case 'sound':
      void pageSoundPlayer.receive(data);
      break;
    case 'notice':
      showNotice(data.message);
      break;
    case 'error':
      document.body.innerHTML =
        '<p class="error">Cannot open this movie: ' +
        escapeHtml(data.message) +
        '</p>';
      break;
  }
});

installBlockStyles();
showSwitches();
showEngine();
vscode.postMessage({ kind: 'ready' });
