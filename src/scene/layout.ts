import type { ChainIndex, Space, SpaceKind, Task } from '../contracts/task';
import { CAMERA, CHAIN, CLUSTER, CONSTELLATION, MATERIALS } from '../contracts/tokens';

export type Vec3 = [number, number, number];

/** One task's place in its chain, for the renderer. Null on a loose task. */
export interface OrbChain {
  rootId: string;
  depth: number;
  locked: boolean;
  outOfOrder: boolean;
  unlockToken: number;
}

export interface OrbPlacement {
  task: Task;
  spaceId: string;
  index: number;
  rest: Vec3;
  radius: number;
  /** Deterministic per-task phases for the floating motion. */
  phase: Vec3;
  chain: OrbChain | null;
}

/**
 * A line in the decorative constellation tree. `parent === -1` means the hub.
 *
 * An explicit pair rather than an array parallel to `orbs`: the tree now spans only the loose orbs,
 * so index aliasing against `orbs` would be a bug waiting to happen.
 */
export interface DecorEdge {
  child: number;
  parent: number;
}

/** A real dependency. `from` is the blocker, `to` the successor. Both index into `Zone.orbs`. */
export interface ChainLink {
  from: number;
  to: number;
  /** The successor is still blocked: the link renders dim and completely still. */
  locked: boolean;
  /** The successor was completed while blocked, so the sequence is unresolved. */
  outOfOrder: boolean;
  /** Changes exactly when the blocker completes; a change fires the one-shot travel. */
  unlockToken: number;
}

export interface Zone {
  space: Space;
  center: Vec3;
  radius: number;
  orbs: OrbPlacement[];
  /**
   * Decorative constellation tree over the loose orbs only. Never a dependency - chained orbs
   * already read as a sequence, and a second line over them would compete with the real one.
   */
  edges: DecorEdge[];
  /** Real dependencies, drawn with direction. */
  links: ChainLink[];
}

export interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** All spaces of one kind: drawn as an outlined group with its own title. */
export interface Cluster {
  kind: SpaceKind;
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

/** Radius of the step at `depth` on an arm that begins at `start`. */
const armRadius = (start: number, depth: number): number =>
  start + CHAIN.stepRadius * Math.min(depth, CHAIN.maxDepth) ** CHAIN.stepExponent;

/**
 * Radians each step advances around the hub. Narrows so that a zone's chained tasks fit within one
 * turn where possible, which is what keeps any two of them from landing on the same angle.
 */
const armCurl = (chainedCount: number): number =>
  Math.max(CHAIN.minCurl, Math.min(CHAIN.curl, (Math.PI * 2 - CHAIN.armGuard) / Math.max(1, chainedCount)));

/** How far a zone's content extends from its centre, whichever track reaches further. */
function contentRadius(tasks: Task[], chains: ChainIndex): number {
  const loose = tasks.filter((t) => chains[t.id] === undefined).length;
  let maxDepth = 0;
  for (const t of tasks) {
    const meta = chains[t.id];
    if (meta) maxDepth = Math.max(maxDepth, meta.depth);
  }
  const looseR = spiralRadius(loose);
  if (maxDepth < 1) return looseR;
  return Math.max(looseR, armRadius(looseR + CHAIN.bandClearance, maxDepth));
}

/**
 * Spaces are grouped by kind (in the order they arrive) into clusters laid side by side with their tops
 * aligned. Inside a cluster, zones sit on an offset grid (one zone roughly fills the screen at the default
 * distance); loose tasks sit on a golden-angle spiral inside their zone, first task closest to the hub,
 * and each chain radiates outward past the spiral as its own arm.
 */
export function computeLayout(spaces: Space[], tasksBySpace: Record<string, Task[]>, chains: ChainIndex): SceneLayout {
  const zoneRadius = Math.max(1, ...spaces.map((g) => contentRadius(tasksBySpace[g.id] ?? [], chains))) + 1.2;
  const cell = zoneRadius * 2 + CONSTELLATION.zoneGap;

  const groups: { kind: SpaceKind; spaces: Space[] }[] = [];
  for (const space of spaces) {
    const group = groups.find((g) => g.kind === space.kind);
    if (group) group.spaces.push(space);
    else groups.push({ kind: space.kind, spaces: [space] });
  }

  const zones: Zone[] = [];
  const clusters: Cluster[] = [];
  const byTaskId = new Map<string, OrbPlacement>();
  let cursorX = 0;

  for (const group of groups) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(group.spaces.length)));
    const local = group.spaces.map((space, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const radius = contentRadius(tasksBySpace[space.id] ?? [], chains) + CONSTELLATION.orbitPadding;
      // Offset alternate rows for a less grid-like, more celestial arrangement.
      return { space, x: col * cell * 1.15 + (row % 2) * cell * 0.45, y: -row * cell * 0.9, radius };
    });
    const pad = CLUSTER.padding;
    const minX = Math.min(...local.map((z) => z.x - z.radius)) - pad;
    const maxX = Math.max(...local.map((z) => z.x + z.radius)) + pad;
    const minY = Math.min(...local.map((z) => z.y - z.radius / CONSTELLATION.ellipseX)) - pad;
    const maxY = Math.max(...local.map((z) => z.y + z.radius / CONSTELLATION.ellipseX + CLUSTER.zoneTitleRoom)) + pad;
    const dx = cursorX - minX;
    const dy = -maxY;
    clusters.push({ kind: group.kind, count: group.spaces.length, rect: { minX: minX + dx, maxX: maxX + dx, minY: minY + dy, maxY: 0 } });
    cursorX = maxX + dx + cell * CLUSTER.gapCells;
    for (const z of local) zones.push(placeZone(z.space, z.x + dx, z.y + dy, z.radius, tasksBySpace[z.space.id] ?? [], chains, byTaskId));
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

function placeZone(
  space: Space,
  cx: number,
  cy: number,
  radius: number,
  tasks: Task[],
  chains: ChainIndex,
  byTaskId: Map<string, OrbPlacement>,
): Zone {
  const spin = hash01(space.id) * Math.PI * 2;
  const jitterZ = (id: string, factor = 1): number => (hash01(id, 7) - 0.5) * CONSTELLATION.depthJitter * factor;

  // Two tracks. `tasks` arrives in display order (chains already contiguous and depth-first), and
  // the arm order follows the order the roots appear in, so a chain never jumps arm as it grows.
  const loose = tasks.filter((t) => chains[t.id] === undefined);
  const chained = tasks.filter((t) => chains[t.id] !== undefined);

  const looseR = spiralRadius(loose.length);
  const armStart = looseR + CHAIN.bandClearance;
  const curl = armCurl(chained.length);
  const armSpin = hash01(space.id, 5) * Math.PI * 2;

  /**
   * Angle comes from a task's position in a depth-first walk of the chain, radius from its depth.
   *
   * Giving every chained task its own angular slot is what makes the layout collision-free: two
   * tasks can share a radius only if they sit at different angles, and share an angle only if they
   * sit at different radii. Allocating angle by fork instead - splaying branches around a shared
   * centre - let a deep step on one branch drift onto a shallow step of its neighbour, because the
   * per-depth winding outgrew the per-fork splay.
   *
   * The walk is done here rather than reusing the order `tasks` arrives in, because that order
   * sends completed tasks to the end: a chain step finished out of turn would be flung to the far
   * side of the ring, breaking the sequence and dragging its links across the whole zone. Several
   * chains need no sector arithmetic - a depth-first walk visits each as a contiguous run, so each
   * claims a contiguous wedge on its own.
   */
  const walkIndex = new Map<string, number>();
  {
    const present = new Set(chained.map((t) => t.id));
    const visit = (id: string): void => {
      if (walkIndex.has(id) || !present.has(id)) return;
      walkIndex.set(id, walkIndex.size);
      for (const next of chains[id]?.successorIds ?? []) visit(next);
    };
    for (const t of chained) {
      const blocker = chains[t.id].blockedBy;
      if (blocker === null || !present.has(blocker)) visit(t.id);
    }
    // Anything the walk never reached belongs to a cycle; place it rather than leaving it at angle 0.
    for (const t of chained) visit(t.id);
  }

  const place = (task: Task, index: number): OrbPlacement => {
    const meta = chains[task.id];
    let rest: Vec3;
    let chain: OrbChain | null = null;

    if (meta === undefined) {
      const i = loose.indexOf(task);
      const r = CONSTELLATION.spiralSpacing * Math.sqrt(i + CONSTELLATION.spiralStart);
      const a = spin + i * GOLDEN_ANGLE;
      rest = [cx + Math.cos(a) * r * CONSTELLATION.ellipseX, cy + Math.sin(a) * r, jitterZ(task.id)];
    } else {
      const depth = Math.min(meta.depth, CHAIN.maxDepth);
      const r = armRadius(armStart, depth);
      const a = armSpin + curl * (walkIndex.get(task.id) ?? 0);
      rest = [
        cx + Math.cos(a) * r * CONSTELLATION.ellipseX,
        cy + Math.sin(a) * r,
        CHAIN.depthLift + jitterZ(task.id, CHAIN.depthJitterFactor),
      ];
      chain = {
        rootId: meta.rootId,
        depth: meta.depth,
        locked: meta.locked,
        outOfOrder: meta.outOfOrder,
        unlockToken: meta.unlockToken,
      };
    }

    const placement: OrbPlacement = {
      task,
      spaceId: space.id,
      index,
      rest,
      radius: orbRadius(task),
      phase: [hash01(task.id, 1) * 6.283, hash01(task.id, 2) * 6.283, hash01(task.id, 3) * 6.283],
      chain,
    };
    byTaskId.set(task.id, placement);
    return placement;
  };

  const orbs = tasks.map(place);

  // Decorative tree over the loose orbs: each links to its nearest already-placed loose neighbour,
  // or the hub, which gives a crossing-free tree. Chained orbs are deliberately excluded.
  const looseIndices = orbs.map((o, i) => (o.chain === null ? i : -1)).filter((i) => i >= 0);
  const edges: DecorEdge[] = looseIndices.map((idx, n) => {
    const o = orbs[idx];
    let parent = -1;
    let best = Math.hypot(o.rest[0] - cx, o.rest[1] - cy);
    for (let m = 0; m < n; m++) {
      const j = looseIndices[m];
      const d = Math.hypot(o.rest[0] - orbs[j].rest[0], o.rest[1] - orbs[j].rest[1]);
      if (d < best) {
        best = d;
        parent = j;
      }
    }
    return { child: idx, parent };
  });

  const indexOf = new Map(orbs.map((o, i) => [o.task.id, i]));
  const links: ChainLink[] = [];
  for (const o of orbs) {
    const meta = o.chain === null ? undefined : chains[o.task.id];
    if (!meta || meta.blockedBy === null) continue;
    const from = indexOf.get(meta.blockedBy);
    const to = indexOf.get(o.task.id);
    // A blocker outside this zone's visible tasks (completed and hidden, say) has no orb to draw to.
    if (from === undefined || to === undefined) continue;
    links.push({ from, to, locked: meta.locked, outOfOrder: meta.outOfOrder, unlockToken: meta.unlockToken });
  }

  return { space, center: [cx, cy, 0], radius, orbs, edges, links };
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
