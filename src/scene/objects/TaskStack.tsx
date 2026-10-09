import { useFrame, useThree } from '@react-three/fiber';
import { easing } from 'maath';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import type * as THREE from 'three';
import type { Task } from '../../contracts/task';
import { LAYOUT, MOTION } from '../../contracts/tokens';
import { createAccentGeometry, createCardGeometry } from '../materials/materials';
import { FRAME_PRIORITY_BEFORE_HTML, TaskCard } from './TaskCard';

export interface TaskStackProps {
  tasks: Task[];
  selectedId: string | null;
  accent: string;
  reducedMotion: boolean;
  labelLayer: RefObject<HTMLDivElement | null>;
  onSelect(id: string): void;
  onOpen(id: string): void;
  onToggle(id: string): void;
}

const STEP = LAYOUT.card.height + LAYOUT.gap;

export function TaskStack({ tasks, selectedId, accent, reducedMotion, labelLayer, onSelect, onOpen, onToggle }: TaskStackProps) {
  const viewport = useThree((s) => s.viewport);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<THREE.Group>(null);

  const width = Math.max(3, Math.round(Math.min(LAYOUT.card.width, viewport.width - 1.2) * 10) / 10);
  const geometry = useMemo(() => createCardGeometry(width), [width]);
  const accentGeometry = useMemo(createAccentGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => accentGeometry.dispose(), [accentGeometry]);

  const pad = LAYOUT.viewportPadding;
  const top = viewport.height / 2 - pad - LAYOUT.card.height / 2;
  const available = viewport.height - pad * 2;
  const maxScroll = Math.max(0, tasks.length * STEP - LAYOUT.gap - available);

  const scroll = useRef({ target: 0, max: maxScroll });
  scroll.current.max = maxScroll;
  if (scroll.current.target > maxScroll) scroll.current.target = maxScroll;

  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      const s = scroll.current;
      s.target = Math.min(s.max, Math.max(0, s.target + e.deltaY * LAYOUT.scrollPerWheelPixel));
      invalidate();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, [gl, invalidate]);

  // Keep the selected card inside the viewport.
  useEffect(() => {
    const i = tasks.findIndex((t) => t.id === selectedId);
    if (i < 0) return;
    const s = scroll.current;
    const cardTop = i * STEP;
    const cardBottom = cardTop + LAYOUT.card.height;
    if (cardTop < s.target) s.target = cardTop;
    else if (cardBottom > s.target + available) s.target = cardBottom - available;
    s.target = Math.min(s.max, Math.max(0, s.target));
    invalidate();
  }, [selectedId, tasks, available, invalidate]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const k = reducedMotion ? 0.0001 : 1;
    if (easing.damp(g.position, 'y', scroll.current.target, MOTION.scroll.smoothTime * k, Math.min(delta, 1 / 20))) state.invalidate();
  }, FRAME_PRIORITY_BEFORE_HTML - 1);

  return (
    <group ref={group}>
      {tasks.map((task, i) => (
        <TaskCard
          key={task.id}
          task={task}
          index={i}
          y={top - i * STEP}
          width={width}
          selected={task.id === selectedId}
          accent={accent}
          reducedMotion={reducedMotion}
          labelLayer={labelLayer}
          geometry={geometry}
          accentGeometry={accentGeometry}
          onSelect={onSelect}
          onOpen={onOpen}
          onToggle={onToggle}
        />
      ))}
    </group>
  );
}
