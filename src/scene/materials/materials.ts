import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LAYOUT, MATERIALS, PALETTE } from '../../contracts/tokens';
import type { Priority } from '../../contracts/task';

const G = MATERIALS.glass;

/** One physical glass material per card, so per-card state (completed, selected) can be animated. */
export function createGlassMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(G.color),
    transmission: G.transmission,
    roughness: G.roughness,
    thickness: G.thickness,
    ior: G.ior,
    clearcoat: G.clearcoat,
    clearcoatRoughness: G.clearcoatRoughness,
    metalness: G.metalness,
    attenuationColor: new THREE.Color(G.attenuationColor),
    attenuationDistance: G.attenuationDistance,
    envMapIntensity: G.envMapIntensity,
    emissive: new THREE.Color('#000000'),
  });
}

export interface GlassTarget {
  color: THREE.Color;
  attenuation: THREE.Color;
  roughness: number;
  transmission: number;
}

/** Priority and completion are expressed in the glass itself, not only in the accent bar. */
export function glassTarget(priority: Priority, completed: boolean, out: GlassTarget): GlassTarget {
  if (completed) {
    out.color.set(MATERIALS.glassCompleted.color);
    out.attenuation.set(G.attenuationColor);
    out.roughness = MATERIALS.glassCompleted.roughness;
    out.transmission = MATERIALS.glassCompleted.transmission;
    return out;
  }
  out.color.set(G.color);
  out.attenuation.set(G.attenuationColor);
  if (priority === 3) {
    out.color.set(MATERIALS.glassHighPriority.color);
    out.attenuation.set(MATERIALS.glassHighPriority.attenuationColor);
  } else if (priority === 2) {
    out.color.lerp(new THREE.Color(PALETTE.priority[2]), 0.12);
  }
  out.roughness = G.roughness;
  out.transmission = G.transmission;
  return out;
}

export function createAccentMaterial(color: string): THREE.MeshStandardMaterial {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: MATERIALS.accentBar.emissiveIntensity,
    toneMapped: false,
  });
}

export function createCardGeometry(width: number): THREE.BufferGeometry {
  const { height, depth, radius, segments } = LAYOUT.card;
  return new RoundedBoxGeometry(width, height, depth, segments, radius);
}

export function createAccentGeometry(): THREE.BufferGeometry {
  const { height, depth } = LAYOUT.card;
  return new THREE.BoxGeometry(LAYOUT.accentBar.width, height * 0.56, depth * 0.6);
}

let shadowTexture: THREE.Texture | null = null;

/** Soft radial blob generated on a canvas, no image file needed. */
export function getShadowTexture(): THREE.Texture {
  if (shadowTexture) return shadowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  shadowTexture = new THREE.CanvasTexture(canvas);
  return shadowTexture;
}
