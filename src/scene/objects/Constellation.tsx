import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { SPACE_KIND_LABELS } from '../../contracts/task';
import { CAMERA, CONSTELLATION, MATERIALS, SPACE_KIND_STYLE } from '../../contracts/tokens';
import { FRAME, pointerState, sceneSeconds, type PositionRegistry } from '../interaction';
import type { Zone } from '../layout';
import { createGlowMaterial, getDiscTexture, getDotTexture, sharedGeometry, type SpaceRamp } from '../materials/materials';

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
  reducedMotion: boolean;
  onSelectSpace(id: string): void;
}

const DAY = 86_400_000;

const BOUNDARY_GEOMETRY = { solid: 'hairline', double: 'hairlineDouble', dashed: 'hairlineDashed' } as const;

const FOV_TAN = Math.tan((CAMERA.fov * Math.PI) / 360);

const Z_AXIS = new THREE.Vector3(0, 0, 1);

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
  if (stats.open === 0) return total === 1 ? 'done' : 'all done';
  return `${stats.open} open · ${stats.done} done`;
}

/** Floor disc, hairline boundary, hub, goal arc and the light lines joining a space's tasks. Orbs are rendered separately. */
export function Constellation({
  zone,
  ramp,
  stats,
  active,
  ambient,
  spacing,
  registry,
  labelLayer,
  reducedMotion,
  onSelectSpace,
}: ConstellationProps) {
  const { space, orbs, center, edges, links } = zone;
  const invalidate = useThree((s) => s.invalidate);
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

  /**
   * Everything needed to draw this zone's dependency links: one `LineSegments`, one `InstancedMesh`
   * of chevrons, and two `Points` buffers (the ambient flow dot and the one-shot unlock travel).
   * Three draw calls per zone regardless of how many links there are.
   */
  const chain = useMemo(() => {
    const n = Math.max(1, links.length);
    const { chain: C } = MATERIALS;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    // The gradient runs bright at the blocker and fades toward the successor: the energy has
    // reached the blocker, it has not yet reached you. Locked links are dimmed here rather than by
    // a second material, so the whole set stays one draw call.
    const colors = new Float32Array(n * 6);
    const base = new THREE.Color(ramp.base);
    for (let i = 0; i < links.length; i++) {
      const lock = links[i].locked ? C.lockedOpacity / C.unlockedOpacity : 1;
      for (let v = 0; v < 2; v++) {
        const k = (v === 0 ? C.sourceBoost : C.targetFade) * lock;
        colors.set([base.r * k, base.g * k, base.b * k], (i * 2 + v) * 3);
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const chainLines = new THREE.LineSegments(geo, lineMat);

    // NormalBlending, not additive: a bright additive triangle stacked on an additive line is what
    // would push the chevron over `EFFECTS.bloom.luminanceThreshold`.
    // `instanceColor` multiplies `material.color`, so the material stays white and each instance
    // carries its own hue. Setting `vertexColors` here instead would read a geometry colour
    // attribute that does not exist, and every chevron would render black.
    const chevMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const chevrons = new THREE.InstancedMesh(sharedGeometry('chevron', 0), chevMat, n);
    chevrons.frustumCulled = false;
    const chevColors = new Float32Array(n * 3);
    for (let i = 0; i < links.length; i++) {
      const k = links[i].locked ? C.chevron.lockedBoost : C.chevron.boost;
      chevColors.set([base.r * k, base.g * k, base.b * k], i * 3);
    }
    chevrons.instanceColor = new THREE.InstancedBufferAttribute(chevColors, 3);

    const dots = (size: number): THREE.Points => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const m = new THREE.PointsMaterial({
        size,
        map: getDotTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false;
      return pts;
    };

    return {
      lines: chainLines,
      chevrons,
      flow: dots(C.flow.size),
      unlock: dots(C.unlock.size),
      flowColor: new THREE.Color(ramp.base).multiplyScalar(C.flow.boost),
      /** Successor task id -> start time in scene seconds. `-1` means "seed on the next frame". */
      runs: new Map<string, number>(),
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3().setScalar(C.chevron.size),
    };
  }, [links, ramp.base]);

  useEffect(
    () => () => {
      chain.lines.geometry.dispose();
      (chain.lines.material as THREE.Material).dispose();
      chain.chevrons.dispose();
      (chain.chevrons.material as THREE.Material).dispose();
      for (const pts of [chain.flow, chain.unlock]) {
        pts.geometry.dispose();
        (pts.material as THREE.Material).dispose();
      }
    },
    [chain],
  );

  useEffect(() => {
    const f = active ? 1 : MATERIALS.chain.inactiveFactor;
    (chain.lines.material as THREE.LineBasicMaterial).opacity = MATERIALS.chain.unlockedOpacity * f;
    (chain.chevrons.material as THREE.MeshBasicMaterial).opacity = f;
    (chain.flow.material as THREE.PointsMaterial).opacity = MATERIALS.chain.flow.opacity * f;
    (chain.unlock.material as THREE.PointsMaterial).opacity = f;
  }, [active, chain]);

  /**
   * Fires the unlock travel when a blocker is completed.
   *
   * `unlockToken` is the blocker's `completedAt`, so it changes exactly once, at the moment of
   * release, and is stable across reloads. Keyed by successor id rather than link index so a layout
   * reorder cannot misattribute a run. The `prev === null` guard means a fresh mount never animates
   * links that were already satisfied when the app started.
   */
  const prevTokens = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    const tokens = new Map(links.map((l) => [zone.orbs[l.to].task.id, l.unlockToken]));
    const prev = prevTokens.current;
    prevTokens.current = tokens;
    if (prev === null || reducedMotion) return;
    let fired = false;
    for (const [id, token] of tokens) {
      const was = prev.get(id);
      if (was !== undefined && was !== token && token !== 0) {
        chain.runs.set(id, -1);
        fired = true;
      }
    }
    if (fired) invalidate();
  }, [links, zone.orbs, chain, reducedMotion, invalidate]);

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
    for (let i = 0; i < edges.length; i++) {
      const { child, parent } = edges[i];
      const a: readonly number[] = parent === -1 ? [cx, cy, cz] : at(parent);
      const b = at(child);
      arr.set([a[0], a[1], a[2], b[0], b[1], b[2]], i * 6);
    }
    pos.needsUpdate = true;
    lines.geometry.computeBoundingSphere();

    // ---- dependency links ----------------------------------------------------------------------
    let busy = false;
    if (links.length > 0) {
      const { chain: C } = MATERIALS;
      const t = sceneSeconds();
      const lp = chain.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
      const la = lp.array as Float32Array;
      const fp = chain.flow.geometry.getAttribute('color') as THREE.BufferAttribute;
      const fxyz = chain.flow.geometry.getAttribute('position') as THREE.BufferAttribute;
      const uc = chain.unlock.geometry.getAttribute('color') as THREE.BufferAttribute;
      const uxyz = chain.unlock.geometry.getAttribute('position') as THREE.BufferAttribute;
      const col = chain.flowColor;

      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const a = at(link.from);
        const b = at(link.to);
        la.set([a[0], a[1], a[2], b[0], b[1], b[2]], i * 6);

        // The chevron is static. It is written here only because the orbs it spans are floating,
        // never because of an animation of its own - so it costs nothing while the canvas idles.
        const k = C.chevron.at;
        chain.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
        chain.quaternion.setFromAxisAngle(Z_AXIS, Math.atan2(b[1] - a[1], b[0] - a[0]));
        chain.matrix.compose(chain.position, chain.quaternion, chain.scale);
        chain.chevrons.setMatrixAt(i, chain.matrix);

        // A locked link never moves: the stillness is the "gate closed" read, and it keeps the GPU
        // asleep. Black under additive blending contributes nothing, so an idle slot costs no pixels.
        if (ambient && !reducedMotion && !link.locked) {
          const u = (t / C.flow.seconds + i * 0.37) % 1;
          fxyz.setXYZ(i, a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
          const fade = Math.sin(u * Math.PI);
          fp.setXYZ(i, col.r * fade, col.g * fade, col.b * fade);
        } else {
          fp.setXYZ(i, 0, 0, 0);
        }

        const toId = orbs[link.to].task.id;
        const run = chain.runs.get(toId);
        if (run === undefined) {
          uc.setXYZ(i, 0, 0, 0);
          continue;
        }
        const started = run < 0 ? t : run;
        if (run < 0) chain.runs.set(toId, t);
        const u = (t - started) / C.unlock.seconds;
        if (u >= 1) {
          chain.runs.delete(toId);
          uc.setXYZ(i, 0, 0, 0);
        } else {
          const e = 1 - (1 - u) ** 3;
          const fade = (1 - u) * C.unlock.peakOpacity;
          uxyz.setXYZ(i, a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e);
          uc.setXYZ(i, col.r * fade, col.g * fade, col.b * fade);
          busy = true;
        }
      }

      lp.needsUpdate = true;
      fxyz.needsUpdate = true;
      fp.needsUpdate = true;
      uxyz.needsUpdate = true;
      uc.needsUpdate = true;
      chain.chevrons.instanceMatrix.needsUpdate = true;
      chain.lines.geometry.computeBoundingSphere();
    }
    // Ambient motion already drives a continuous loop; this is for a one-shot that fires while idle.
    if (busy) state.invalidate();

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
      {links.length > 0 && (
        <>
          <primitive object={chain.lines} />
          <primitive object={chain.chevrons} />
          <primitive object={chain.flow} />
          <primitive object={chain.unlock} />
        </>
      )}
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
