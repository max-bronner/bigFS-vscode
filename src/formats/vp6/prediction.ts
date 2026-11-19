import type { Mv } from './dsp';

export const enum Ref {
  Intra = 0,
  Previous = 1,
  Golden = 2,
}

export const enum MbType {
  Intra,
  InterNoMv,
  InterMv,
  InterNearest,
  InterNear,
  InterFourMv,
  GoldenNoMv,
  GoldenMv,
  GoldenNearest,
  GoldenNear,
}

export const getReference = (type: MbType): Ref =>
  type === MbType.Intra
    ? Ref.Intra
    : type <= MbType.InterFourMv
      ? Ref.Previous
      : Ref.Golden;

export const ZERO_MV: Mv = { x: 0, y: 0 };
export const isSameMv = (a: Mv, b: Mv) => a.x === b.x && a.y === b.y;
const i16 = (value: number) => (value << 16) >> 16;

const CANDIDATE_OFFSETS = [
  [-1, 0],
  [0, -1],
  [-1, -1],
  [-1, 1],
  [-2, 0],
  [0, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
  [-2, -2],
  [-2, 2],
];

export interface MvCandidates {
  count: number;
  nearest: Mv;
  near: Mv;
  pred: Mv;
}

export const findMvCandidates = (
  neighbour: (index: number) => { type: MbType; mv: Mv } | undefined,
  mbX: number,
  mbY: number,
  mbWidth: number,
  mbHeight: number,
  want: Ref,
): MvCandidates => {
  let nearest = ZERO_MV;
  let near = ZERO_MV;
  let pred = ZERO_MV;
  let count = 0;

  for (let index = 0; index < CANDIDATE_OFFSETS.length; index++) {
    const [yOffset, xOffset] = CANDIDATE_OFFSETS[index];
    const cx = mbX + xOffset;
    const cy = mbY + yOffset;

    if (cx < 0 || cy < 0 || cx >= mbWidth || cy >= mbHeight) {
      continue;
    }

    const info = neighbour(cy * mbWidth + cx);

    if (!info || getReference(info.type) !== want || isSameMv(info.mv, ZERO_MV)) {
      continue;
    }
    if (count === 0) {
      nearest = info.mv;
      count = 1;
      if (index < 2) {
        pred = info.mv;
      }
    } else if (!isSameMv(info.mv, nearest)) {
      near = info.mv;
      count = 2;
      break;
    }
  }
  return { count, nearest, near, pred };
};

export class DcPredictor {
  private dc: Int16Array[] = [];
  private refsY: (Ref | undefined)[] = [];
  private refsC: (Ref | undefined)[] = [];
  private leftY = [0, 0];
  private leftU = 0;
  private leftV = 0;
  private leftRef: Ref | undefined;
  private lumaIndex = 1;
  private chromaIndex = 1;
  private lastDc: number[][] = [];

  public constructor(mbWidth = 0) {
    this.resize(mbWidth);
  }

  public resize(mbWidth: number): void {
    this.dc = [
      new Int16Array(mbWidth * 2 + 2),
      new Int16Array(mbWidth + 2),
      new Int16Array(mbWidth + 2),
    ];
    this.refsY = new Array(mbWidth * 2 + 2).fill(undefined);
    this.refsC = new Array(mbWidth + 2).fill(undefined);
    this.reset();
  }

  public reset(): void {
    this.startRow();
    this.refsY.fill(undefined);
    this.refsC.fill(undefined);
    this.lastDc = [
      [0, 0x80, 0x80],
      [0, 0, 0],
      [0, 0, 0],
    ];
  }

  public startRow(): void {
    this.lumaIndex = 1;
    this.chromaIndex = 1;
    this.leftY = [0, 0];
    this.leftU = 0;
    this.leftV = 0;
    this.leftRef = undefined;
  }

  public advanceMacroblock(): void {
    this.lumaIndex += 2;
    this.chromaIndex += 1;
  }

  public predict(blockNo: number, reference: Ref): number {
    const luma = blockNo < 4;
    const plane = luma ? 0 : blockNo - 3;
    const index = luma ? this.lumaIndex + (blockNo & 1) : this.chromaIndex;
    const refs = luma ? this.refsY : this.refsC;
    let sum = 0;
    let count = 0;

    if ((luma && (blockNo & 1) === 1) || this.leftRef === reference) {
      sum +=
        blockNo <= 1
          ? this.leftY[0]
          : blockNo <= 3
            ? this.leftY[1]
            : blockNo === 4
              ? this.leftU
              : this.leftV;
      count++;
    }
    if (refs[index] === reference) {
      sum += this.dc[plane][index];
      count++;
    }
    sum = i16(sum);
    return count === 0
      ? this.lastDc[reference][plane]
      : count === 2
        ? Math.trunc(sum / 2)
        : sum;
  }

  public update(blockNo: number, reference: Ref, dc: number): void {
    const luma = blockNo < 4;
    const plane = luma ? 0 : blockNo - 3;
    const index = luma ? this.lumaIndex + (blockNo & 1) : this.chromaIndex;

    if (blockNo !== 4) {
      (luma ? this.refsY : this.refsC)[index] = reference;
    }
    if (blockNo <= 1) {
      this.leftY[0] = dc;
    } else if (blockNo <= 3) {
      this.leftY[1] = dc;
    } else if (blockNo === 4) {
      this.leftU = dc;
    } else {
      this.leftV = dc;
      this.leftRef = reference;
    }
    this.dc[plane][index] = dc;
    this.lastDc[reference][plane] = dc;
  }
}
