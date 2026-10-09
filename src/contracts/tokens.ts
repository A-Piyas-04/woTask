import type { QualityTier } from './events';
import type { Priority } from './task';

type Vec3 = [number, number, number];

/**
 * Colour rule: hue identifies the region. Priority is carried by size, inner luminance, surface
 * finish and motion; completion by desaturation. The only non-region colours are `alert`
 * (overdue) and `completedNeutral`; everything else in the chrome is neutral grey/white.
 */
export const PALETTE = {
  /** Near-black, very slightly blue. Canvas clear colour and app background. */
  base: '#0A0C11',
  /** Muted, perceptually balanced (OKLCH L ≈ 0.66, C ≈ 0.075). Regions store an index, never the hex. */
  regionHues: ['#7490BD', '#5F9E8F', '#C09562', '#B57D8E', '#8E83BC', '#6B9DB0', '#B9796B', '#8EA06E'],
  /** The one global alert colour (overdue). Do not introduce a second. */
  alert: '#D4705F',
  completedNeutral: '#6B7280',
  /** Mix targets for the per-region ramp. */
  rampLight: '#EAF0F7',
  rampDark: '#0A0C11',
  white: '#FFFFFF',
  background: {
    base: '#0A0C11',
    gradientTop: '#131823',
    vignette: 0.35,
    /** Maximum share of the active region hue in the nebula. */
    nebulaTint: 0.08,
    nebulaAlpha: 0.1,
    /** Neutral nebula greys the region tint is mixed into. */
    nebula: ['#2A3140', '#1E2430', '#343B4A'],
  },
  stars: ['#FFF3E0', '#DCE7FF'],
  starOpacity: [0.35, 0.7] as [number, number],
} as const;

/** How each region hue becomes a ramp: `mix(base, target, amount)`. */
export const RAMP = {
  /** Emissive core: lightened and desaturated so bloom reads as a glow, never a neon lamp. */
  core: { target: PALETTE.rampLight, amount: 0.45 },
  dim: { target: PALETTE.rampDark, amount: 0.55 },
  text: { target: PALETTE.white, amount: 0.55 },
  completed: { target: PALETTE.completedNeutral, amount: 0.75 },
  /** Glass body (diffuse share of the transmission); too light and every sphere reads white. */
  glass: { target: PALETTE.white, amount: 0.3 },
  completedGlass: { target: PALETTE.white, amount: 0.3 },
} as const;

/** Chrome colours (DOM). Neutral by design; region hue enters only via CSS variables. */
export const UI = {
  text: 'rgba(232,238,245,0.92)',
  textStrong: 'rgba(232,238,245,0.88)',
  textMuted: 'rgba(232,238,245,0.50)',
  textFaint: 'rgba(232,238,245,0.38)',
  textGhost: 'rgba(232,238,245,0.30)',
  surface: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  hover: 'rgba(255,255,255,0.03)',
  activeRow: 'rgba(255,255,255,0.04)',
  panel: '#10131A',
  labelShadow: '0 1px 3px rgba(0,0,0,0.85)',
} as const;

export const TYPE = {
  family: '"Inter Variable", "Segoe UI Variable", "Segoe UI", "Nirmala UI", "Vrinda", system-ui, sans-serif',
  taskTitle: { size: 12, weight: 500, tracking: '-0.01em', color: 'rgba(232,238,245,0.92)' },
  taskMeta: { size: 10.5, weight: 400, tracking: '0', color: 'rgba(232,238,245,0.50)' },
  zoneTitle: { size: 13, weight: 500, tracking: '0.22em' },
  zoneSubtitle: { size: 10, weight: 400, tracking: '0.14em', color: 'rgba(232,238,245,0.38)' },
  sidebarName: { size: 13, weight: 450, color: 'rgba(232,238,245,0.88)' },
  sidebarCount: { size: 12, weight: 400, color: 'rgba(232,238,245,0.42)' },
  sidebarHeader: { size: 10, tracking: '0.16em', color: 'rgba(232,238,245,0.35)' },
  labelMaxWidth: 150,
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
  /** Completion shockwave in the region hue, ease-out. */
  burst: { seconds: 0.7, peakOpacity: 0.5 },
  /** High-priority core breathing: intensity × (1 ± amount) at `hz`. Ambient motion only. */
  breathe: { amount: 0.12, hz: 0.45 },
  /** Gentle hover-in-place of each sphere (world units / radians per second). */
  float: { amplitude: [0.16, 0.22, 0.14] as Vec3, speed: [0.55, 0.42, 0.37] as Vec3 },
  /** Momentum after a drag is released (per-second decay rate). */
  panFriction: 4.5,
  /** Label show/hide fade, ms. */
  labelFadeMs: 150,
} as const;

export interface PriorityStyle {
  radius: number;
  coreIntensity: number;
  roughness: number;
  transmission: number;
  /** Medium: faint inner halo around the core. */
  halo: boolean;
  /** High: equatorial ring in the core colour plus breathing. */
  ring: boolean;
}

export const MATERIALS = {
  glass: {
    color: '#ffffff',
    thickness: 1.6,
    ior: 1.45,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    /** Kept low: a strong oil-film sheen adds hues that are not the region's. */
    iridescence: 0.25,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 400] as [number, number],
    attenuationDistance: 1.4,
    envMapIntensity: 1.0,
  },
  priority: {
    0: { radius: 0.46, coreIntensity: 0.8, roughness: 0.38, transmission: 0.88, halo: false, ring: false },
    1: { radius: 0.55, coreIntensity: 1.5, roughness: 0.18, transmission: 0.95, halo: false, ring: false },
    2: { radius: 0.66, coreIntensity: 2.6, roughness: 0.06, transmission: 1, halo: true, ring: false },
    3: { radius: 0.78, coreIntensity: 3.8, roughness: 0.03, transmission: 1, halo: false, ring: true },
  } satisfies Record<Priority, PriorityStyle>,
  completed: { radius: 0.4, coreIntensity: 0.4, roughness: 0.45, transmission: 0.85, iridescence: 0.05 },
  core: {
    radiusRatio: 0.36,
    /** Multipliers on the priority intensity. */
    hoverBoost: 1.25,
    selectedBoost: 1.4,
  },
  halo: { radiusRatio: 1.15, opacity: 0.25 },
  /** High-priority equatorial ring, relative to the sphere radius. */
  highRing: { radiusRatio: 1.22, tube: 0.012, opacity: 0.8 },
  /** Overdue: thin outer ring in `PALETTE.alert`, slowly rotating. */
  overdueRing: { radiusRatio: 1.42, tube: 0.011, opacity: 0.7, spin: 0.35 },
  /** Selection ring in the region base hue. */
  ring: { radiusRatio: 1.32, tube: 0.016, opacity: 0.85 },
  hub: { radius: 0.3, intensity: 1.6 },
  /** Goal progress arc around the hub: region hue at 40%, kept below the bloom threshold. */
  goalArc: { radius: 0.62, width: 0.035, opacity: 0.4 },
  lines: { activeOpacity: 0.22, inactiveOpacity: 0.1, parentBoost: 1.2, childFade: 0.7 },
  /** Zone floor: radial-gradient disc plus a hairline boundary. */
  zoneDisc: { centerAlpha: 0.05, hairlineOpacity: 0.1, inactiveFactor: 0.4 },
} as const;

/** Neutral lighting only: coloured reflections on the glass would break the hue rule. */
export const LIGHTING = {
  envResolution: 256,
  ambient: 0.12,
  key: { position: [6, 8, 10] as Vec3, intensity: 1.8, color: '#FFF3E6' },
  fill: { position: [-8, 2, 6] as Vec3, intensity: 0.6, color: '#DCE7FF' },
  rim: { position: [0, -6, -8] as Vec3, intensity: 1.2, color: '#DCE7FF' },
  /** Lightformer panels baked into the environment map, no HDRI. */
  formers: [
    { position: [0, 6, -9] as Vec3, scale: [12, 2, 1] as Vec3, intensity: 2.4, color: '#FFFFFF' },
    { position: [-6, 1, -1] as Vec3, scale: [10, 2.5, 1] as Vec3, intensity: 1.6, color: '#DCE7FF', rotationY: Math.PI / 2 },
    { position: [6, 1, -1] as Vec3, scale: [10, 2.5, 1] as Vec3, intensity: 1.6, color: '#FFF3E0', rotationY: -Math.PI / 2 },
    { position: [0, -6, 3] as Vec3, scale: [14, 4, 1] as Vec3, intensity: 0.5, color: '#C8CED8', rotationX: -Math.PI / 2 },
  ],
} as const;

/** Each region is a constellation: tasks on a golden-angle spiral around a hub. */
export const CONSTELLATION = {
  spiralSpacing: 1.95,
  spiralStart: 1.1,
  ellipseX: 1.25,
  depthJitter: 1.8,
  zoneGap: 2.5,
  hoverScale: 1.14,
  selectedScale: 1.24,
  pressScale: 0.9,
  enterStagger: 0.04,
  labelOffset: 0.42,
  zoneLabelOffset: 0.5,
  orbitPadding: 1.3,
} as const;

/** Application chrome over the canvas, in CSS pixels; the camera frames zones to clear it. */
export const CHROME = {
  /** Quick-capture bar plus hint line at the bottom of the canvas. */
  inputBarPx: 92,
  /** Breathing room between a zone title and the top edge of the canvas. */
  titleClearancePx: 24,
  /** Rendered height of the zone title block (name + subtitle); labels are centred on their anchor. */
  zoneTitlePx: 36,
} as const;

export const CAMERA = {
  fov: 45,
  near: 0.1,
  far: 400,
  distance: 19,
  minDistance: 7,
  maxDistance: 42,
  zoomPerWheelPixel: 0.0012,
  /** How far the camera sways with the mouse, for parallax. */
  pointerParallax: [1.1, 0.7] as [number, number],
  dragThresholdPx: 5,
  boundsMargin: 8,
  /** Active-region labels are shown when the camera is closer than this. */
  labelDistance: 24,
  /** All labels fade out with camera distance between these two (smoothstep). */
  labelFade: [20, 34] as [number, number],
  /** Skip the label collision pass while the camera moves faster than this (world units / s). */
  labelCollisionMaxSpeed: 4,
  /** Collision pass only considers this many visible labels. */
  labelCollisionCap: 60,
} as const;

/** Background layers at increasing depth; camera translation produces real parallax. */
export const PARALLAX = {
  backdrop: { z: -110, size: [420, 300] as [number, number] },
  nebula: [
    { z: -70, size: [300, 210] as [number, number], seed: 11 },
    { z: -38, size: [190, 140] as [number, number], seed: 29 },
  ],
  stars: { zRange: [-95, -30] as [number, number], spread: [260, 190] as [number, number], size: 0.5 },
  dust: { zRange: [-6, 5] as [number, number], spread: [120, 90] as [number, number], size: 0.08, count: 420, drift: 0.012, opacity: 0.35 },
} as const;

export interface QualitySettings {
  dpr: [number, number];
  bloom: boolean;
  chromaticAberration: boolean;
  smaa: boolean;
  stars: number;
  sphereSegments: number;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  high: { dpr: [1, 2], bloom: true, chromaticAberration: true, smaa: true, stars: 2600, sphereSegments: 48 },
  medium: { dpr: [1, 1.5], bloom: true, chromaticAberration: false, smaa: true, stars: 1500, sphereSegments: 32 },
  low: { dpr: [1, 1], bloom: false, chromaticAberration: false, smaa: false, stars: 700, sphereSegments: 24 },
};

export const EFFECTS = {
  toneMappingExposure: 1.0,
  bloom: { intensity: 0.55, luminanceThreshold: 0.88, luminanceSmoothing: 0.4, radius: 0.72, mipmapBlur: true },
  chromaticAberration: { offset: [0.0006, 0.0006] as [number, number] },
  vignette: { offset: 0.25, darkness: 0.45 },
} as const;

/** Hex for a region's stored `colorIndex` (wraps past the end of the palette). */
export const regionHue = (colorIndex: number): string =>
  PALETTE.regionHues[((colorIndex % PALETTE.regionHues.length) + PALETTE.regionHues.length) % PALETTE.regionHues.length];
