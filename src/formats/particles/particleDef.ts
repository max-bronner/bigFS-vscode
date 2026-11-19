export type Vec3 = [number, number, number];

export interface Range {
  low: number;
  high: number;
}

export type Volume =
  | { type: 'point' }
  | { type: 'line'; start: Vec3; end: Vec3 }
  | { type: 'box'; halfSize: Vec3; hollow: boolean }
  | { type: 'sphere'; radius: number; hollow: boolean }
  | {
      type: 'cylinder';
      radius: number;
      radiusRate: number;
      length: number;
      offset: Vec3;
      hollow: boolean;
    }
  | { type: 'unread'; module: string };

export type Velocity =
  | { type: 'ortho'; x: Range; y: Range; z: Range }
  | { type: 'spherical'; speed: Range }
  | { type: 'hemispherical'; speed: Range }
  | { type: 'cylindrical'; radial: Range; normal: Range }
  | { type: 'outward'; speed: Range; otherSpeed: Range };

export interface ColorKey {
  rgb: Vec3;
  frame: number;
}

export interface AlphaKey {
  value: Range;
  frame: number;
}

export interface Wind {
  motion: 'none' | 'pingpong' | 'circular';
  strength: number;
  fullStrengthDist: number;
  zeroStrengthDist: number;
  angleChange: Range;
  start: Range;
  end: Range;
}

export interface ParticleDef {
  name: string;
  form: 'block' | 'flat';
  particleName?: string;
  shader: string;
  type: string;
  drawModule?: string;
  priority?: string;
  lifetime: Range;
  systemLifetime: number;
  initialDelay: Range;
  burstCount: Range;
  burstDelay: Range;
  size: Range;
  startSizeRate: Range;
  oneShot: boolean;
  groundAligned: boolean;
  upTowardsEmitter: boolean;
  volume: Volume;
  velocity: Velocity;
  gravity: number;
  drift: Vec3;
  velocityDamping: Range;
  attachToBone: boolean;
  sizeRate: Range;
  sizeRateDamping: Range;
  angleZ: Range;
  angularRateZ: Range;
  angularDamping: Range;
  colors: ColorKey[];
  alphas: AlphaKey[];
  hasAlphaBlock: boolean;
  colorScale: Range;
  flipbook?: { totalFrames: number; framesPerRow: number; speed: number };
  slaveSystem?: string;
  slavePosOffset: Vec3;
  perParticleSystem?: string;
  event?: { fx?: string; heightOffset: number; killAfterEvent: boolean };
  wind?: Wind;
}
