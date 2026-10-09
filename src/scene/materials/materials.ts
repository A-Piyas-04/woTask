import * as THREE from 'three';
import { MATERIALS, PALETTE, RAMP, regionHue } from '../../contracts/tokens';

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

/** One region hue expanded into its roles. Derived at runtime so the palette is tuned in one place. */
export interface RegionRamp {
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

const rampCache = new Map<number, RegionRamp>();

export function regionRamp(colorIndex: number): RegionRamp {
  let r = rampCache.get(colorIndex);
  if (!r) {
    const base = regionHue(colorIndex);
    const completed = mixHex(base, RAMP.completed.target, RAMP.completed.amount);
    r = {
      base,
      core: mixHex(base, RAMP.core.target, RAMP.core.amount),
      dim: mixHex(base, RAMP.dim.target, RAMP.dim.amount),
      text: mixHex(base, RAMP.text.target, RAMP.text.amount),
      completed,
      glass: mixHex(base, PALETTE.white, 0.6),
      completedGlass: mixHex(completed, PALETTE.white, 0.5),
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

type SharedKind = 'sphere' | 'core' | 'ring' | 'highRing' | 'overdueRing' | 'burst' | 'hairline' | 'disc';

/** Unit geometries shared by every orb for the lifetime of the app. */
export function sharedGeometry(kind: SharedKind, segments: number): THREE.BufferGeometry {
  const key = `${kind}:${segments}`;
  let g = geometryCache.get(key);
  if (!g) {
    if (kind === 'sphere') g = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.75));
    else if (kind === 'core') g = new THREE.IcosahedronGeometry(1, 2);
    else if (kind === 'ring') g = new THREE.TorusGeometry(1, MATERIALS.ring.tube, 8, 128);
    else if (kind === 'highRing') g = new THREE.TorusGeometry(1, MATERIALS.highRing.tube, 6, 128);
    else if (kind === 'overdueRing') g = new THREE.TorusGeometry(1, MATERIALS.overdueRing.tube, 6, 128);
    else if (kind === 'hairline') g = new THREE.RingGeometry(0.997, 1, 192);
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

/** Soft cloud texture painted from many radial gradients. No image files. */
export function paintNebula(
  seed: number,
  colors: readonly string[],
  opts: { base?: [string, string]; blobs?: number; size?: [number, number]; alpha?: number; vignette?: number } = {},
): THREE.CanvasTexture {
  const [w, h] = opts.size ?? [1024, 768];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const rand = rng(seed);
  const alpha = opts.alpha ?? 1;
  if (ctx) {
    if (opts.base) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, opts.base[1]);
      grad.addColorStop(0.55, opts.base[0]);
      grad.addColorStop(1, opts.base[0]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
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
    if (opts.base && opts.vignette) {
      ctx.globalCompositeOperation = 'source-over';
      const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.6);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(0,0,0,${opts.vignette})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    }
    if (!opts.base) {
      // Fade edges to transparent so the plane's border never shows.
      ctx.globalCompositeOperation = 'destination-in';
      const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.55);
      edge.addColorStop(0, 'rgba(0,0,0,1)');
      edge.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, w, h);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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
