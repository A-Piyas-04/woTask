import * as THREE from 'three';
import { MATERIALS } from '../../contracts/tokens';

const G = MATERIALS.glass;

export function createGlassMaterial(tint: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(G.color),
    transmission: G.transmission,
    roughness: G.roughness,
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

/** Unlit, HDR-bright material so bloom picks it up as a glow. */
export function createGlowMaterial(color: string, intensity: number, opts: { transparent?: boolean } = {}): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    toneMapped: false,
    transparent: opts.transparent ?? false,
    depthWrite: !opts.transparent,
  });
  return m;
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

/** Unit geometries shared by every orb for the lifetime of the app. */
export function sharedGeometry(kind: 'sphere' | 'core' | 'ring' | 'burst', segments: number): THREE.BufferGeometry {
  const key = `${kind}:${segments}`;
  let g = geometryCache.get(key);
  if (!g) {
    if (kind === 'sphere') g = new THREE.SphereGeometry(1, segments, Math.round(segments * 0.75));
    else if (kind === 'core') g = new THREE.IcosahedronGeometry(1, 2);
    else if (kind === 'ring') g = new THREE.TorusGeometry(1, MATERIALS.ring.tube, 8, 96);
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
  return `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
};

/** Soft cloud texture painted from many radial gradients. No image files. */
export function paintNebula(seed: number, colors: readonly string[], opts: { base?: string; blobs?: number; size?: [number, number] } = {}): THREE.CanvasTexture {
  const [w, h] = opts.size ?? [1024, 768];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const rand = rng(seed);
  if (ctx) {
    if (opts.base) {
      ctx.fillStyle = opts.base;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'lighter';
    const blobs = opts.blobs ?? 26;
    for (let i = 0; i < blobs; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = (0.06 + rand() * 0.22) * w;
      const a = 0.05 + rand() * 0.16;
      const rgb = toRgb(colors[Math.floor(rand() * colors.length)]);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb}, ${a})`);
      g.addColorStop(0.5, `rgba(${rgb}, ${a * 0.4})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
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
