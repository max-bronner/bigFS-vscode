import * as assert from 'assert';
import { Vp6Movie, parseVp6, writeVp6 } from '../../formats/vp6/container';
import {
  encodeMovie,
  fitMovieSize,
  getGameWidthWarning,
  validateMovieSize,
} from '../../formats/vp6/encodeMovie';
import type { FrameSource } from '../../formats/vp6/encodeMovie';
import { Vp6Encoder, pictureFromRgba } from '../../formats/vp6/encoder';

const buildFrame = (width: number, height: number, shift: number) => {
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;

      rgba[at] = (x * 3 + shift) & 255;
      rgba[at + 1] = y * 4;
      rgba[at + 2] = x > width / 2 ? 220 : 30;
      rgba[at + 3] = Math.min(255, x * 5);
    }
  }
  return rgba;
};

const psnr = (
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  channels: number[],
) => {
  let error = 0;
  let count = 0;

  for (let at = 0; at < a.length; at += 4) {
    for (const channel of channels) {
      error += (a[at + channel] - b[at + channel]) ** 2;
      count++;
    }
  }
  return 10 * Math.log10((255 * 255) / (error / count));
};

suite('VP6 encoder', () => {
  test('a movie it writes, key and inter frames, reads back close to the source with its rate and alpha', async () => {
    const [width, height] = [70, 38];
    let next = 0;
    const bytes = await encodeMovie(
      {
        width,
        height,
        rateNumerator: 30000,
        rateDenominator: 1001,
        alpha: true,
        next: async () =>
          next < 4 ? buildFrame(width, height, next++ * 9) : undefined,
      },
      { quality: 54 },
    );
    const movie = new Vp6Movie(bytes!);

    assert.deepStrictEqual(
      parseVp6(bytes!).frames.map((each) => each.isKey),
      [true, false, false, false],
    );

    assert.strictEqual(movie.frameCount, 4);
    assert.strictEqual(movie.hasAlpha, true);
    assert.ok(Math.abs(movie.framesPerSecond - 29.97) < 0.01);
    for (let index = 0; index < 4; index++) {
      const source = buildFrame(width, height, index * 9);
      const shown = movie.decodeFrame(index);

      assert.ok(psnr(source, shown, [0, 1, 2]) > 32, `frame ${index} colour`);
      assert.ok(psnr(source, shown, [3]) > 38, `frame ${index} alpha`);
    }
  });

  test('seeking in a movie whose alpha key frames are not at its colour key frames equals playing through', () => {
    const [width, height, count] = [32, 16, 12];
    const colour = new Vp6Encoder({ quality: 54 });
    const alpha = new Vp6Encoder({ quality: 54 });
    const frames = [];

    for (let index = 0; index < count; index++) {
      const rgba = buildFrame(width, height, index * 9);
      const colourKey = colour.encode(
        pictureFromRgba(rgba, width, height),
        index % 6 === 0,
      );
      const alphaKey = alpha.encode(
        pictureFromRgba(rgba, width, height, true),
        index % 3 === 0 && index % 6 !== 0 ? true : index === 0,
      );

      frames.push({
        colour: colourKey.data,
        isKey: colourKey.isKey,
        alpha: alphaKey.data,
        isAlphaKey: alphaKey.isKey,
      });
    }

    const bytes = writeVp6({
      width,
      height,
      rateNumerator: 15,
      rateDenominator: 1,
      frames,
    });
    const played = new Vp6Movie(bytes);
    const expected: Uint8ClampedArray[] = [];

    for (let index = 0; index < count; index++) {
      expected.push(played.decodeFrame(index));
    }

    const seeker = new Vp6Movie(bytes);

    assert.deepStrictEqual(seeker.decodeFrame(count - 1), expected[count - 1]);
    assert.deepStrictEqual(seeker.decodeFrame(7), expected[7]);
  });

  test('every chunk it writes is padded to 4 bytes and the movie still decodes', async () => {
    const [width, height] = [70, 38];
    let next = 0;
    const bytes = (await encodeMovie(
      {
        width,
        height,
        rateNumerator: 15,
        rateDenominator: 1,
        alpha: true,
        next: async () =>
          next < 4 ? buildFrame(width, height, next++ * 9) : undefined,
      },
      { quality: 54 },
    ))!;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sizes: number[] = [];

    for (let at = 0; at < bytes.length; at += sizes[sizes.length - 1]) {
      sizes.push(view.getUint32(at + 4, true));
    }

    assert.strictEqual(sizes.length, 3 + 8);
    assert.deepStrictEqual(
      sizes.filter((size) => size % 4),
      [],
    );

    const movie = new Vp6Movie(bytes);

    for (let index = 0; index < 4; index++) {
      const shown = movie.decodeFrame(index);

      assert.ok(
        psnr(buildFrame(width, height, index * 9), shown, [0, 1, 2]) > 32,
        `frame ${index}`,
      );
    }
  });

  test('a movie wider than the retail games play is warned about, and one VP6 cannot code or of odd width is refused', async () => {
    const encode = (width: number) => {
      let next = 0;

      return encodeMovie(
        {
          width,
          height: 16,
          rateNumerator: 15,
          rateDenominator: 1,
          alpha: false,
          next: async () =>
            next++ < 1 ? buildFrame(width, 16, 0) : undefined,
        },
        { quality: 28 },
      );
    };

    assert.ok(await encode(1026));
    assert.match(getGameWidthWarning(1026)!, /up to 1024 pixels wide, so the game may crash/);
    assert.strictEqual(getGameWidthWarning(1024), undefined);
    await assert.rejects(encode(4096), /1 to 4080/);
    await assert.rejects(encode(71), /even/);
  });

  const createSource = (): FrameSource => {
    let index = 0;

    return {
      width: 64,
      height: 32,
      rateNumerator: 15,
      rateDenominator: 1,
      alpha: false,
      next: async () => (index < 3 ? buildFrame(64, 32, index++ * 40) : undefined),
    };
  };

  test('chunks of a kind it does not know are skipped, as the retail player skips them', async () => {
    const bytes = (await encodeMovie(createSource(), { quality: 40 }))!;
    const unknown = Uint8Array.from([...Buffer.from('XXXX'), 12, 0, 0, 0, 1, 2, 3, 4]);
    const firstChunkEnd = 32 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(36, true);
    const spliced = Buffer.concat([
      bytes.subarray(0, 32),
      unknown,
      bytes.subarray(32, firstChunkEnd),
      unknown,
      bytes.subarray(firstChunkEnd),
    ]);
    const movie = new Vp6Movie(spliced);

    assert.strictEqual(movie.frameCount, 3);
    assert.deepStrictEqual(movie.decodeFrame(2), new Vp6Movie(bytes).decodeFrame(2));
  });

  test('the default size is the source fitted to the game width with even sides', () => {
    assert.deepStrictEqual(fitMovieSize(1920, 1080), [1024, 576]);
    assert.deepStrictEqual(fitMovieSize(703, 401), [704, 402]);
    assert.deepStrictEqual(fitMovieSize(640, 480), [640, 480]);
    assert.strictEqual(validateMovieSize(...fitMovieSize(4000, 333)), undefined);
  });

  test('an empty file says so', () => {
    assert.throws(() => new Vp6Movie(new Uint8Array(0)), /empty/);
  });
});
