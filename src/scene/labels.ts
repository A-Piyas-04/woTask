import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { CAMERA } from '../contracts/tokens';
import { FRAME } from './interaction';

/** One task label, written by its orb every frame and read by the culler. */
export interface LabelEntry {
  el: HTMLElement;
  /** Live world position of the orb (the label sits `offsetY` below it). */
  pos: THREE.Vector3;
  offsetY: number;
  regionId: string;
  selected: boolean;
  hovered: boolean;
  /** High priority or overdue: always a candidate regardless of region. */
  important: boolean;
  /** Higher wins a collision. */
  rank: number;
  /** Unscaled CSS size, kept current by a ResizeObserver. */
  width: number;
  height: number;
  /** Last opacity written to the element. */
  opacity: number;
  collided: boolean;
}

export type LabelRegistry = Map<string, LabelEntry>;

export function useLabelRegistry(): LabelRegistry {
  return useMemo<LabelRegistry>(() => new Map(), []);
}

/** Registers a label element and keeps its measured size current. Returns the live entry. */
export function useLabelEntry(
  registry: LabelRegistry,
  id: string,
  el: HTMLElement | null,
  init: Omit<LabelEntry, 'el' | 'width' | 'height' | 'opacity' | 'collided'>,
): RefObject<LabelEntry | null> {
  const entry = useRef<LabelEntry | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!el) return;
    const e: LabelEntry = { ...init, el, width: el.offsetWidth, height: el.offsetHeight, opacity: -1, collided: false };
    entry.current = e;
    registry.set(id, e);
    // On-demand canvas: the culler only runs on a rendered frame, so ask for one.
    invalidate();
    const ro = new ResizeObserver(() => {
      e.width = el.offsetWidth;
      e.height = el.offsetHeight;
      invalidate();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      registry.delete(id);
      entry.current = null;
    };
    // `init` only seeds the entry; the orb updates the live fields every frame.
  }, [registry, id, el, invalidate]);
  return entry;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const PAD = 3;

/**
 * Decides which task labels are visible each frame, by writing `style.opacity` only (never React state):
 * selected/hovered, important (high priority or overdue), or in the active region within
 * `CAMERA.labelDistance`. Everything fades with distance, and a screen-space pass hides the
 * lower-ranked of any two overlapping labels.
 */
export function LabelCuller({ registry, activeRegionId }: { registry: LabelRegistry; activeRegionId: string | null }) {
  const live = useRef(activeRegionId);
  live.current = activeRegionId;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [activeRegionId, invalidate]);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), lastCam: new THREE.Vector3(Infinity, 0, 0) }), []);
  const candidates = useRef<{ e: LabelEntry; fade: number; box: Box }[]>([]);

  useFrame((state, delta) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const { width, height } = state.size;
    const speed = delta > 0 && Number.isFinite(tmp.lastCam.x) ? cam.position.distanceTo(tmp.lastCam) / delta : 0;
    tmp.lastCam.copy(cam.position);
    const runCollision = speed < CAMERA.labelCollisionMaxSpeed;

    const list = candidates.current;
    list.length = 0;
    for (const e of registry.values()) {
      tmp.v.set(e.pos.x, e.pos.y - e.offsetY, e.pos.z);
      const dist = cam.position.distanceTo(tmp.v);
      const pinned = e.selected || e.hovered;
      const wanted = pinned || e.important || (e.regionId === live.current && dist < CAMERA.labelDistance);
      const fade = pinned ? 1 : 1 - smoothstep(CAMERA.labelFade[0], CAMERA.labelFade[1], dist);
      if (!wanted || fade < 0.02) {
        write(e, 0);
        continue;
      }
      tmp.v.project(cam);
      if (tmp.v.z > 1 || Math.abs(tmp.v.x) > 1.2 || Math.abs(tmp.v.y) > 1.2) {
        write(e, 0);
        continue;
      }
      // Labels render at a constant CSS size, centred on the projected anchor.
      const cx = (tmp.v.x * 0.5 + 0.5) * width;
      const cy = (-tmp.v.y * 0.5 + 0.5) * height;
      const hw = e.width / 2 + PAD;
      const hh = e.height / 2 + PAD;
      list.push({ e, fade, box: { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh } });
    }

    if (runCollision) {
      list.sort((a, b) => b.e.rank - a.e.rank);
      const kept: Box[] = [];
      for (let i = 0; i < list.length; i++) {
        const { e, box } = list[i];
        if (i >= CAMERA.labelCollisionCap) {
          e.collided = !(e.selected || e.hovered);
          continue;
        }
        const hit = kept.some((k) => box.x0 < k.x1 && box.x1 > k.x0 && box.y0 < k.y1 && box.y1 > k.y0);
        e.collided = hit && !(e.selected || e.hovered);
        if (!e.collided) kept.push(box);
      }
    }
    for (const { e, fade } of list) write(e, e.collided ? 0 : fade);
  }, FRAME.labels);

  return null;
}

function write(e: LabelEntry, opacity: number): void {
  const q = Math.round(opacity * 20) / 20;
  if (q === e.opacity) return;
  e.opacity = q;
  e.el.style.opacity = String(q);
  e.el.dataset.visible = q > 0 ? 'true' : 'false';
}
