import type { Slot } from './aptTimeline';

export interface Pose {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skew: number;
  alpha: number;
}

export const getPose = (slot: Slot): Pose => {
  const [a, b, c, d] = slot.matrix;
  const scaleX = Math.hypot(a, b);
  const rotation = Math.atan2(b, a);
  const scaleY = scaleX ? (a * d - b * c) / scaleX : Math.hypot(c, d);

  return {
    x: slot.translate[0],
    y: slot.translate[1],
    scaleX,
    scaleY,
    rotation: (rotation * 180) / Math.PI,
    skew: scaleX ? (a * c + b * d) / (scaleX * scaleX) : 0,
    alpha:
      slot.colorTransform === undefined
        ? 1
        : (slot.colorTransform >>> 24) / 255,
  };
};

export const withPose = (slot: Slot, pose: Pose): Slot => {
  const radians = (pose.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const alpha = Math.round(Math.min(1, Math.max(0, pose.alpha)) * 255);
  const round = (value: number) => Math.round(value * 1e4) / 1e4;

  return {
    ...slot,
    matrix: [
      round(pose.scaleX * cos),
      round(pose.scaleX * sin),
      round(pose.scaleX * pose.skew * cos - pose.scaleY * sin),
      round(pose.scaleX * pose.skew * sin + pose.scaleY * cos),
    ],
    translate: [round(pose.x), round(pose.y)],
    colorTransform:
      alpha === 255 &&
      (slot.colorTransform === undefined ||
        (slot.colorTransform & 0xffffff) === 0xffffff)
        ? slot.colorTransform === undefined
          ? undefined
          : ((slot.colorTransform & 0xffffff) | (255 << 24)) >>> 0
        : (((slot.colorTransform ?? 0xffffffff) & 0xffffff) | (alpha << 24)) >>>
          0,
  };
};

export type PoseFormulas = Partial<Record<keyof Pose, string>>;
