import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PALETTE, PARALLAX as P } from '../../contracts/tokens';
import { getDotTexture, mixHex, paintNebula, rng } from '../materials/materials';

interface Props {
  center: [number, number];
  /** Active region hue; contributes at most `PALETTE.background.nebulaTint` to the nebula. */
  tint: string | null;
  stars: number;
  ambient: boolean;
}

function makePoints(
  count: number,
  seed: number,
  spread: readonly [number, number],
  zRange: readonly [number, number],
  size: number,
  colors: readonly string[],
  brightness: readonly [number, number],
) {
  const rand = rng(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * spread[0];
    pos[i * 3 + 1] = (rand() - 0.5) * spread[1];
    pos[i * 3 + 2] = zRange[0] + rand() * (zRange[1] - zRange[0]);
    const b = brightness[0] + Math.pow(rand(), 2) * (brightness[1] - brightness[0]);
    c.set(colors[Math.floor(rand() * colors.length)]).multiplyScalar(b);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size,
    map: getDotTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

function disposeObject(o: THREE.Mesh | THREE.Points) {
  o.geometry.dispose();
  const m = o.material as THREE.Material & { map?: THREE.Texture | null };
  if (m.map && m.map !== getDotTexture()) m.map.dispose();
  m.dispose();
}

/**
 * Neutral deep field with a hint of the active region's hue. Layers sit at very different depths, so
 * panning produces real parallax: near dust slides past quickly, far layers barely move.
 */
export function ParallaxBackground({ center, tint, stars, ambient }: Props) {
  const dust = useRef<THREE.Points>(null);
  const bg = PALETTE.background;

  const nebulaColors = useMemo(() => (tint ? bg.nebula.map((n) => mixHex(n, tint, bg.nebulaTint)) : [...bg.nebula]), [tint, bg]);

  const backdrop = useMemo(() => {
    const tex = paintNebula(3, nebulaColors, {
      base: [bg.base, bg.gradientTop],
      blobs: 30,
      size: [1024, 768],
      alpha: bg.nebulaAlpha * 2.5,
      vignette: bg.vignette,
    });
    // Opaque so the glass spheres' transmission pass can refract it.
    const m = new THREE.Mesh(new THREE.PlaneGeometry(...P.backdrop.size), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.z = P.backdrop.z;
    return m;
  }, [nebulaColors, bg]);

  const nebulae = useMemo(
    () =>
      P.nebula.map((n) => {
        const tex = paintNebula(n.seed, nebulaColors, { blobs: 20, alpha: bg.nebulaAlpha });
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(...n.size),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        );
        m.position.z = n.z;
        return m;
      }),
    [nebulaColors, bg],
  );

  const starField = useMemo(() => makePoints(stars, 101, P.stars.spread, P.stars.zRange, P.stars.size, PALETTE.stars, PALETTE.starOpacity), [stars]);
  const dustField = useMemo(
    () => makePoints(P.dust.count, 202, P.dust.spread, P.dust.zRange, P.dust.size, PALETTE.stars, [0.1, P.dust.opacity]),
    [],
  );

  useEffect(() => () => disposeObject(backdrop), [backdrop]);
  useEffect(() => () => nebulae.forEach(disposeObject), [nebulae]);
  useEffect(() => () => disposeObject(starField), [starField]);
  useEffect(() => () => disposeObject(dustField), [dustField]);

  useFrame((_, delta) => {
    if (!ambient) return;
    const d = dust.current;
    if (d) {
      d.rotation.z += delta * P.dust.drift;
      d.position.y += Math.sin(performance.now() / 4000) * delta * 0.05;
    }
    nebulae.forEach((n, i) => {
      n.rotation.z += delta * (i === 0 ? 0.0025 : -0.004);
    });
  });

  return (
    <group position={[center[0], center[1], 0]}>
      <primitive object={backdrop} />
      {nebulae.map((n, i) => (
        <primitive key={i} object={n} />
      ))}
      <primitive object={starField} />
      <primitive ref={dust} object={dustField} />
    </group>
  );
}
