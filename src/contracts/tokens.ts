import type { QualityTier } from './events';
import type { Priority } from './task';

type Vec3 = [number, number, number];

export const PALETTE = {
  base: '#080a12',
  surface: '#121624',
  surfaceRaised: '#1a1f31',
  border: '#2a3150',
  text: '#e9edf7',
  textDim: '#8d96ad',
  accent: '#7c9cff',
  accentAlt: '#c084fc',
  success: '#4fd1a5',
  danger: '#ff6b7a',
  priority: {
    0: '#5b6478',
    1: '#4fa3ff',
    2: '#ffb547',
    3: '#ff5f6d',
  } satisfies Record<Priority, string>,
  /** Glowing orbs behind the glass cards; they give the transmission something to refract. */
  orbs: ['#3b5bff', '#a855f7', '#14b8a6', '#f472b6'],
  listColors: ['#7c9cff', '#4fd1a5', '#ffb547', '#f472b6', '#c084fc', '#38bdf8', '#ff6b7a', '#a3e635'],
} as const;

/**
 * Motion is driven by maath critically-damped easing inside useFrame.
 * `smoothTime` is the approximate time in seconds to reach the target.
 */
export const MOTION = {
  hover: { smoothTime: 0.12 },
  press: { smoothTime: 0.06 },
  enter: { smoothTime: 0.28 },
  layout: { smoothTime: 0.22 },
  complete: { smoothTime: 0.35 },
  scroll: { smoothTime: 0.2 },
  color: { smoothTime: 0.15 },
} as const;

export const MATERIALS = {
  glass: {
    color: '#dfe6ff',
    transmission: 1,
    roughness: 0.22,
    thickness: 0.9,
    ior: 1.4,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    metalness: 0,
    attenuationColor: '#b9c7ff',
    attenuationDistance: 2.5,
    envMapIntensity: 1.1,
  },
  glassHighPriority: {
    color: '#ffe3e3',
    attenuationColor: '#ff9aa4',
  },
  glassCompleted: {
    color: '#9aa3b8',
    roughness: 0.55,
    transmission: 0.75,
  },
  glassSelected: {
    emissiveIntensity: 0.18,
  },
  accentBar: {
    emissiveIntensity: 2.2,
    emissiveIntensityCompleted: 0.4,
  },
  backdrop: {
    color: '#0c1020',
    roughness: 0.9,
  },
} as const;

export const LIGHTING = {
  envResolution: 256,
  ambient: 0.15,
  key: { position: [4, 6, 8] as Vec3, intensity: 2.2, color: '#fff3e6' },
  fill: { position: [-6, 2, 6] as Vec3, intensity: 0.8, color: '#cfe0ff' },
  rim: { position: [0, -4, -6] as Vec3, intensity: 1.4, color: '#a5b4ff' },
  /** Lightformer panels baked into the environment map, no HDRI. */
  formers: [
    { position: [0, 5, -9] as Vec3, scale: [10, 1.5, 1] as Vec3, intensity: 3, color: '#ffffff' },
    { position: [-5, 1, -1] as Vec3, scale: [10, 2, 1] as Vec3, intensity: 2, color: '#8fb0ff', rotationY: Math.PI / 2 },
    { position: [5, 1, -1] as Vec3, scale: [10, 2, 1] as Vec3, intensity: 2, color: '#d8b4fe', rotationY: -Math.PI / 2 },
    { position: [0, -6, 3] as Vec3, scale: [12, 4, 1] as Vec3, intensity: 0.6, color: '#334155', rotationX: -Math.PI / 2 },
  ],
} as const;

export const LAYOUT = {
  card: { width: 5.6, height: 0.92, depth: 0.16, radius: 0.12, segments: 4 },
  gap: 0.2,
  camera: { position: [0, 0, 11] as Vec3, fov: 36, near: 0.1, far: 80 },
  hoverLift: 0.18,
  selectLift: 0.38,
  pressDepth: -0.12,
  selectScale: 1.025,
  enterOffset: -2.5,
  accentBar: { width: 0.07, inset: 0.16 },
  /** CSS pixels per world unit for the DOM label (drei Html transform at distanceFactor). */
  labelPxPerUnit: 100,
  scrollPerWheelPixel: 0.006,
  viewportPadding: 1.1,
} as const;

export interface QualitySettings {
  dpr: [number, number];
  bloom: boolean;
  ao: boolean;
  chromaticAberration: boolean;
  smaa: boolean;
  transmissionSamples: number;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  high: { dpr: [1, 2], bloom: true, ao: true, chromaticAberration: true, smaa: true, transmissionSamples: 6 },
  medium: { dpr: [1, 1.5], bloom: true, ao: false, chromaticAberration: false, smaa: true, transmissionSamples: 4 },
  low: { dpr: [1, 1], bloom: false, ao: false, chromaticAberration: false, smaa: false, transmissionSamples: 2 },
};

export const EFFECTS = {
  bloom: { intensity: 0.9, luminanceThreshold: 0.6, luminanceSmoothing: 0.25, mipmapBlur: true },
  ao: { aoRadius: 0.6, intensity: 1.6, distanceFalloff: 1 },
  chromaticAberration: { offset: [0.0006, 0.0006] as [number, number] },
  vignette: { offset: 0.25, darkness: 0.7 },
} as const;

export const FONT_STACK = '"Segoe UI Variable", "Segoe UI", "Nirmala UI", "Vrinda", system-ui, sans-serif';
