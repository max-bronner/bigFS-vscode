export interface FitSpace {
  width: number;
  height: number;
}

const HORIZONTAL_CHROME = 24;
const VERTICAL_CHROME = 230;

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;

interface StageElement {
  closest(selector: string): { clientWidth: number } | null;
}

export const getFitSpace = (
  stage: StageElement,
  viewportHeight: number,
): FitSpace => ({
  width: (stage.closest('main')?.clientWidth ?? 0) - HORIZONTAL_CHROME,
  height: viewportHeight - VERTICAL_CHROME,
});

export const fitZoom = (
  space: FitSpace,
  extentSize: { width: number; height: number },
  margin: number,
): number =>
  Math.min(
    MAX_ZOOM,
    Math.max(
      MIN_ZOOM,
      Math.min(
        space.width / (extentSize.width + 2 * margin),
        space.height / (extentSize.height + 2 * margin),
      ),
    ),
  );
