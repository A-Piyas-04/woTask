import type * as THREE from 'three';

/**
 * Shared per-canvas interaction state. The camera rig writes it; orbs read it so a drag
 * that ends over a sphere does not count as a click.
 */
export const pointerState = {
  down: false,
  dragged: false,
};

/** Live (animated) orb positions, written by orbs and read by the connection lines. */
export type PositionRegistry = Map<string, THREE.Vector3>;

/** useFrame priorities. All negative: positive priorities would disable automatic rendering. */
export const FRAME = {
  camera: -4,
  orbs: -3,
  lines: -2,
} as const;
