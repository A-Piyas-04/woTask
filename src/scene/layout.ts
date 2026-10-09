import type { Region, Task } from '../contracts/task';
import { CAMERA, CONSTELLATION } from '../contracts/tokens';

export type Vec3 = [number, number, number];

export interface OrbPlacement {
  task: Task;
  regionId: string;
  index: number;
  rest: Vec3;
  radius: number;
  /** Deterministic per-task phases for the floating motion. */
  phase: Vec3;
}

export interface Zone {
  region: Region;
  center: Vec3;
  radius: number;
  orbs: OrbPlacement[];
  /** Constellation tree: edges[i] is the orb index task i connects to, or -1 for the hub. */
  edges: number[];
}

export interface SceneLayout {
  zones: Zone[];
  byTaskId: Map<string, OrbPlacement>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Stable 0..1 hash of a string (FNV-1a). */
export function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const spiralRadius = (count: number): number =>
  CONSTELLATION.spiralSpacing * Math.sqrt(Math.max(count, 1) - 1 + CONSTELLATION.spiralStart) * CONSTELLATION.ellipseX;

export function orbRadius(task: Task): number {
  return task.completedAt !== null ? CONSTELLATION.completedRadius : CONSTELLATION.orbRadius[task.priority];
}

/**
 * Regions become zones on a grid (one zone roughly fills the screen at the default distance);
 * tasks sit on a golden-angle spiral inside their zone, first task closest to the hub.
 */
export function computeLayout(regions: Region[], tasksByRegion: Record<string, Task[]>): SceneLayout {
  const maxCount = Math.max(1, ...regions.map((g) => tasksByRegion[g.id]?.length ?? 0));
  const zoneRadius = spiralRadius(maxCount) + 1.2;
  const cell = zoneRadius * 2 + CONSTELLATION.zoneGap;
  const cols = Math.max(1, Math.ceil(Math.sqrt(regions.length)));

  const zones: Zone[] = [];
  const byTaskId = new Map<string, OrbPlacement>();

  regions.forEach((region, ri) => {
    const col = ri % cols;
    const row = Math.floor(ri / cols);
    // Offset alternate rows for a less grid-like, more celestial arrangement.
    const cx = col * cell * 1.15 + (row % 2) * cell * 0.45;
    const cy = -row * cell * 0.9;
    const tasks = tasksByRegion[region.id] ?? [];
    const spin = hash01(region.id) * Math.PI * 2;

    const orbs = tasks.map<OrbPlacement>((task, i) => {
      const r = CONSTELLATION.spiralSpacing * Math.sqrt(i + CONSTELLATION.spiralStart);
      const a = spin + i * GOLDEN_ANGLE;
      const placement: OrbPlacement = {
        task,
        regionId: region.id,
        index: i,
        rest: [
          cx + Math.cos(a) * r * CONSTELLATION.ellipseX,
          cy + Math.sin(a) * r,
          (hash01(task.id, 7) - 0.5) * CONSTELLATION.depthJitter,
        ],
        radius: orbRadius(task),
        phase: [hash01(task.id, 1) * 6.283, hash01(task.id, 2) * 6.283, hash01(task.id, 3) * 6.283],
      };
      byTaskId.set(task.id, placement);
      return placement;
    });

    // Each orb links to its nearest already-placed neighbour (or the hub): a crossing-free tree.
    const edges = orbs.map((o, i) => {
      let best = -1;
      let bestD = Math.hypot(o.rest[0] - cx, o.rest[1] - cy);
      for (let j = 0; j < i; j++) {
        const d = Math.hypot(o.rest[0] - orbs[j].rest[0], o.rest[1] - orbs[j].rest[1]);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      return best;
    });

    zones.push({ region, center: [cx, cy, 0], radius: spiralRadius(tasks.length) + CONSTELLATION.orbitPadding, orbs, edges });
  });

  const xs = zones.map((z) => z.center[0]);
  const ys = zones.map((z) => z.center[1]);
  const m = CAMERA.boundsMargin;
  return {
    zones,
    byTaskId,
    bounds: {
      minX: Math.min(0, ...xs) - m,
      maxX: Math.max(0, ...xs) + m,
      minY: Math.min(0, ...ys) - m,
      maxY: Math.max(0, ...ys) + m,
    },
  };
}
