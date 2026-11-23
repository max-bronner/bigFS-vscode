import type { ModelScene } from "../../formats/w3d/w3dScene";
import type { SceneTexture } from "../../formats/w3d/w3dSceneDraws";

const isPowerOfTwo = (value: number) => (value & (value - 1)) === 0;

const writeTexture = (
  gl: WebGLRenderingContext,
  texture: WebGLTexture,
  { width, height, pixels }: SceneTexture,
  tiles: boolean,
) => {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
  );
  if (tiles) {
    gl.generateMipmap(gl.TEXTURE_2D);
  }
};

const addLuminance = async (mask: SceneTexture): Promise<SceneTexture | undefined> => {
  const { width, height, pixels, luminanceJpeg } = mask;

  if (!luminanceJpeg || typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") {
    return undefined;
  }

  const bitmap = await createImageBitmap(new Blob([new Uint8Array(luminanceJpeg)], { type: "image/jpeg" }));
  const context = new OffscreenCanvas(width, height).getContext("2d");

  if (!context) {
    bitmap.close();
    return undefined;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const luminance = context.getImageData(0, 0, width, height).data;
  const combined = new Uint8Array(pixels.length);

  for (let at = 0; at < combined.length; at += 4) {
    combined[at] = luminance[at];
    combined[at + 1] = luminance[at + 1];
    combined[at + 2] = luminance[at + 2];
    combined[at + 3] = pixels[at + 3];
  }
  return { width, height, pixels: combined };
};

interface SharedTexture {
  texture: WebGLTexture;
  users: number;
  waiting: Set<() => void> | undefined;
  forget(): void;
}

const sharedByContext = new WeakMap<
  WebGLRenderingContext,
  { byImage: Map<SceneTexture, Map<string, SharedTexture>>; byTexture: Map<WebGLTexture, SharedTexture> }
>();

const getShared = (gl: WebGLRenderingContext) => {
  let shared = sharedByContext.get(gl);

  if (!shared) {
    shared = { byImage: new Map(), byTexture: new Map() };
    sharedByContext.set(gl, shared);
  }
  return shared;
};

export const releaseTextures = (
  gl: WebGLRenderingContext,
  textures: readonly WebGLTexture[],
): void => {
  const { byTexture } = getShared(gl);

  for (const texture of textures) {
    const entry = byTexture.get(texture);

    if (entry && --entry.users > 0) {
      continue;
    }
    entry?.forget();
    byTexture.delete(texture);
    gl.deleteTexture(texture);
  }
};

export const uploadTextures = (
  gl: WebGLRenderingContext,
  { textures, addressing }: Pick<ModelScene, "textures" | "addressing">,
  onChange?: () => void,
): WebGLTexture[] =>
  textures.map((image, at) => {
    const { byImage, byTexture } = getShared(gl);
    const clamp = addressing?.[at];
    const sampling = `${!!clamp?.clampU}|${!!clamp?.clampV}`;
    const uploads = byImage.get(image) ?? new Map<string, SharedTexture>();
    const known = uploads.get(sampling);

    if (known) {
      known.users++;
      if (onChange) {
        known.waiting?.add(onChange);
      }
      return known.texture;
    }

    const texture = gl.createTexture()!;
    const entry: SharedTexture = {
      texture,
      users: 1,
      waiting: image.luminanceJpeg ? new Set(onChange ? [onChange] : []) : undefined,
      forget: () => {
        uploads.delete(sampling);
        if (!uploads.size) {
          byImage.delete(image);
        }
      },
    };

    uploads.set(sampling, entry);
    byImage.set(image, uploads);
    byTexture.set(texture, entry);

    const tiles = isPowerOfTwo(image.width) && isPowerOfTwo(image.height);
    const wrapOf = (clamped?: boolean) => (tiles && !clamped ? gl.REPEAT : gl.CLAMP_TO_EDGE);

    writeTexture(gl, texture, image, tiles);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      tiles ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapOf(clamp?.clampU));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapOf(clamp?.clampV));
    if (image.luminanceJpeg) {
      addLuminance(image)
        .then((combined) => {
          if (combined && gl.isTexture(texture)) {
            writeTexture(gl, texture, combined, tiles);
            entry.waiting?.forEach((listener) => listener());
          }
        })
        .catch(() => {
        })
        .finally(() => {
          entry.waiting = undefined;
        });
    }
    return texture;
  });
