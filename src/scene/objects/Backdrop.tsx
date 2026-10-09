import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MATERIALS, PALETTE } from '../../contracts/tokens';

const PLANE = { width: 34, height: 21, z: -8 };
const TEX = { width: 1024, height: 640 };

/** Blob centres in 0..1 texture space, radius as a fraction of texture width. */
const BLOBS: { x: number; y: number; r: number; alpha: number }[] = [
  { x: 0.33, y: 0.3, r: 0.17, alpha: 0.95 },
  { x: 0.7, y: 0.62, r: 0.2, alpha: 0.85 },
  { x: 0.52, y: 0.18, r: 0.12, alpha: 0.7 },
  { x: 0.36, y: 0.74, r: 0.14, alpha: 0.75 },
];

function paintBackdrop(accent: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX.width;
  canvas.height = TEX.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = MATERIALS.backdrop.color;
    ctx.fillRect(0, 0, TEX.width, TEX.height);
    ctx.globalCompositeOperation = 'lighter';
    BLOBS.forEach((b, i) => {
      const color = new THREE.Color(i === 0 ? accent : PALETTE.orbs[i % PALETTE.orbs.length]);
      const rgb = `${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}`;
      const cx = b.x * TEX.width;
      const cy = b.y * TEX.height;
      const r = b.r * TEX.width;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${rgb}, ${b.alpha})`);
      g.addColorStop(0.45, `rgba(${rgb}, ${b.alpha * 0.45})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Soft glowing backdrop painted into a single opaque texture: one draw call, no image file,
 * and opaque so the glass cards' transmission pass can refract it.
 */
export function Backdrop({ accent }: { accent: string }) {
  const texture = useMemo(() => paintBackdrop(accent), [accent]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={[0, 0, PLANE.z]}>
      <planeGeometry args={[PLANE.width, PLANE.height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
