import type { QualityTier } from './events';
import type { Priority } from './task';

type Vec3 = [number, number, number];

export const PALETTE = {
  base: '#05060d',
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
    0: '#9aa6c4',
    1: '#4fa3ff',
    2: '#ffb547',
    3: '#ff4f6a',
  } satisfies Record<Priority, string>,
  nebula: ['#3b5bff', '#a855f7', '#14b8a6', '#f472b6', '#1e3a8a', '#6d28d9'],
  stars: ['#ffffff', '#cfe0ff', '#ffe9c7', '#d9c8ff'],
  /** Region identity hues; regions store an index into this array, never the hex. */
  regionHues: ['#7c9cff', '#4fd1a5', '#ffb547', '#f472b6', '#c084fc', '#38bdf8', '#ff6b7a', '#a3e635'],
} as const;

/**
 * Motion is driven by maath critically-damped easing inside useFrame.
 * `smoothTime` is the approximate time in seconds to reach the target.
 */
export const MOTION = {
  hover: { smoothTime: 0.14 },
  press: { smoothTime: 0.06 },
  enter: { smoothTime: 0.45 },
  layout: { smoothTime: 0.5 },
  color: { smoothTime: 0.2 },
  camera: { smoothTime: 0.35 },
  cameraFocus: { smoothTime: 0.6 },
  burstSeconds: 0.9,
  /** Gentle hover-in-place of each sphere (world units / radians per second). */
  float: { amplitude: [0.16, 0.22, 0.14] as Vec3, speed: [0.55, 0.42, 0.37] as Vec3 },
  /** Momentum after a drag is released (per-second decay rate). */
  panFriction: 4.5,
} as const;

export const MATERIALS = {
  glass: {
    color: '#ffffff',
    transmission: 1,
    roughness: 0.08,
    thickness: 1.6,
    ior: 1.45,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    iridescence: 0.85,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 480] as [number, number],
    attenuationDistance: 2.2,
    envMapIntensity: 1.25,
  },
  glassCompleted: {
    roughness: 0.3,
    iridescence: 0.35,
  },
  core: {
    radiusRatio: 0.36,
    intensity: 2.6,
    hoverIntensity: 4,
    selectedIntensity: 5,
    completedIntensity: 1.8,
  },
  ring: { radiusRatio: 1.45, tube: 0.022, intensity: 3 },
  hub: { radius: 0.42, intensity: 3.2 },
  lines: { chainOpacity: 0.7 },
  orbit: { opacity: 0.22 },
} as const;

export const LIGHTING = {
  envResolution: 256,
  ambient: 0.12,
  key: { position: [6, 8, 10] as Vec3, intensity: 2.0, color: '#fff3e6' },
  fill: { position: [-8, 2, 6] as Vec3, intensity: 0.7, color: '#cfe0ff' },
  rim: { position: [0, -6, -8] as Vec3, intensity: 1.6, color: '#a5b4ff' },
  /** Lightformer panels baked into the environment map, no HDRI. */
  formers: [
    { position: [0, 6, -9] as Vec3, scale: [12, 2, 1] as Vec3, intensity: 3, color: '#ffffff' },
    { position: [-6, 1, -1] as Vec3, scale: [10, 2.5, 1] as Vec3, intensity: 2.2, color: '#8fb0ff', rotationY: Math.PI / 2 },
    { position: [6, 1, -1] as Vec3, scale: [10, 2.5, 1] as Vec3, intensity: 2.2, color: '#f0abfc', rotationY: -Math.PI / 2 },
    { position: [0, -6, 3] as Vec3, scale: [14, 4, 1] as Vec3, intensity: 0.7, color: '#2dd4bf', rotationX: -Math.PI / 2 },
  ],
} as const;

/** Each region is a constellation: tasks on a golden-angle spiral around a hub. */
export const CONSTELLATION = {
  spiralSpacing: 1.95,
  spiralStart: 1.1,
  ellipseX: 1.25,
  depthJitter: 1.8,
  zoneGap: 2.5,
  orbRadius: { 0: 0.5, 1: 0.56, 2: 0.64, 3: 0.74 } satisfies Record<Priority, number>,
  completedRadius: 0.44,
  hoverScale: 1.14,
  selectedScale: 1.24,
  pressScale: 0.9,
  enterStagger: 0.04,
  labelOffset: 0.42,
  zoneLabelOffset: 0.5,
  orbitPadding: 1.3,
} as const;

export const CAMERA = {
  fov: 45,
  near: 0.1,
  far: 400,
  distance: 19,
  /** When flying to a region, look slightly above the hub so the zone title clears the task input. */
  zoneFocusOffsetY: 1.3,
  minDistance: 7,
  maxDistance: 42,
  zoomPerWheelPixel: 0.0012,
  /** How far the camera sways with the mouse, for parallax. */
  pointerParallax: [1.1, 0.7] as [number, number],
  dragThresholdPx: 5,
  boundsMargin: 8,
  /** Html labels: CSS scale 1 at the default distance. */
  labelDistanceFactor: 14,
} as const;

/** Background layers at increasing depth; camera translation produces real parallax. */
export const PARALLAX = {
  backdrop: { z: -110, size: [420, 300] as [number, number] },
  nebula: [
    { z: -70, size: [300, 210] as [number, number], opacity: 0.55, seed: 11 },
    { z: -38, size: [190, 140] as [number, number], opacity: 0.35, seed: 29 },
  ],
  stars: { zRange: [-95, -30] as [number, number], spread: [260, 190] as [number, number], size: 0.55 },
  dust: { zRange: [-6, 5] as [number, number], spread: [120, 90] as [number, number], size: 0.09, count: 420, drift: 0.012 },
} as const;

export interface QualitySettings {
  dpr: [number, number];
  bloom: boolean;
  ao: boolean;
  chromaticAberration: boolean;
  smaa: boolean;
  stars: number;
  sphereSegments: number;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  high: { dpr: [1, 2], bloom: true, ao: false, chromaticAberration: true, smaa: true, stars: 2600, sphereSegments: 48 },
  medium: { dpr: [1, 1.5], bloom: true, ao: false, chromaticAberration: false, smaa: true, stars: 1500, sphereSegments: 32 },
  low: { dpr: [1, 1], bloom: false, ao: false, chromaticAberration: false, smaa: false, stars: 700, sphereSegments: 24 },
};

export const EFFECTS = {
  bloom: { intensity: 1.1, luminanceThreshold: 0.55, luminanceSmoothing: 0.3, mipmapBlur: true },
  ao: { aoRadius: 0.6, intensity: 1.6, distanceFalloff: 1 },
  chromaticAberration: { offset: [0.0007, 0.0007] as [number, number] },
  vignette: { offset: 0.2, darkness: 0.75 },
} as const;

export const FONT_STACK = '"Segoe UI Variable", "Segoe UI", "Nirmala UI", "Vrinda", system-ui, sans-serif';

/** Hex for a region's stored `colorIndex` (wraps past the end of the palette). */
export const regionHue = (colorIndex: number): string =>
  PALETTE.regionHues[((colorIndex % PALETTE.regionHues.length) + PALETTE.regionHues.length) % PALETTE.regionHues.length];
