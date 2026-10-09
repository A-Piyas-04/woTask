import { useFrame, useThree } from '@react-three/fiber';
import { easing } from 'maath';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAMERA, CHROME, MOTION } from '../contracts/tokens';
import { FRAME, pointerState } from './interaction';
import type { SceneLayout } from './layout';

export interface CameraFocus {
  /** Changing the key triggers a fly-to; the same key never re-centres after the user pans away. */
  key: string;
  x: number;
  y: number;
  /** World-space vertical extent to keep clear of the chrome: the zone title's baseline and the zone's lower edge. */
  frame?: { top: number; bottom: number };
}

/**
 * Camera y for a focus target: as close to `focus.y` as possible while the zone title stays
 * `CHROME.titleClearancePx` below the canvas top and the zone stays above the quick-capture bar.
 * If both cannot fit, the title wins.
 */
function framedY(focus: CameraFocus, distance: number, heightPx: number): number {
  if (!focus.frame) return focus.y;
  const fov = (CAMERA.fov * Math.PI) / 180;
  const pxPerWorld = heightPx / (2 * Math.tan(fov / 2) * distance);
  const sway = CAMERA.pointerParallax[1];
  const minY = focus.frame.top - (heightPx / 2 - CHROME.titleClearancePx - CHROME.zoneTitlePx / 2) / pxPerWorld + sway;
  const maxY = focus.frame.bottom + (heightPx / 2 - CHROME.inputBarPx - CHROME.titleClearancePx) / pxPerWorld - sway;
  return Math.max(minY, Math.min(focus.y, maxY));
}

interface Props {
  focus: CameraFocus | null;
  bounds: SceneLayout['bounds'];
  /** Zoom-out limit; grows with the universe. */
  maxDistance: number;
  /** Far clipping distance needed to keep the background in view at `maxDistance`. */
  far: number;
  reducedMotion: boolean;
}

/**
 * Drag to pan (with momentum), wheel to zoom, mouse position sways the camera for parallax.
 * The canvas is the only element that receives these gestures; the DOM overlay passes them through.
 */
export function CameraRig({ focus, bounds, maxDistance, far, reducedMotion }: Props) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  const target = useRef(new THREE.Vector3(focus?.x ?? 0, focus?.y ?? 0, CAMERA.distance));
  const look = useMemo(() => new THREE.Vector3(target.current.x, target.current.y, 0), []);
  const velocity = useRef(new THREE.Vector2());
  const sway = useRef(new THREE.Vector2());
  const flying = useRef(false);
  const live = useRef({ bounds, size, reducedMotion, focus, maxDistance });
  live.current = { bounds, size, reducedMotion, focus, maxDistance };
  const focusKey = focus?.key;

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || camera.far === far) return;
    camera.far = far;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, far, invalidate]);

  useEffect(() => {
    camera.position.set(target.current.x, target.current.y, target.current.z);
    camera.lookAt(look);
  }, [camera, look]);

  useEffect(() => {
    const f = live.current.focus;
    if (!f) return;
    target.current.x = f.x;
    target.current.y = framedY(f, target.current.z, live.current.size.height);
    velocity.current.set(0, 0);
    flying.current = true;
    invalidate();
  }, [focusKey, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    let lastT = 0;
    let pointerId = -1;

    const worldPerPixel = () => {
      const fov = (CAMERA.fov * Math.PI) / 180;
      return (2 * Math.tan(fov / 2) * camera.position.z) / Math.max(1, live.current.size.height);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      pointerState.down = true;
      pointerState.dragged = false;
      pointerId = e.pointerId;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      lastT = performance.now();
      velocity.current.set(0, 0);
      flying.current = false;
    };
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      sway.current.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
      if (pointerState.down && e.pointerId === pointerId) {
        if (!pointerState.dragged && Math.hypot(e.clientX - startX, e.clientY - startY) > CAMERA.dragThresholdPx) {
          pointerState.dragged = true;
          el.setPointerCapture(e.pointerId);
          document.body.style.cursor = 'grabbing';
        }
        if (pointerState.dragged) {
          const k = worldPerPixel();
          const dx = (e.clientX - lastX) * k;
          const dy = (e.clientY - lastY) * k;
          target.current.x -= dx;
          target.current.y += dy;
          const now = performance.now();
          const dt = Math.max(1, now - lastT) / 1000;
          velocity.current.set((-dx / dt) * 0.6 + velocity.current.x * 0.4, (dy / dt) * 0.6 + velocity.current.y * 0.4);
          lastT = now;
        }
        lastX = e.clientX;
        lastY = e.clientY;
      }
      invalidate();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      pointerState.down = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (pointerState.dragged) document.body.style.cursor = '';
      if (performance.now() - lastT > 80) velocity.current.set(0, 0);
      pointerId = -1;
      invalidate();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = target.current;
      if (e.shiftKey) {
        t.x += e.deltaY * worldPerPixel();
      } else {
        t.z = THREE.MathUtils.clamp(t.z * (1 + e.deltaY * CAMERA.zoomPerWheelPixel), CAMERA.minDistance, live.current.maxDistance);
      }
      invalidate();
    };
    const onLeave = () => {
      sway.current.set(0, 0);
      invalidate();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('wheel', onWheel);
    };
  }, [gl, camera, invalidate]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 1 / 20);
    const { bounds: b, reducedMotion: rm } = live.current;
    const t = target.current;
    const v = velocity.current;
    const k = rm ? 0.0001 : 1;

    if (!pointerState.down && v.lengthSq() > 1e-4) {
      t.x += v.x * dt;
      t.y += v.y * dt;
      v.multiplyScalar(Math.exp(-MOTION.panFriction * dt));
    } else if (!pointerState.down) {
      v.set(0, 0);
    }
    t.x = THREE.MathUtils.clamp(t.x, b.minX, b.maxX);
    t.y = THREE.MathUtils.clamp(t.y, b.minY, b.maxY);
    t.z = Math.min(t.z, live.current.maxDistance);

    const smooth = (flying.current ? MOTION.cameraFocus.smoothTime : MOTION.camera.smoothTime) * k;
    const swayX = rm ? 0 : sway.current.x * CAMERA.pointerParallax[0];
    const swayY = rm ? 0 : sway.current.y * CAMERA.pointerParallax[1];

    let moving = easing.damp3(look, [t.x, t.y, 0], smooth, dt);
    moving = easing.damp3(camera.position, [t.x + swayX, t.y + swayY, t.z], smooth, dt) || moving;
    camera.lookAt(look);
    if (!moving) flying.current = false;
    if (moving || v.lengthSq() > 1e-4) invalidate();
  }, FRAME.camera);

  return null;
}
