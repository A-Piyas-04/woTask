import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { SPACE_KIND_LABELS } from '../../contracts/task';
import { CAMERA, CONSTELLATION, MATERIALS, SPACE_KIND_STYLE } from '../../contracts/tokens';
import { FRAME, pointerState, sceneSeconds, type PositionRegistry } from '../interaction';
import type { Zone } from '../layout';
import { createGlowMaterial, getDiscTexture, sharedGeometry, type SpaceRamp } from '../materials/materials';

export interface SpaceStats {
  open: number;
  done: number;
}

export interface ConstellationProps {
  zone: Zone;
  ramp: SpaceRamp;
  stats: SpaceStats;
  active: boolean;
  ambient: boolean;
  /** Horizontal distance to the neighbouring zone centre, world units. */
  spacing: number;
  registry: PositionRegistry;
  labelLayer: RefObject<HTMLDivElement | null>;
  onSelectSpace(id: string): void;
}

const DAY = 86_400_000;

const BOUNDARY_GEOMETRY = { solid: 'hairline', double: 'hairlineDouble', dashed: 'hairlineDashed' } as const;

const FOV_TAN = Math.tan((CAMERA.fov * Math.PI) / 360);

/** Zone title detail: subtitle only up close; the name fades once neighbouring zones crowd together on screen. */
function zoneLabelFade(distance: number, heightPx: number, spacing: number): { detail: boolean; fade: number } {
  const spacingPx = (spacing * heightPx) / (2 * FOV_TAN * distance);
  const [a, b] = CAMERA.zoneTitleSpacingPx;
  const t = THREE.MathUtils.clamp((spacingPx - a) / (b - a), 0, 1);
  return { detail: distance < CAMERA.zoneDetailDistance, fade: Math.round(t * t * (3 - 2 * t) * 20) / 20 };
}

function subtitle(zone: Zone, stats: SpaceStats): string {
  const total = stats.open + stats.done;
  const { space } = zone;
  if (space.kind === 'goal') {
    const parts = [`${stats.done} of ${total} complete`];
    if (space.targetDate !== null) {
      const days = Math.ceil((space.targetDate - Date.now()) / DAY);
      parts.push(days > 1 ? `${days} days left` : days === 1 ? '1 day left' : days === 0 ? 'due today' : `${-days} days past target`);
    }
    return parts.join(' · ');
  }
  if (total === 0) return 'empty — press N to add';
  return `${stats.open} open · ${stats.done} done`;
}

/** Floor disc, hairline boundary, hub, goal arc and the light lines joining a space's tasks. Orbs are rendered separately. */
export function Constellation({ zone, ramp, stats, active, ambient, spacing, registry, labelLayer, onSelectSpace }: ConstellationProps) {
  const { space, orbs, center, edges } = zone;
  const hub = useRef<THREE.Mesh>(null);
  const [labelEl, setLabelEl] = useState<HTMLDivElement | null>(null);
  const labelState = useRef({ detail: true, fade: 1 });
  useEffect(() => {
    labelState.current = { detail: true, fade: 1 };
  }, [labelEl]);
  const ry = zone.radius / CONSTELLATION.ellipseX;
  const kindStyle = SPACE_KIND_STYLE[space.kind];
  const hubRadius = MATERIALS.hub.radius * (kindStyle.hub === 'diamond' ? MATERIALS.diamondHubScale : 1);

  const hubMat = useMemo(() => createGlowMaterial(ramp.base, MATERIALS.hub.intensity), [ramp.base]);
  useEffect(() => () => hubMat.dispose(), [hubMat]);

  // One line per orb along the constellation tree, in a single draw call; brighter at the parent end.
  const lines = useMemo(() => {
    const segs = edges.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs * 6), 3));
    const colors = new Float32Array(segs * 6);
    const c = new THREE.Color(ramp.base);
    for (let s = 0; s < segs; s++) {
      for (let v = 0; v < 2; v++) {
        const k = v === 0 ? MATERIALS.lines.parentBoost : MATERIALS.lines.childFade;
        colors.set([c.r * k, c.g * k, c.b * k], (s * 2 + v) * 3);
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return new THREE.LineSegments(geo, mat);
  }, [edges, ramp.base]);
  useEffect(
    () => () => {
      lines.geometry.dispose();
      (lines.material as THREE.Material).dispose();
    },
    [lines],
  );

  const { discMat, hairMat } = useMemo(
    () => ({
      discMat: new THREE.MeshBasicMaterial({ map: getDiscTexture(), transparent: true, depthWrite: false }),
      hairMat: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
    }),
    [],
  );
  useEffect(
    () => () => {
      discMat.dispose();
      hairMat.dispose();
    },
    [discMat, hairMat],
  );

  useEffect(() => {
    const f = active ? 1 : MATERIALS.zoneDisc.inactiveFactor;
    (lines.material as THREE.LineBasicMaterial).opacity = active ? MATERIALS.lines.activeOpacity : MATERIALS.lines.inactiveOpacity;
    discMat.color.set(ramp.base);
    discMat.opacity = MATERIALS.zoneDisc.centerAlpha * f;
    hairMat.color.set(active ? ramp.base : ramp.dim);
    hairMat.opacity = MATERIALS.zoneDisc.hairlineOpacity * f;
  }, [active, lines, discMat, hairMat, ramp]);

  const total = stats.open + stats.done;
  const ratio = total === 0 ? 0 : stats.done / total;
  const arc = useMemo(() => {
    if (space.kind !== 'goal' || ratio <= 0) return null;
    const { radius, width } = MATERIALS.goalArc;
    const length = Math.max(0.0001, ratio) * Math.PI * 2;
    // Fills clockwise from 12 o'clock.
    return new THREE.RingGeometry(radius - width / 2, radius + width / 2, 96, 1, Math.PI / 2 - length, length);
  }, [space.kind, ratio]);
  useEffect(() => () => arc?.dispose(), [arc]);
  const track = useMemo(() => {
    if (space.kind !== 'goal') return null;
    const { radius, width } = MATERIALS.goalArc;
    return new THREE.RingGeometry(radius - width / 2, radius + width / 2, 96);
  }, [space.kind]);
  useEffect(() => () => track?.dispose(), [track]);
  const { arcMat, trackMat } = useMemo(
    () => ({
      arcMat: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: MATERIALS.goalArc.opacity }),
      trackMat: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: MATERIALS.goalArc.trackOpacity }),
    }),
    [],
  );
  useEffect(() => {
    arcMat.color.set(ramp.base);
    trackMat.color.set(ramp.base);
  }, [arcMat, trackMat, ramp.base]);
  useEffect(
    () => () => {
      arcMat.dispose();
      trackMat.dispose();
    },
    [arcMat, trackMat],
  );

  useFrame((state) => {
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

    const h = hub.current;
    if (h && ambient) h.scale.setScalar(hubRadius * (1 + Math.sin(sceneSeconds() * 1.2) * 0.05));
    if (h && kindStyle.hub === 'diamond' && ambient) h.rotation.y = sceneSeconds() * 0.4;

    const el = labelEl;
    if (el) {
      const next = zoneLabelFade(state.camera.position.z, state.size.height, spacing);
      const prev = labelState.current;
      if (next.detail !== prev.detail) el.dataset.detail = next.detail ? 'full' : 'name';
      if (next.fade !== prev.fade) el.style.setProperty('--zone-fade', String(next.fade));
      labelState.current = next;
    }
  }, FRAME.lines);

  const onHubClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!pointerState.dragged) onSelectSpace(space.id);
  };

  return (
    <group>
      <primitive object={lines} />
      <group position={center}>
        <mesh geometry={sharedGeometry('disc', 0)} material={discMat} scale={[zone.radius, ry, 1]} position-z={-0.9} raycast={() => null} />
        <mesh
          geometry={sharedGeometry(BOUNDARY_GEOMETRY[kindStyle.boundary], 0)}
          material={hairMat}
          scale={[zone.radius, ry, 1]}
          position-z={-0.88}
          raycast={() => null}
        />
        {track && <mesh geometry={track} material={trackMat} raycast={() => null} />}
        {arc && <mesh geometry={arc} material={arcMat} raycast={() => null} />}
        <mesh
          ref={hub}
          geometry={sharedGeometry(kindStyle.hub === 'diamond' ? 'diamond' : 'core', 0)}
          material={hubMat}
          scale={hubRadius}
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
          position={[0, ry + CONSTELLATION.zoneLabelOffset, 0]}
          pointerEvents="none"
          zIndexRange={[10, 0]}
        >
          <div
            ref={setLabelEl}
            className={`zone-label${active ? ' is-active' : ''}`}
            data-kind={space.kind}
            data-detail="full"
            style={{ ['--zone-text' as string]: ramp.text }}
          >
            <span className="zone-name" lang="bn-BD en">
              <span className="kind-mark" data-kind={space.kind} title={SPACE_KIND_LABELS[space.kind]} />
              {space.name}
            </span>
            <span className="zone-count">{subtitle(zone, stats)}</span>
          </div>
        </Html>
      </group>
    </group>
  );
}
