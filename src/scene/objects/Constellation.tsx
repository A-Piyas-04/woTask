import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { CAMERA, CONSTELLATION, MATERIALS, regionHue } from '../../contracts/tokens';
import { FRAME, pointerState, type PositionRegistry } from '../interaction';
import type { Zone } from '../layout';
import { createGlowMaterial, sharedGeometry } from '../materials/materials';

export interface ConstellationProps {
  zone: Zone;
  active: boolean;
  ambient: boolean;
  registry: PositionRegistry;
  labelLayer: RefObject<HTMLDivElement | null>;
  onSelectRegion(id: string): void;
}

const ORBIT_SEGMENTS = 160;

/** Hub, orbit ring and the light lines joining a region's tasks. Orbs are rendered separately. */
export function Constellation({ zone, active, ambient, registry, labelLayer, onSelectRegion }: ConstellationProps) {
  const { region, orbs, center } = zone;
  const color = regionHue(region.colorIndex);
  const hub = useRef<THREE.Mesh>(null);

  const hubMat = useMemo(() => createGlowMaterial(color, MATERIALS.hub.intensity), [color]);
  useEffect(() => () => hubMat.dispose(), [hubMat]);

  // One line per orb along the constellation tree, in a single draw call.
  const { edges } = zone;
  const lines = useMemo(() => {
    const segs = edges.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs * 6), 3));
    const colors = new Float32Array(segs * 6);
    const c = new THREE.Color(color);
    edges.forEach((parent, s) => {
      const k = parent === -1 ? MATERIALS.lines.chainOpacity * 1.4 : MATERIALS.lines.chainOpacity;
      for (let v = 0; v < 2; v++) {
        const fade = v === 0 ? 1.2 : 0.7;
        colors.set([c.r * k * fade, c.g * k * fade, c.b * k * fade], (s * 2 + v) * 3);
      }
    });
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    return new THREE.LineSegments(geo, mat);
  }, [edges, color]);
  useEffect(
    () => () => {
      lines.geometry.dispose();
      (lines.material as THREE.Material).dispose();
    },
    [lines],
  );

  const orbit = useMemo(() => {
    const pts: number[] = [];
    for (let i = 0; i < ORBIT_SEGMENTS; i++) {
      const a = (i / ORBIT_SEGMENTS) * Math.PI * 2;
      pts.push(Math.cos(a) * zone.radius, Math.sin(a) * (zone.radius / CONSTELLATION.ellipseX), -0.8);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineDashedMaterial({
      color: new THREE.Color(color).multiplyScalar(1.4),
      transparent: true,
      opacity: MATERIALS.orbit.opacity,
      dashSize: 0.35,
      gapSize: 0.25,
      depthWrite: false,
      toneMapped: false,
    });
    const loop = new THREE.LineLoop(geo, mat);
    loop.computeLineDistances();
    return loop;
  }, [zone.radius, color]);
  useEffect(
    () => () => {
      orbit.geometry.dispose();
      (orbit.material as THREE.Material).dispose();
    },
    [orbit],
  );

  useFrame((state, delta) => {
    const pos = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const [cx, cy, cz] = center;
    const at = (i: number): [number, number, number] => {
      const v = registry.get(orbs[i].task.id);
      return v ? [v.x, v.y, v.z] : orbs[i].rest;
    };
    for (let i = 0; i < edges.length && i < orbs.length; i++) {
      const parent = edges[i];
      const a: readonly number[] = parent === -1 ? [cx, cy, cz] : at(parent);
      const b = at(i);
      arr.set([a[0], a[1], a[2], b[0], b[1], b[2]], i * 6);
    }
    pos.needsUpdate = true;
    lines.geometry.computeBoundingSphere();

    if (ambient) {
      orbit.rotation.z += delta * (active ? 0.05 : 0.02);
      const h = hub.current;
      if (h) h.scale.setScalar(MATERIALS.hub.radius * (1 + Math.sin(state.clock.elapsedTime * 1.6) * 0.08));
    }
  }, FRAME.lines);

  const onHubClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!pointerState.dragged) onSelectRegion(region.id);
  };

  const remaining = orbs.filter((o) => o.task.completedAt === null).length;

  return (
    <group>
      <primitive object={lines} />
      <group position={center}>
        <primitive object={orbit} />
        <mesh
          ref={hub}
          geometry={sharedGeometry('core', 0)}
          material={hubMat}
          scale={MATERIALS.hub.radius}
          onClick={onHubClick}
          onPointerOver={() => {
            if (!pointerState.down) document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            if (!pointerState.down) document.body.style.cursor = '';
          }}
        />
        <Html
          center
          portal={labelLayer as RefObject<HTMLElement>}
          position={[0, zone.radius / CONSTELLATION.ellipseX + CONSTELLATION.zoneLabelOffset, 0]}
          distanceFactor={CAMERA.labelDistanceFactor}
          pointerEvents="none"
          zIndexRange={[10, 0]}
        >
          <div className={`zone-label${active ? ' is-active' : ''}`} style={{ ['--zone-color' as string]: color }}>
            <span className="zone-name" lang="bn-BD en">
              {region.name}
            </span>
            <span className="zone-count">{orbs.length === 0 ? 'empty — press N to add' : `${remaining} open · ${orbs.length - remaining} done`}</span>
          </div>
        </Html>
      </group>
    </group>
  );
}
