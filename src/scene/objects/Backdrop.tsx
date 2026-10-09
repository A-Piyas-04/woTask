import { useMemo } from 'react';
import * as THREE from 'three';
import { MATERIALS, PALETTE } from '../../contracts/tokens';

const ORBS: { position: [number, number, number]; radius: number; strength: number }[] = [
  { position: [-3.6, 2.2, -5], radius: 1.7, strength: 1.6 },
  { position: [3.8, -1.6, -6], radius: 2.2, strength: 1.4 },
  { position: [0.6, 3.6, -7], radius: 1.4, strength: 1.2 },
  { position: [-2.4, -3.4, -5.5], radius: 1.6, strength: 1.3 },
];

/** Glowing shapes behind the cards: they give the glass something to refract and the bloom something to catch. */
export function Backdrop({ accent }: { accent: string }) {
  const orbColors = useMemo(
    () =>
      ORBS.map((o, i) => {
        const base = new THREE.Color(i === 0 ? accent : PALETTE.orbs[i % PALETTE.orbs.length]);
        return base.multiplyScalar(o.strength);
      }),
    [accent],
  );

  return (
    <group>
      <mesh position={[0, 0, -9]}>
        <planeGeometry args={[60, 40]} />
        <meshStandardMaterial color={MATERIALS.backdrop.color} roughness={MATERIALS.backdrop.roughness} />
      </mesh>
      {ORBS.map((o, i) => (
        <mesh key={i} position={o.position}>
          <sphereGeometry args={[o.radius, 32, 32]} />
          <meshBasicMaterial color={orbColors[i]} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
