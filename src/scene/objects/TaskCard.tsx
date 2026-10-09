import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { easing } from 'maath';
import { memo, useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { Task } from '../../contracts/task';
import { LAYOUT, MATERIALS, MOTION, PALETTE } from '../../contracts/tokens';
import { createAccentMaterial, createGlassMaterial, getShadowTexture, glassTarget, type GlassTarget } from '../materials/materials';
import { formatDue } from './labelFormat';

export interface TaskCardProps {
  task: Task;
  index: number;
  y: number;
  width: number;
  selected: boolean;
  accent: string;
  reducedMotion: boolean;
  /** Stable DOM container for labels; drei's default target changes once events connect. */
  labelLayer: RefObject<HTMLDivElement | null>;
  geometry: THREE.BufferGeometry;
  accentGeometry: THREE.BufferGeometry;
  onSelect(id: string): void;
  onOpen(id: string): void;
  onToggle(id: string): void;
}

const { height: H, depth: D } = LAYOUT.card;
const CHECK_ZONE = 0.75;
/** Negative so card transforms update before drei <Html> reads them (avoids a one-frame label lag). */
export const FRAME_PRIORITY_BEFORE_HTML = -1;
const BLACK = new THREE.Color('#000000');

export const TaskCard = memo(function TaskCard(props: TaskCardProps) {
  const { task, width, selected, geometry, accentGeometry } = props;
  const group = useRef<THREE.Group>(null);
  const live = useRef(props);
  live.current = props;

  const invalidate = useThree((s) => s.invalidate);
  const glass = useMemo(createGlassMaterial, []);
  const initialPriority = useRef(task.priority);
  const accentMat = useMemo(() => createAccentMaterial(PALETTE.priority[initialPriority.current]), []);
  const shadowMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: getShadowTexture(), transparent: true, depthWrite: false, opacity: 0.9 }),
    [],
  );
  useEffect(
    () => () => {
      glass.dispose();
      accentMat.dispose();
      shadowMat.dispose();
    },
    [glass, accentMat, shadowMat],
  );

  const hovered = useRef(false);
  const pressed = useRef(false);
  const flip = useRef(0);
  const wasCompleted = useRef(task.completedAt !== null);
  const mountedAt = useRef<number | null>(null);
  const target = useMemo<GlassTarget>(() => ({ color: new THREE.Color(), attenuation: new THREE.Color(), roughness: 0, transmission: 1 }), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const selectedEmissive = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const done = task.completedAt !== null;
    if (done && !wasCompleted.current && !live.current.reducedMotion) flip.current += Math.PI * 2;
    wasCompleted.current = done;
    invalidate();
  }, [task.completedAt, invalidate]);

  useEffect(() => {
    invalidate();
  }, [props.y, selected, task.priority, width, invalidate]);

  useEffect(
    () => () => {
      if (hovered.current) document.body.style.cursor = '';
    },
    [],
  );

  useFrame((state, rawDelta) => {
    const g = group.current;
    if (!g) return;
    const p = live.current;
    const dt = Math.min(rawDelta, 1 / 20);
    const now = state.clock.elapsedTime;

    if (mountedAt.current === null) {
      mountedAt.current = now;
      if (!p.reducedMotion) {
        g.position.set(0, p.y - 0.4, LAYOUT.enterOffset);
        g.scale.setScalar(0.85);
      } else {
        g.position.set(0, p.y, 0);
      }
    }
    if (!p.reducedMotion && now - mountedAt.current < Math.min(p.index, 14) * 0.035) {
      state.invalidate();
      return;
    }

    const k = p.reducedMotion ? 0.0001 : 1;
    const done = p.task.completedAt !== null;
    const z = pressed.current ? LAYOUT.pressDepth : p.selected ? LAYOUT.selectLift : hovered.current ? LAYOUT.hoverLift : 0;
    const zTime = pressed.current ? MOTION.press.smoothTime : MOTION.hover.smoothTime;
    const s = p.selected ? LAYOUT.selectScale : 1;

    let moving = false;
    moving = easing.damp(g.position, 'y', p.y, MOTION.layout.smoothTime * k, dt) || moving;
    moving = easing.damp(g.position, 'z', z, (mountedAt.current + 1 > now ? MOTION.enter.smoothTime : zTime) * k, dt) || moving;
    moving = easing.damp(g.position, 'x', 0, MOTION.layout.smoothTime * k, dt) || moving;
    moving = easing.damp3(g.scale, s, MOTION.hover.smoothTime * k, dt) || moving;
    moving = easing.damp(g.rotation, 'x', flip.current, MOTION.complete.smoothTime * k, dt) || moving;

    glassTarget(p.task.priority, done, target);
    moving = easing.dampC(glass.color, target.color, MOTION.color.smoothTime * k, dt) || moving;
    moving = easing.dampC(glass.attenuationColor, target.attenuation, MOTION.color.smoothTime * k, dt) || moving;
    moving = easing.damp(glass, 'roughness', target.roughness, MOTION.color.smoothTime * k, dt) || moving;
    moving = easing.damp(glass, 'transmission', target.transmission, MOTION.color.smoothTime * k, dt) || moving;
    selectedEmissive.set(p.accent).multiplyScalar(p.selected ? MATERIALS.glassSelected.emissiveIntensity : hovered.current ? 0.06 : 0);
    moving = easing.dampC(glass.emissive, p.selected || hovered.current ? selectedEmissive : BLACK, MOTION.color.smoothTime * k, dt) || moving;

    tmpColor.set(done ? PALETTE.success : PALETTE.priority[p.task.priority]);
    moving = easing.dampC(accentMat.color, tmpColor, MOTION.color.smoothTime * k, dt) || moving;
    moving = easing.dampC(accentMat.emissive, tmpColor, MOTION.color.smoothTime * k, dt) || moving;
    const glow = done ? MATERIALS.accentBar.emissiveIntensityCompleted : MATERIALS.accentBar.emissiveIntensity * (p.selected ? 1.4 : 1);
    moving = easing.damp(accentMat, 'emissiveIntensity', glow, MOTION.color.smoothTime * k, dt) || moving;

    if (moving) state.invalidate();
  }, FRAME_PRIORITY_BEFORE_HTML);

  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hovered.current = true;
    document.body.style.cursor = 'pointer';
    invalidate();
  };
  const onPointerOut = () => {
    hovered.current = false;
    pressed.current = false;
    document.body.style.cursor = '';
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
    const local = e.object.worldToLocal(e.point.clone());
    if (local.x < -width / 2 + CHECK_ZONE) live.current.onToggle(task.id);
    else live.current.onSelect(task.id);
  };
  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    live.current.onOpen(task.id);
  };

  const px = LAYOUT.labelPxPerUnit;
  const done = task.completedAt !== null;
  const due = formatDue(task.dueAt);

  return (
    <group ref={group}>
      <mesh position={[0.15, -0.22, -0.45]} material={shadowMat} renderOrder={-1}>
        <planeGeometry args={[width * 1.15, H * 2.4]} />
      </mesh>
      <mesh
        geometry={geometry}
        material={glass}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
      <mesh geometry={accentGeometry} material={accentMat} position={[-width / 2 + LAYOUT.accentBar.inset, 0, D * 0.25]} />
      <Html
        transform
        portal={props.labelLayer as RefObject<HTMLElement>}
        distanceFactor={400 / px}
        position={[0, 0, D / 2 + 0.004]}
        pointerEvents="none"
        zIndexRange={[20, 0]}
        className="card-label-host"
      >
        <div
          className={`card-label${done ? ' is-done' : ''}${selected ? ' is-selected' : ''}`}
          style={{ width: `${Math.round(width * px)}px`, height: `${Math.round(H * px)}px` }}
        >
          <span className="card-check" aria-hidden="true">
            {done ? '✓' : ''}
          </span>
          <div className="card-text">
            <div className="card-title" lang="bn-BD en">
              {task.title}
            </div>
            {(due || task.tags.length > 0 || task.notes) && (
              <div className="card-meta">
                {due && <span className={`card-due tone-${due.tone}`}>{due.text}</span>}
                {task.tags.slice(0, 3).map((t) => (
                  <span key={t} className="card-tag">
                    #{t}
                  </span>
                ))}
                {task.notes && <span className="card-notes">≡ notes</span>}
              </div>
            )}
          </div>
        </div>
      </Html>
    </group>
  );
});
