import type { Region, RegionKind, Task } from '../contracts/task';
import { CAMERA, CLUSTER, CONSTELLATION, MATERIALS } from '../contracts/tokens';

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

export interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** All regions of one kind: drawn as an outlined group with its own title. */
export interface Cluster {
  kind: RegionKind;
  count: number;
  rect: Rect;
}

export interface SceneLayout {
  zones: Zone[];
  clusters: Cluster[];
  byTaskId: Map<string, OrbPlacement>;
  /** Horizontal distance between neighbouring zone centres, world units. */
  zoneSpacing: number;
  /** Where the camera target may go: every cluster plus `CAMERA.boundsMargin`. */
  bounds: Rect;
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
  return task.completedAt !== null ? MATERIALS.completed.radius : MATERIALS.priority[task.priority].radius;
}

/**
 * Regions are grouped by kind (in the order they arrive) into clusters laid side by side with their tops
 * aligned. Inside a cluster, zones sit on an offset grid (one zone roughly fills the screen at the default
 * distance); tasks sit on a golden-angle spiral inside their zone, first task closest to the hub.
 */
export function computeLayout(regions: Region[], tasksByRegion: Record<string, Task[]>): SceneLayout {
  const maxCount = Math.max(1, ...regions.map((g) => tasksByRegion[g.id]?.length ?? 0));
  const zoneRadius = spiralRadius(maxCount) + 1.2;
  const cell = zoneRadius * 2 + CONSTELLATION.zoneGap;

  const groups: { kind: RegionKind; regions: Region[] }[] = [];
  for (const region of regions) {
    const group = groups.find((g) => g.kind === region.kind);
    if (group) group.regions.push(region);
    else groups.push({ kind: region.kind, regions: [region] });
  }

  const zones: Zone[] = [];
  const clusters: Cluster[] = [];
  const byTaskId = new Map<string, OrbPlacement>();
  let cursorX = 0;

  for (const group of groups) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(group.regions.length)));
    const local = group.regions.map((region, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const radius = spiralRadius(tasksByRegion[region.id]?.length ?? 0) + CONSTELLATION.orbitPadding;
      // Offset alternate rows for a less grid-like, more celestial arrangement.
      return { region, x: col * cell * 1.15 + (row % 2) * cell * 0.45, y: -row * cell * 0.9, radius };
    });
    const pad = CLUSTER.padding;
    const minX = Math.min(...local.map((z) => z.x - z.radius)) - pad;
    const maxX = Math.max(...local.map((z) => z.x + z.radius)) + pad;
    const minY = Math.min(...local.map((z) => z.y - z.radius / CONSTELLATION.ellipseX)) - pad;
    const maxY = Math.max(...local.map((z) => z.y + z.radius / CONSTELLATION.ellipseX + CLUSTER.zoneTitleRoom)) + pad;
    const dx = cursorX - minX;
    const dy = -maxY;
    clusters.push({ kind: group.kind, count: group.regions.length, rect: { minX: minX + dx, maxX: maxX + dx, minY: minY + dy, maxY: 0 } });
    cursorX = maxX + dx + cell * CLUSTER.gapCells;
    for (const z of local) zones.push(placeZone(z.region, z.x + dx, z.y + dy, z.radius, tasksByRegion[z.region.id] ?? [], byTaskId));
  }

  const m = CAMERA.boundsMargin;
  return {
    zones,
    clusters,
    byTaskId,
    zoneSpacing: cell * 1.15,
    bounds: {
      minX: Math.min(0, ...clusters.map((c) => c.rect.minX)) - m,
      maxX: Math.max(0, ...clusters.map((c) => c.rect.maxX)) + m,
      minY: Math.min(0, ...clusters.map((c) => c.rect.minY)) - m,
      maxY: Math.max(0, ...clusters.map((c) => c.rect.maxY)) + m,
    },
  };
}

function placeZone(region: Region, cx: number, cy: number, radius: number, tasks: Task[], byTaskId: Map<string, OrbPlacement>): Zone {
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

  return { region, center: [cx, cy, 0], radius, orbs, edges };
}

const FOV_TAN = Math.tan((CAMERA.fov * Math.PI) / 360);

/** Zoom-out limit: comfortably beyond the distance that shows every cluster at once, never below `CAMERA.maxDistance`. */
export function maxZoomDistance(bounds: Rect): number {
  const half = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2;
  return Math.max(CAMERA.maxDistance, (half / FOV_TAN) * CAMERA.overviewMargin);
}

/** Uniform x/y scale for the background so it still fills the widest window from anywhere in `bounds` at `distance`. */
export function backgroundScale(bounds: Rect, distance: number, depth: number, size: readonly [number, number]): number {
  const reach = FOV_TAN * (distance - depth);
  const needX = (bounds.maxX - bounds.minX) / 2 + reach * CAMERA.maxAspect;
  const needY = (bounds.maxY - bounds.minY) / 2 + reach;
  return Math.max(1, (2 * needX) / size[0], (2 * needY) / size[1]);
}
