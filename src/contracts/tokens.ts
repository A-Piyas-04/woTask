import type { QualityTier } from './events';
import type { Priority, SpaceKind } from './task';

type Vec3 = [number, number, number];

/**
 * Colour rule: hue identifies the space. Priority is carried by size, inner luminance, surface
 * finish and motion; completion by desaturation. The only non-space colours are `alert`
 * (overdue) and `completedNeutral`; everything else in the chrome is neutral grey/white.
 */
export const PALETTE = {
  /** Near-black, very slightly blue. Canvas clear colour and app background. */
  base: '#0A0C11',
  /**
   * Spaces store an index, never the hex, so existing entries must never move. The first eight are the
   * original muted set (OKLCH L ≈ 0.66, C ≈ 0.075); the rest vary lightness (0.60–0.74) and chroma
   * (≤ 0.13) as well as hue, picked greedily to maximise the smallest OKLab distance to every earlier entry.
   */
  spaceHues: [
    '#7490BD', '#5F9E8F', '#C09562', '#B57D8E', '#8E83BC', '#6B9DB0', '#B9796B', '#8EA06E',
    '#D38DD9', '#F1878F', '#40C59B', '#8EA5FD', '#2BBCE7', '#539344', '#9A7C2A', '#AC60A2',
    '#B3B144', '#0A8FA8', '#5F7BCE', '#BF5B71', '#4EAC6C', '#ED905E', '#2DA0DA', '#A89620',
  ],
  /** The one global alert colour (overdue). Do not introduce a second. */
  alert: '#D4705F',
  completedNeutral: '#6B7280',
  /** Mix targets for the per-space ramp. */
  rampLight: '#EAF0F7',
  rampDark: '#0A0C11',
  white: '#FFFFFF',
  background: {
    base: '#0A0C11',
    gradientTop: '#131823',
    vignette: 0.35,
    /** Maximum share of the active space hue in the nebula. */
    nebulaTint: 0.08,
    nebulaAlpha: 0.1,
    /** Neutral nebula greys the space tint is mixed into. */
    nebula: ['#2A3140', '#1E2430', '#343B4A'],
  },
  stars: ['#FFF3E0', '#DCE7FF'],
  starOpacity: [0.35, 0.7] as [number, number],
} as const;

/** How each space hue becomes a ramp: `mix(base, target, amount)`. */
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

/** Chrome colours (DOM). Neutral by design; space hue enters only via CSS variables. */
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
  /** Kind cluster heading (Projects / Goals / Categories); it stays readable when zone titles have faded. */
  clusterTitle: { size: 16 },
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
  /** Completion shockwave in the space hue, ease-out. */
  burst: { seconds: 0.7, peakOpacity: 0.5 },
  /** High-priority core breathing: intensity × (1 ± amount) at `hz`. Ambient motion only. */
  breathe: { amount: 0.12, hz: 0.45 },
  /** Gentle hover-in-place of each sphere (world units / radians per second). */
  float: { amplitude: [0.16, 0.22, 0.14] as Vec3, speed: [0.55, 0.42, 0.37] as Vec3 },
  /** Momentum after a drag is released (per-second decay rate). */
  panFriction: 4.5,
  /** Label show/hide fade, ms. */
  labelFadeMs: 150,
  /**
   * DOM motion. The scene is damped per frame; the chrome is not, so it needs its own durations and
   * curves. Published as CSS custom properties by `applyTheme`, so no stylesheet hardcodes a timing.
   *
   * Two curves, used consistently: things arriving decelerate into place, things leaving accelerate
   * away. A panel that eased out on the way in and on the way out would feel slack.
   */
  ui: {
    /** Panels and dialogs. */
    panelMs: 200,
    /** Panel exit, deliberately quicker than entry: getting out of the way should not be savoured. */
    panelOutMs: 130,
    /** Hovers, presses, chips, rows - anything that should feel immediate. */
    quickMs: 120,
    /** Per-row delay when a list staggers in. */
    staggerMs: 22,
    /** How long an inline "saved" acknowledgement stays up. */
    ackMs: 1100,
    /** Decelerating, for things entering. */
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    /** Accelerating, for things leaving. */
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    /** Symmetric, for things that merely change. */
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
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
    /** Kept low: a strong oil-film sheen adds hues that are not the space's. */
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
  /** Selection ring in the space base hue. */
  ring: { radiusRatio: 1.32, tube: 0.016, opacity: 0.85 },
  hub: { radius: 0.3, intensity: 1.6 },
  /** Goal progress arc around the hub: space hue at 40%, kept below the bloom threshold. The faint full track shows the remainder. */
  goalArc: { radius: 0.62, width: 0.035, opacity: 0.4, trackOpacity: 0.12 },
  /** The decorative constellation tree over the loose orbs. Carries no meaning. */
  lines: { activeOpacity: 0.22, inactiveOpacity: 0.1, parentBoost: 1.2, childFade: 0.7 },
  /**
   * Dependency links. Always the space hue - a link is never a new colour. Direction is carried by
   * the static chevron and the brightness gradient; motion is reserved for "unlocked" and for the
   * one-shot unlock, so a locked link is perfectly still and costs nothing while the canvas idles.
   */
  chain: {
    /** Multipliers on the space hue at each end: bright at the blocker, fading toward the successor. */
    sourceBoost: 1.35,
    targetFade: 0.45,
    /** A locked link reads dimmer than the decorative tree, and never moves. */
    unlockedOpacity: 0.34,
    lockedOpacity: 0.14,
    /** Matches `zoneDisc.inactiveFactor`, so links recede with the rest of an inactive zone. */
    inactiveFactor: 0.4,
    /**
     * Direction chevron: the primary signal, and deliberately static. `NormalBlending`, not
     * additive - a bright additive triangle stacked on an additive line is what would cross
     * `EFFECTS.bloom.luminanceThreshold`. `boost` stays at or below `ring`'s known-safe 1.2.
     */
    chevron: { at: 0.62, size: 0.17, boost: 1.2, lockedBoost: 0.7 },
    /** Ambient-only flow dot on unlocked links. Small, additive, below the selection ring's boost. */
    flow: { size: 0.1, boost: 1.25, opacity: 0.5, seconds: 2.4 },
    /** The locked orb. Factors multiply the priority style; the rest are absolute targets. */
    locked: {
      /** Near-extinguished, never dead: at priority 3 this lands below priority 0's resting 0.8. */
      coreFactor: 0.18,
      /** Frosted *and* sealed - rougher and less transmissive than `completed`, which reads hollow. */
      roughness: 0.62,
      transmission: 0.55,
      /** Only slightly smaller: a lock must never be mistaken for low priority or completion. */
      radiusFactor: 0.92,
      /** Two crossing latitude bands in `ramp.dim`: a restraint, not a ring. Static. */
      cage: { radiusRatio: 1.06, opacity: 0.55, tilt: 0.55, breakScale: 2.2 },
      /** Multiplier on float amplitude and body spin. A locked orb barely drifts. */
      floatFactor: 0.25,
    },
    /** Unlock: the `MOTION.burst` machinery, retimed and sent along the link. */
    unlock: { seconds: 0.55, peakOpacity: 0.45, size: 0.22 },
  },
  /** Zone floor: radial-gradient disc plus a hairline boundary. */
  zoneDisc: { centerAlpha: 0.05, hairlineOpacity: 0.1, inactiveFactor: 0.4 },
  /** Category boundaries are dashed: dash count around the ellipse and the drawn share of each dash. */
  dashedBoundary: { dashes: 48, duty: 0.55 },
  /** Goal boundaries are doubled: the inner hairline's radius relative to the outer one. */
  doubleBoundary: { innerRatio: 0.965 },
  /** Project hubs are diamonds (octahedra); scale relative to the round hub so both read as the same size. */
  diamondHubScale: 1.35,
} as const;

/**
 * Shape identifies a space's kind, everywhere it appears (hub, zone boundary, label mark, sidebar dot);
 * hue still identifies the space itself.
 */
export const SPACE_KIND_STYLE: Record<SpaceKind, { hub: 'diamond' | 'orb'; boundary: 'solid' | 'double' | 'dashed' }> = {
  project: { hub: 'diamond', boundary: 'solid' },
  goal: { hub: 'orb', boundary: 'double' },
  category: { hub: 'orb', boundary: 'dashed' },
};

/** Spaces of one kind are laid out together as a cluster with its own title and outline. */
export const CLUSTER = {
  /** Empty space between neighbouring clusters, in zone cells. */
  gapCells: 0.55,
  /** Outline padding around the cluster's zones, world units. */
  padding: 2.4,
  /** Room above each zone for its title block, world units. */
  zoneTitleRoom: 2.2,
  cornerRadius: 3.5,
  outlineOpacity: 0.06,
  /** Cluster title sits this far above the outline, world units. */
  titleOffset: 1.4,
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

/** Each space is a constellation: tasks on a golden-angle spiral around a hub. */
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

/**
 * Dependency chains get their own layout track: loose tasks keep the golden-angle spiral, and each
 * chain winds around the hub as a necklace in the annulus just outside that spiral.
 *
 * Angle does nearly all the work and radius almost none, which is what keeps a chain compact. An
 * arm that marched straight outward would spike into one wedge, leaving the rest of the zone empty
 * and forcing the camera far enough back to shrink every orb. Winding instead fills the annulus
 * evenly, so a space holding a chain is barely larger than the same tasks laid out loose.
 */
export const CHAIN = {
  /**
   * Radial step between consecutive links. Small on purpose - just enough that after a full turn the
   * next lap clears the previous one. The exponent flattens long chains further.
   */
  stepRadius: 0.55,
  stepExponent: 0.72,
  /** Clearance between the loose spiral's outer edge and the first link of any arm. */
  bandClearance: 1.8,
  /**
   * Angular advance per step around the hub, radians: the main separation between consecutive links.
   * Narrowed automatically when a zone holds many chained tasks so they still fit in one turn, and
   * floored so a very wide fan stays legible rather than collapsing onto itself.
   */
  curl: 0.5,
  minCurl: 0.16,
  /** Empty angle left between the last step and the first, so a full turn does not close up. */
  armGuard: 0.3,
  /** Arms sit out of the spiral's plane, so an inner link never ambiguously overlaps a loose orb. */
  depthLift: 0.55,
  /** Share of the usual per-task z jitter an arm keeps; low, so a chain stays legible as a path. */
  depthJitterFactor: 0.4,
  /** Recursion and radius cap. Also the last line of defence against cyclic data. */
  maxDepth: 24,
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
  /** Zoom-out floor; the real limit grows with the universe so every space can always be seen at once. */
  maxDistance: 90,
  /** The zoom-out limit is this many times the distance that fits the whole universe in a square view. */
  overviewMargin: 1.25,
  /** Widest window aspect the background must cover at full zoom-out. */
  maxAspect: 2.4,
  /** Beyond this distance zone subtitles hide. */
  zoneDetailDistance: 60,
  /**
   * Inactive zone titles fade together as neighbouring zones close in on screen: gone when zone centres are
   * the first value apart in CSS pixels, fully shown at the second. Cluster titles take over below that.
   */
  zoneTitleSpacingPx: [130, 190] as [number, number],
  zoomPerWheelPixel: 0.0012,
  /** How far the camera sways with the mouse, for parallax. */
  pointerParallax: [1.1, 0.7] as [number, number],
  dragThresholdPx: 5,
  boundsMargin: 8,
  /**
   * Active-space labels are shown when the camera is closer than this.
   *
   * Sized against the distance it takes to frame one zone, not a fixed number: a space holding a
   * long chain is taller than one holding the same tasks loose, so the camera sits further back for
   * it, and these thresholds have to clear the largest single-zone framing or its labels never
   * appear. Well below the zoomed-out universe view, which is what they exist to suppress.
   */
  labelDistance: 32,
  /** All labels fade out with camera distance between these two (smoothstep). */
  labelFade: [26, 42] as [number, number],
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

/** Hex for a space's stored `colorIndex` (wraps past the end of the palette). */
export const spaceHue = (colorIndex: number): string =>
  PALETTE.spaceHues[((colorIndex % PALETTE.spaceHues.length) + PALETTE.spaceHues.length) % PALETTE.spaceHues.length];
