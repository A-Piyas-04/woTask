import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { easing } from 'maath';
import { memo, useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { CAMERA, CONSTELLATION, MATERIALS, MOTION, PALETTE } from '../../contracts/tokens';
import { FRAME, pointerState, type PositionRegistry } from '../interaction';
import type { OrbPlacement } from '../layout';
import { createGlassMaterial, createGlowMaterial, sharedGeometry } from '../materials/materials';
import { formatDue } from './labelFormat';

export interface TaskOrbProps {
  orb: OrbPlacement;
  selected: boolean;
  listColor: string;
  ambient: boolean;
  reducedMotion: boolean;
  segments: number;
  registry: PositionRegistry;
  labelLayer: RefObject<HTMLDivElement | null>;
  onSelect(id: string): void;
  onOpen(id: string): void;
  onToggle(id: string): void;
}

const noRaycast = () => null;

export const TaskOrb = memo(function TaskOrb(props: TaskOrbProps) {
  const { orb, selected, segments } = props;
  const { task } = orb;
  const live = useRef(props);
  live.current = props;
  const invalidate = useThree((s) => s.invalidate);

  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const burst = useRef<THREE.Mesh>(null);

  const done = task.completedAt !== null;
  const coreColor = done ? PALETTE.success : PALETTE.priority[task.priority];

  // Materials are created once with the initial colours; useFrame animates them afterwards.
  const initial = useRef({ tint: PALETTE.priority[task.priority], core: coreColor, ring: props.listColor });
  const glass = useMemo(() => createGlassMaterial(initial.current.tint), []);
  const coreMat = useMemo(() => createGlowMaterial(initial.current.core, MATERIALS.core.intensity), []);
  const ringMat = useMemo(() => {
    const m = createGlowMaterial(initial.current.ring, MATERIALS.ring.intensity, { transparent: true });
    m.opacity = 0;
    return m;
  }, []);
  const burstMat = useMemo(() => {
    const m = createGlowMaterial(PALETTE.success, 3, { transparent: true });
    m.side = THREE.DoubleSide;
    m.opacity = 0;
    return m;
  }, []);
  useEffect(
    () => () => {
      glass.dispose();
      coreMat.dispose();
      ringMat.dispose();
      burstMat.dispose();
    },
    [glass, coreMat, ringMat, burstMat],
  );

  const hovered = useRef(false);
  const pressed = useRef(false);
  const mountedAt = useRef<number | null>(null);
  const burstStart = useRef<number | null>(null);
  const wasDone = useRef(done);
  const tmp = useMemo(
    () => ({ core: new THREE.Color(), tint: new THREE.Color(), ring: new THREE.Color(), pos: new THREE.Vector3() }),
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

  useEffect(() => {
    if (done && !wasDone.current && !live.current.reducedMotion) burstStart.current = -1;
    wasDone.current = done;
    invalidate();
  }, [done, invalidate]);

  useEffect(() => {
    invalidate();
  }, [selected, task.priority, orb.rest, invalidate]);

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
    const dt = Math.min(rawDelta, 1 / 20);
    const t = state.clock.elapsedTime;
    const k = p.reducedMotion ? 0.0001 : 1;
    const isDone = p.orb.task.completedAt !== null;
    const [rx, ry, rz] = p.orb.rest;

    if (mountedAt.current === null) {
      mountedAt.current = t;
      g.position.set(rx, ry, rz - (p.reducedMotion ? 0 : 3));
      b.scale.setScalar(p.reducedMotion ? p.orb.radius : 0.001);
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

    const scale =
      p.orb.radius *
      (pressed.current ? CONSTELLATION.pressScale : p.selected ? CONSTELLATION.selectedScale : hovered.current ? CONSTELLATION.hoverScale : 1);
    const scaleTime = pressed.current ? MOTION.press.smoothTime : t - mountedAt.current < 1.2 ? MOTION.enter.smoothTime : MOTION.hover.smoothTime;
    moving = easing.damp3(b.scale, scale, scaleTime * k, dt) || moving;
    if (floating) b.rotation.y += dt * 0.25;

    // Core glow: priority colour, brighter on hover/selection, green when complete.
    const intensity = isDone
      ? MATERIALS.core.completedIntensity
      : p.selected
        ? MATERIALS.core.selectedIntensity
        : hovered.current
          ? MATERIALS.core.hoverIntensity
          : MATERIALS.core.intensity;
    const pulse = floating && p.selected ? 1 + Math.sin(t * 3) * 0.15 : 1;
    tmp.core.set(isDone ? PALETTE.success : PALETTE.priority[p.orb.task.priority]).multiplyScalar(intensity * pulse);
    moving = easing.dampC(coreMat.color, tmp.core, MOTION.color.smoothTime * k, dt) || moving;

    tmp.tint.set(isDone ? PALETTE.success : PALETTE.priority[p.orb.task.priority]);
    moving = easing.dampC(glass.attenuationColor, tmp.tint, MOTION.color.smoothTime * k, dt) || moving;
    moving =
      easing.damp(glass, 'roughness', isDone ? MATERIALS.glassCompleted.roughness : MATERIALS.glass.roughness, MOTION.color.smoothTime * k, dt) || moving;
    moving =
      easing.damp(glass, 'iridescence', isDone ? MATERIALS.glassCompleted.iridescence : MATERIALS.glass.iridescence, MOTION.color.smoothTime * k, dt) ||
      moving;

    // Selection ring.
    const r = ring.current;
    if (r) {
      moving = easing.damp(ringMat, 'opacity', p.selected ? 0.95 : 0, MOTION.hover.smoothTime * k, dt) || moving;
      r.visible = ringMat.opacity > 0.01;
      tmp.ring.set(p.listColor).multiplyScalar(MATERIALS.ring.intensity);
      ringMat.color.copy(tmp.ring);
      r.rotation.x = 1.2 + Math.sin(t * 0.7) * 0.15;
      r.rotation.y += dt * 0.9;
      if (p.selected && !p.reducedMotion) moving = true;
    }

    // Completion shockwave.
    const bu = burst.current;
    if (bu) {
      if (burstStart.current === -1) burstStart.current = t;
      if (burstStart.current !== null) {
        const u = (t - burstStart.current) / MOTION.burstSeconds;
        if (u >= 1) {
          burstStart.current = null;
          bu.visible = false;
        } else {
          bu.visible = true;
          const e = 1 - Math.pow(1 - u, 3);
          bu.scale.setScalar(p.orb.radius * (1.1 + e * 3.2));
          burstMat.opacity = (1 - u) * 0.9;
          bu.quaternion.copy(state.camera.quaternion);
          moving = true;
        }
      }
    }

    if (moving) state.invalidate();
  }, FRAME.orbs);

  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hovered.current = true;
    if (!pointerState.down) document.body.style.cursor = 'pointer';
    invalidate();
  };
  const onPointerOut = () => {
    hovered.current = false;
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
      </group>
      <mesh ref={ring} geometry={sharedGeometry('ring', 0)} material={ringMat} scale={orb.radius * MATERIALS.ring.radiusRatio * CONSTELLATION.selectedScale} raycast={noRaycast} visible={false} />
      <mesh ref={burst} geometry={sharedGeometry('burst', 0)} material={burstMat} raycast={noRaycast} visible={false} />
      <Html
        center
        portal={props.labelLayer as RefObject<HTMLElement>}
        position={[0, -orb.radius * CONSTELLATION.selectedScale - CONSTELLATION.labelOffset, 0]}
        distanceFactor={CAMERA.labelDistanceFactor}
        pointerEvents="none"
        zIndexRange={[20, 0]}
      >
        <div className={`orb-label${done ? ' is-done' : ''}${selected ? ' is-selected' : ''}`}>
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
    </group>
  );
});
