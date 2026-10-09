import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { easing } from 'maath';
import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { CONSTELLATION, MATERIALS, MOTION, PALETTE } from '../../contracts/tokens';
import { FRAME, pointerState, type PositionRegistry } from '../interaction';
import { useLabelEntry, type LabelRegistry } from '../labels';
import type { OrbPlacement } from '../layout';
import { createGlassMaterial, createGlowMaterial, sharedGeometry, type RegionRamp } from '../materials/materials';
import { formatDue } from './labelFormat';

export interface TaskOrbProps {
  orb: OrbPlacement;
  selected: boolean;
  ramp: RegionRamp;
  ambient: boolean;
  reducedMotion: boolean;
  segments: number;
  /** In the active region. Other orbs only mount a label when important, selected or hovered. */
  labelEligible: boolean;
  registry: PositionRegistry;
  labels: LabelRegistry;
  labelLayer: RefObject<HTMLDivElement | null>;
  onSelect(id: string): void;
  onOpen(id: string): void;
  onToggle(id: string): void;
}

const noRaycast = () => null;
const TAU = Math.PI * 2;

export const isOverdue = (dueAt: number | null, completedAt: number | null, now: number): boolean =>
  dueAt !== null && completedAt === null && dueAt < now;

/**
 * One task. Hue = its region (every state). Priority = size, core luminance, glass finish and motion.
 * Completed = desaturated toward neutral. Overdue = thin alert ring, the one permitted exception.
 */
export const TaskOrb = memo(function TaskOrb(props: TaskOrbProps) {
  const { orb, selected, segments, ramp } = props;
  const { task } = orb;
  const live = useRef(props);
  live.current = props;
  const invalidate = useThree((s) => s.invalidate);

  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const highRing = useRef<THREE.Mesh>(null);
  const overdueRing = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const burst = useRef<THREE.Mesh>(null);

  const done = task.completedAt !== null;
  const overdue = isOverdue(task.dueAt, task.completedAt, Date.now());
  const style = MATERIALS.priority[task.priority];

  // Materials are created once with the initial colours; useFrame animates them afterwards.
  const initial = useRef({ ramp, done, style });
  const glass = useMemo(() => {
    const { ramp: r, done: d, style: s } = initial.current;
    const m = createGlassMaterial(d ? r.completed : r.base, d ? r.completedGlass : r.glass);
    m.roughness = d ? MATERIALS.completed.roughness : s.roughness;
    m.transmission = d ? MATERIALS.completed.transmission : s.transmission;
    return m;
  }, []);
  const coreMat = useMemo(() => {
    const { ramp: r, done: d, style: s } = initial.current;
    return createGlowMaterial(d ? r.completed : r.core, d ? MATERIALS.completed.coreIntensity : s.coreIntensity);
  }, []);
  const haloMat = useMemo(() => {
    const m = createGlowMaterial(initial.current.ramp.core, 1, { transparent: true, additive: true });
    m.opacity = 0;
    return m;
  }, []);
  const highRingMat = useMemo(() => {
    const m = createGlowMaterial(initial.current.ramp.core, 1, { transparent: true });
    m.opacity = 0;
    return m;
  }, []);
  const overdueMat = useMemo(() => {
    const m = createGlowMaterial(PALETTE.alert, 1, { transparent: true });
    m.opacity = 0;
    return m;
  }, []);
  const ringMat = useMemo(() => {
    const m = createGlowMaterial(initial.current.ramp.base, 1.2, { transparent: true });
    m.opacity = 0;
    return m;
  }, []);
  const burstMat = useMemo(() => {
    const m = createGlowMaterial(initial.current.ramp.base, 1.4, { transparent: true });
    m.side = THREE.DoubleSide;
    m.opacity = 0;
    return m;
  }, []);
  useEffect(
    () => () => {
      for (const m of [glass, coreMat, haloMat, highRingMat, overdueMat, ringMat, burstMat]) m.dispose();
    },
    [glass, coreMat, haloMat, highRingMat, overdueMat, ringMat, burstMat],
  );

  const hovered = useRef(false);
  const pressed = useRef(false);
  const mountedAt = useRef<number | null>(null);
  const burstStart = useRef<number | null>(null);
  const wasDone = useRef(done);
  const tmp = useMemo(
    () => ({ core: new THREE.Color(), c: new THREE.Color(), pos: new THREE.Vector3(), intensity: { v: initial.current.style.coreIntensity } }),
    [],
  );

  // Register this orb's live position for the connection lines.
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    props.registry.set(task.id, g.position);
    return () => {
      props.registry.delete(task.id);
    };
  }, [props.registry, task.id]);

  const [labelEl, setLabelEl] = useState<HTMLDivElement | null>(null);
  // Mounting is a discrete decision (hover is an event, not per-frame): every mounted <Html> costs a
  // projection and a style write each frame, so labels that can never be shown are not mounted.
  const [hoverLabel, setHoverLabel] = useState(false);
  const mountLabel = props.labelEligible || selected || hoverLabel || overdue || (style.ring && !done);
  const livePos = useMemo(() => new THREE.Vector3(...orb.rest), [orb.rest]);
  const label = useLabelEntry(props.labels, task.id, labelEl, {
    pos: livePos,
    offsetY: 0,
    regionId: orb.regionId,
    selected,
    hovered: false,
    important: false,
    rank: 0,
  });

  useEffect(() => {
    if (done && !wasDone.current && !live.current.reducedMotion) burstStart.current = -1;
    wasDone.current = done;
    invalidate();
  }, [done, invalidate]);

  useEffect(() => {
    invalidate();
  }, [selected, task.priority, orb.rest, ramp, overdue, invalidate]);

  useEffect(
    () => () => {
      if (hovered.current) document.body.style.cursor = '';
    },
    [],
  );

  useFrame((state, rawDelta) => {
    const g = group.current;
    const b = body.current;
    if (!g || !b) return;
    const p = live.current;
    const r = p.ramp;
    const task = p.orb.task;
    const dt = Math.min(rawDelta, 1 / 20);
    const t = state.clock.elapsedTime;
    const k = p.reducedMotion ? 0.0001 : 1;
    const isDone = task.completedAt !== null;
    const isOverdueNow = isOverdue(task.dueAt, task.completedAt, Date.now());
    const s = MATERIALS.priority[task.priority];
    const radius = isDone ? MATERIALS.completed.radius : s.radius;
    const [rx, ry, rz] = p.orb.rest;

    if (mountedAt.current === null) {
      mountedAt.current = t;
      g.position.set(rx, ry, rz - (p.reducedMotion ? 0 : 3));
      b.scale.setScalar(p.reducedMotion ? radius : 0.001);
    }
    if (!p.reducedMotion && t - mountedAt.current < Math.min(p.orb.index, 24) * CONSTELLATION.enterStagger) {
      state.invalidate();
      return;
    }

    let moving = false;

    // Float in place around the rest position.
    const floating = p.ambient && !p.reducedMotion;
    const [ax, ay, az] = MOTION.float.amplitude;
    const [sx, sy, sz] = MOTION.float.speed;
    const [px, py, pz] = p.orb.phase;
    tmp.pos.set(
      rx + (floating ? Math.sin(t * sx + px) * ax : 0),
      ry + (floating ? Math.sin(t * sy + py) * ay : 0),
      rz + (floating ? Math.sin(t * sz + pz) * az : 0) + (p.selected ? 0.6 : 0),
    );
    moving = easing.damp3(g.position, tmp.pos, MOTION.layout.smoothTime * k, dt) || moving;

    const stateScale = pressed.current ? CONSTELLATION.pressScale : p.selected ? CONSTELLATION.selectedScale : hovered.current ? CONSTELLATION.hoverScale : 1;
    const scaleTime = pressed.current ? MOTION.press.smoothTime : t - mountedAt.current < 1.2 ? MOTION.enter.smoothTime : MOTION.layout.smoothTime;
    moving = easing.damp3(b.scale, radius * stateScale, scaleTime * k, dt) || moving;
    if (floating) b.rotation.y += dt * 0.25;

    // Core luminance carries priority; hover/selection boost it, high priority breathes.
    const base = isDone ? MATERIALS.completed.coreIntensity : s.coreIntensity;
    const boost = isDone ? 1 : p.selected ? MATERIALS.core.selectedBoost : hovered.current ? MATERIALS.core.hoverBoost : 1;
    moving = easing.damp(tmp.intensity, 'v', base * boost, MOTION.color.smoothTime * k, dt) || moving;
    const breathing = s.ring && !isDone && floating;
    const breath = breathing ? 1 + Math.sin(t * TAU * MOTION.breathe.hz) * MOTION.breathe.amount : 1;
    tmp.core.set(isDone ? r.completed : r.core).multiplyScalar(tmp.intensity.v * breath);
    moving = easing.dampC(coreMat.color, tmp.core, MOTION.color.smoothTime * k, dt) || moving;

    // Glass: tinted by the region hue; finish carries priority.
    moving = easing.dampC(glass.attenuationColor, tmp.c.set(isDone ? r.completed : r.base), MOTION.color.smoothTime * k, dt) || moving;
    moving = easing.dampC(glass.color, tmp.c.set(isDone ? r.completedGlass : r.glass), MOTION.color.smoothTime * k, dt) || moving;
    moving = easing.damp(glass, 'roughness', isDone ? MATERIALS.completed.roughness : s.roughness, MOTION.color.smoothTime * k, dt) || moving;
    moving = easing.damp(glass, 'transmission', isDone ? MATERIALS.completed.transmission : s.transmission, MOTION.color.smoothTime * k, dt) || moving;
    moving =
      easing.damp(glass, 'iridescence', isDone ? MATERIALS.completed.iridescence : MATERIALS.glass.iridescence, MOTION.color.smoothTime * k, dt) || moving;

    // Medium: faint inner halo.
    const h = halo.current;
    if (h) {
      moving = easing.damp(haloMat, 'opacity', s.halo && !isDone ? MATERIALS.halo.opacity : 0, MOTION.color.smoothTime * k, dt) || moving;
      haloMat.color.set(r.core);
      h.visible = haloMat.opacity > 0.01;
    }

    // High: thin equatorial ring in the core colour.
    const hr = highRing.current;
    if (hr) {
      moving = easing.damp(highRingMat, 'opacity', s.ring && !isDone ? MATERIALS.highRing.opacity * breath : 0, MOTION.color.smoothTime * k, dt) || moving;
      highRingMat.color.set(r.core);
      hr.visible = highRingMat.opacity > 0.01;
      hr.scale.setScalar(b.scale.x * MATERIALS.highRing.radiusRatio);
    }

    // Overdue: alert ring, slowly rotating.
    const od = overdueRing.current;
    if (od) {
      moving = easing.damp(overdueMat, 'opacity', isOverdueNow ? MATERIALS.overdueRing.opacity : 0, MOTION.color.smoothTime * k, dt) || moving;
      od.visible = overdueMat.opacity > 0.01;
      od.scale.setScalar(b.scale.x * MATERIALS.overdueRing.radiusRatio);
      od.rotation.x = 1.1;
      if (floating) od.rotation.z += dt * MATERIALS.overdueRing.spin;
    }

    // Selection ring in the region hue.
    const sr = ring.current;
    if (sr) {
      moving = easing.damp(ringMat, 'opacity', p.selected ? MATERIALS.ring.opacity : 0, MOTION.hover.smoothTime * k, dt) || moving;
      sr.visible = ringMat.opacity > 0.01;
      ringMat.color.set(r.base).multiplyScalar(1.2);
      sr.scale.setScalar(b.scale.x * MATERIALS.ring.radiusRatio);
      sr.rotation.x = 1.2 + (floating ? Math.sin(t * 0.7) * 0.15 : 0);
      if (floating) sr.rotation.y += dt * 0.6;
    }

    // Completion shockwave in the region hue, ease-out.
    const bu = burst.current;
    if (bu) {
      if (burstStart.current === -1) burstStart.current = t;
      if (burstStart.current !== null) {
        const u = (t - burstStart.current) / MOTION.burst.seconds;
        if (u >= 1 || p.reducedMotion) {
          burstStart.current = null;
          bu.visible = false;
        } else {
          bu.visible = true;
          const e = 1 - Math.pow(1 - u, 3);
          bu.scale.setScalar(radius * (1.1 + e * 2.6));
          burstMat.color.set(r.base).multiplyScalar(1.4);
          burstMat.opacity = (1 - e) * MOTION.burst.peakOpacity;
          bu.quaternion.copy(state.camera.quaternion);
          moving = true;
        }
      }
    }

    // Keep the label culler's view of this orb current.
    const le = label.current;
    if (le) {
      le.pos.copy(g.position);
      le.offsetY = radius * CONSTELLATION.selectedScale + CONSTELLATION.labelOffset;
      le.selected = p.selected;
      le.hovered = hovered.current;
      le.important = (s.ring && !isDone) || isOverdueNow;
      le.regionId = p.orb.regionId;
      le.rank = (p.selected ? 1000 : 0) + (hovered.current ? 500 : 0) + (isDone ? 0 : task.priority * 10) + (isOverdueNow ? 25 : 0);
    }

    if (moving || (breathing && p.ambient)) state.invalidate();
  }, FRAME.orbs);

  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hovered.current = true;
    setHoverLabel(true);
    if (!pointerState.down) document.body.style.cursor = 'pointer';
    invalidate();
  };
  const onPointerOut = () => {
    hovered.current = false;
    setHoverLabel(false);
    pressed.current = false;
    if (!pointerState.down) document.body.style.cursor = '';
    invalidate();
  };
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    pressed.current = true;
    invalidate();
  };
  const onPointerUp = () => {
    pressed.current = false;
    invalidate();
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (pointerState.dragged) return;
    if (live.current.selected) live.current.onToggle(task.id);
    else live.current.onSelect(task.id);
  };
  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (pointerState.dragged) return;
    live.current.onOpen(task.id);
  };

  const due = formatDue(task.dueAt);
  const labelRadius = done ? MATERIALS.completed.radius : style.radius;

  return (
    <group ref={group}>
      <group ref={body}>
        <mesh
          geometry={sharedGeometry('sphere', segments)}
          material={glass}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        />
        <mesh geometry={sharedGeometry('core', 0)} material={coreMat} scale={MATERIALS.core.radiusRatio} raycast={noRaycast} />
        <mesh
          ref={halo}
          geometry={sharedGeometry('core', 0)}
          material={haloMat}
          scale={MATERIALS.core.radiusRatio * MATERIALS.halo.radiusRatio}
          raycast={noRaycast}
          visible={false}
        />
      </group>
      <mesh ref={highRing} geometry={sharedGeometry('highRing', 0)} material={highRingMat} rotation-x={1.25} raycast={noRaycast} visible={false} />
      <mesh ref={overdueRing} geometry={sharedGeometry('overdueRing', 0)} material={overdueMat} raycast={noRaycast} visible={false} />
      <mesh ref={ring} geometry={sharedGeometry('ring', 0)} material={ringMat} raycast={noRaycast} visible={false} />
      <mesh ref={burst} geometry={sharedGeometry('burst', 0)} material={burstMat} raycast={noRaycast} visible={false} />
      {mountLabel && (
        <Html
          center
          portal={props.labelLayer as RefObject<HTMLElement>}
          position={[0, -labelRadius * CONSTELLATION.selectedScale - CONSTELLATION.labelOffset, 0]}
          pointerEvents="none"
          zIndexRange={[20, 0]}
        >
          <div
            ref={setLabelEl}
            className={`orb-label${done ? ' is-done' : ''}${selected ? ' is-selected' : ''}${overdue ? ' is-overdue' : ''}`}
            data-priority={task.priority}
            style={{ opacity: 0 }}
          >
            <div className="orb-title" lang="bn-BD en">
              {task.title}
            </div>
            {(due || task.tags.length > 0) && (
              <div className="orb-meta">
                {due && <span className={`orb-due tone-${due.tone}`}>{due.text}</span>}
                {task.tags.slice(0, 2).map((t) => (
                  <span key={t} className="orb-tag">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
});
