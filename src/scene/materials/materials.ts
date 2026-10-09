import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MATERIALS, RAMP, spaceHue } from '../../contracts/tokens';

const G = MATERIALS.glass;

/** sRGB mix of two hex colours (`t` = share of `b`), the way a designer's `mix()` reads. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  const ra = { r: 0, g: 0, b: 0 };
  const rb = { r: 0, g: 0, b: 0 };
  ca.getRGB(ra, THREE.SRGBColorSpace);
  cb.getRGB(rb, THREE.SRGBColorSpace);
  return `#${new THREE.Color()
    .setRGB(ra.r + (rb.r - ra.r) * t, ra.g + (rb.g - ra.g) * t, ra.b + (rb.b - ra.b) * t, THREE.SRGBColorSpace)
    .getHexString()}`;
}

/** One space hue expanded into its roles. Derived at runtime so the palette is tuned in one place. */
export interface SpaceRamp {
  base: string;
  core: string;
  dim: string;
  text: string;
  /** Desaturated toward neutral, for completed spheres. */
  completed: string;
  /** Light body tint for the glass's diffuse share. */
  glass: string;
  completedGlass: string;
}

const rampCache = new Map<number, SpaceRamp>();

export function spaceRamp(colorIndex: number): SpaceRamp {
  let r = rampCache.get(colorIndex);
  if (!r) {
    const base = spaceHue(colorIndex);
    const completed = mixHex(base, RAMP.completed.target, RAMP.completed.amount);
    r = {
      base,
      core: mixHex(base, RAMP.core.target, RAMP.core.amount),
      dim: mixHex(base, RAMP.dim.target, RAMP.dim.amount),
      text: mixHex(base, RAMP.text.target, RAMP.text.amount),
      completed,
      glass: mixHex(base, RAMP.glass.target, RAMP.glass.amount),
      completedGlass: mixHex(completed, RAMP.completedGlass.target, RAMP.completedGlass.amount),
    };
    rampCache.set(colorIndex, r);
  }
  return r;
}

export function createGlassMaterial(tint: string, body: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(body),
    transmission: 1,
    roughness: 0.1,
    thickness: G.thickness,
    ior: G.ior,
    clearcoat: G.clearcoat,
    clearcoatRoughness: G.clearcoatRoughness,
    iridescence: G.iridescence,
    iridescenceIOR: G.iridescenceIOR,
    iridescenceThicknessRange: [...G.iridescenceThicknessRange],
    attenuationColor: new THREE.Color(tint),
    attenuationDistance: G.attenuationDistance,
    envMapIntensity: G.envMapIntensity,
  });
}

/**
 * Unlit emissive-style material. Intensities above 1 feed bloom; tone mapping (ACES, applied once at
 * the end of the post chain, or by the renderer on Low quality) keeps them from clipping to white.
 */
export function createGlowMaterial(
  color: string,
  intensity: number,
  opts: { transparent?: boolean; additive?: boolean } = {},
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    transparent: opts.transparent ?? false,
    depthWrite: !opts.transparent,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

type SharedKind =
  | 'sphere'
  | 'core'
  | 'diamond'
  | 'ring'
  | 'highRing'
  | 'overdueRing'
  | 'burst'
  | 'hairline'
  | 'hairlineDashed'
  | 'hairlineDouble'
  | 'chevron'
  | 'disc';

const HAIRLINE_INNER = 0.997;

function dashedRing(): THREE.BufferGeometry {
  const { dashes, duty } = MATERIALS.dashedBoundary;
  const step = (Math.PI * 2) / dashes;
  return mergeGeometries(Array.from({ length: dashes }, (_, i) => new THREE.RingGeometry(HAIRLINE_INNER, 1, 4, 1, i * step, step * duty)));
}

/**
 * Unit triangle in XY pointing along +X: the chain link's direction marker.
 *
 * Flat in the zone plane rather than billboarded, because the camera only pans and zooms - it never
 * orbits - so XY is always close to face-on. That keeps the chevron a single static matrix write
 * instead of a per-frame camera-facing recomputation.
 */
function chevron(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([1, 0, 0, -0.75, 0.8, 0, -0.75, -0.8, 0]), 3));
  g.setIndex([0, 1, 2]);
  return g;
}

function doubleRing(): THREE.BufferGeometry {
  const k = MATERIALS.doubleBoundary.innerRatio;
  return mergeGeometries([new THREE.RingGeometry(HAIRLINE_INNER, 1, 192), new THREE.RingGeometry(HAIRLINE_INNER * k, k, 192)]);
}

/** Unit geometries shared by every orb for the lifetime of the app. */
export function sharedGeometry(kind: SharedKind, segments: number): THREE.BufferGeometry {
  const key = `${kind}:${segments}`;
  let g = geometryCache.get(key);
  if (!g) {
    if (kind === 'sphere') g = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.75));
    else if (kind === 'core') g = new THREE.IcosahedronGeometry(1, 2);
    else if (kind === 'diamond') g = new THREE.OctahedronGeometry(1, 0);
    else if (kind === 'ring') g = new THREE.TorusGeometry(1, MATERIALS.ring.tube, 8, 128);
    else if (kind === 'highRing') g = new THREE.TorusGeometry(1, MATERIALS.highRing.tube, 6, 128);
    else if (kind === 'overdueRing') g = new THREE.TorusGeometry(1, MATERIALS.overdueRing.tube, 6, 128);
    else if (kind === 'hairline') g = new THREE.RingGeometry(HAIRLINE_INNER, 1, 192);
    else if (kind === 'hairlineDashed') g = dashedRing();
    else if (kind === 'hairlineDouble') g = doubleRing();
    else if (kind === 'chevron') g = chevron();
    else if (kind === 'disc') g = new THREE.CircleGeometry(1, 96);
    else g = new THREE.RingGeometry(0.96, 1, 96);
    geometryCache.set(key, g);
  }
  return g;
}

/** Mulberry32 seeded RNG so procedural textures are identical on every launch. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toRgb = (hex: string): string => {
  const c = new THREE.Color(hex);
  const o = { r: 0, g: 0, b: 0 };
  c.getRGB(o, THREE.SRGBColorSpace);
  return `${Math.round(o.r * 255)}, ${Math.round(o.g * 255)}, ${Math.round(o.b * 255)}`;
};

/** Soft transparent cloud layer painted from many radial gradients. No image files. */
export function paintNebula(
  seed: number,
  colors: readonly string[],
  opts: { blobs?: number; size?: [number, number]; alpha?: number } = {},
): THREE.CanvasTexture {
  const [w, h] = opts.size ?? [1024, 768];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const rand = rng(seed);
  const alpha = opts.alpha ?? 1;
  if (ctx) {
    ctx.globalCompositeOperation = 'lighter';
    const blobs = opts.blobs ?? 26;
    for (let i = 0; i < blobs; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = (0.08 + rand() * 0.24) * w;
      const a = (0.25 + rand() * 0.75) * alpha;
      const rgb = toRgb(colors[Math.floor(rand() * colors.length)]);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb}, ${a})`);
      g.addColorStop(0.5, `rgba(${rgb}, ${a * 0.4})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Fade edges to transparent so the plane's border never shows.
    ctx.globalCompositeOperation = 'destination-in';
    const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.55);
    edge.addColorStop(0, 'rgba(0,0,0,1)');
    edge.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Opaque backdrop: vertical gradient, additive soft blobs and a vignette, computed in JS into a
 * half-float linear texture. Canvas 2D dithers its gradients, and that ordered pattern shows up as
 * a fine grid once the backdrop is magnified across the screen.
 */
export function paintBackdrop(
  seed: number,
  colors: readonly string[],
  opts: { base: [string, string]; blobs: number; size: [number, number]; alpha: number; vignette: number },
): THREE.DataTexture {
  const [w, h] = opts.size;
  const rand = rng(seed);
  const srgb = (hex: string): [number, number, number] => {
    const o = { r: 0, g: 0, b: 0 };
    new THREE.Color(hex).getRGB(o, THREE.SRGBColorSpace);
    return [o.r, o.g, o.b];
  };
  const bottom = srgb(opts.base[0]);
  const top = srgb(opts.base[1]);
  const blobs = Array.from({ length: opts.blobs }, () => {
    const x = rand() * w;
    const y = rand() * h;
    const r = (0.08 + rand() * 0.24) * w;
    const a = (0.25 + rand() * 0.75) * opts.alpha;
    return { x, y, r, a, c: srgb(colors[Math.floor(rand() * colors.length)]) };
  });
  const v0 = Math.min(w, h) * 0.25;
  const v1 = Math.max(w, h) * 0.6;
  const data = new Uint16Array(w * h * 4);
  const px = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    // Row 0 of a DataTexture is the bottom; `y` here is measured from the top like the canvas version.
    const row = (h - 1 - y) * w;
    const t = Math.min(1, y / (h * 0.55));
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) px[k] = top[k] + (bottom[k] - top[k]) * t;
      for (const b of blobs) {
        const d = Math.hypot(x - b.x, y - b.y) / b.r;
        if (d >= 1) continue;
        const f = d < 0.5 ? 1 - 1.2 * d : 0.8 * (1 - d);
        for (let k = 0; k < 3; k++) px[k] += b.c[k] * b.a * f;
      }
      const dv = Math.hypot(x - w / 2, y - h / 2);
      const vig = 1 - opts.vignette * THREE.MathUtils.clamp((dv - v0) / (v1 - v0), 0, 1);
      const i = (row + x) * 4;
      for (let k = 0; k < 3; k++) data[i + k] = THREE.DataUtils.toHalfFloat(THREE.MathUtils.clamp(srgbToLinear(px[k] * vig), 0, 1));
      data[i + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

let dotTexture: THREE.Texture | null = null;

/** Round soft point sprite for stars and dust. */
export function getDotTexture(): THREE.Texture {
  if (dotTexture) return dotTexture;
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  dotTexture = new THREE.CanvasTexture(canvas);
  return dotTexture;
}

let discTexture: THREE.Texture | null = null;

/** White radial falloff (alpha 1 at the centre, 0 at the rim) for the zone floor disc. */
export function getDiscTexture(): THREE.Texture {
  if (discTexture) return discTexture;
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  discTexture = new THREE.CanvasTexture(canvas);
  return discTexture;
}
