import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { QualityTier } from '../contracts/events';
import type { Space, Task } from '../contracts/task';
import { CAMERA, CONSTELLATION, EFFECTS, PALETTE, PARALLAX, QUALITY } from '../contracts/tokens';
import { CameraRig, type CameraFocus } from './CameraRig';
import { Composer } from './effects/Composer';
import { pointerState, type PositionRegistry } from './interaction';
import { LabelCuller, useLabelRegistry } from './labels';
import { backgroundScale, computeLayout, maxZoomDistance } from './layout';
import { StudioRig } from './lighting/StudioRig';
import { spaceRamp } from './materials/materials';
import { ClusterFrame } from './objects/ClusterFrame';
import { Constellation, type SpaceStats } from './objects/Constellation';
import { ParallaxBackground } from './objects/ParallaxBackground';
import { TaskOrb } from './objects/TaskOrb';
import './scene.css';

export interface SceneProps {
  spaces: Space[];
  /** Ordered tasks per space (already filtered for visibility). */
  tasksBySpace: Record<string, Task[]>;
  /** Open/done counts per space over all tasks, independent of the show-completed filter. */
  spaceStats: Record<string, SpaceStats>;
  activeSpaceId: string | null;
  /** Changes whenever a space is chosen; re-centres the camera even on the already-active space. */
  spaceFocusToken: number;
  selectedId: string | null;
  quality: QualityTier;
  ambient: boolean;
  reducedMotion: boolean;
  /** Dev fixtures for visual tests: hide every DOM label so only WebGL pixels are captured. */
  hideLabels?: boolean;
  onSelect(id: string | null): void;
  onSelectSpace(id: string): void;
  onOpen(id: string): void;
  onToggle(id: string): void;
}

const EMPTY_STATS: SpaceStats = { open: 0, done: 0 };

function usePageActive(): boolean {
  const [active, setActive] = useState(() => document.visibilityState === 'visible' && document.hasFocus());
  useEffect(() => {
    const onFocus = () => setActive(document.visibilityState === 'visible');
    const onBlur = () => setActive(false);
    const onVisibility = () => setActive(document.visibilityState === 'visible' && document.hasFocus());
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return active;
}

/**
 * One persistent canvas. With ambient motion on, it renders continuously only while the window is
 * focused and visible; otherwise it renders on demand, so a background window costs ~0% GPU.
 */
export function Scene(props: SceneProps) {
  const { spaces, tasksBySpace, spaceStats, activeSpaceId, spaceFocusToken, selectedId, quality, ambient, reducedMotion } = props;
  const q = QUALITY[quality];
  const labelLayer = useRef<HTMLDivElement>(null);
  const registry = useMemo<PositionRegistry>(() => new Map(), []);
  const labels = useLabelRegistry();
  const pageActive = usePageActive();
  const animate = ambient && !reducedMotion && pageActive;

  const layout = useMemo(() => computeLayout(spaces, tasksBySpace), [spaces, tasksBySpace]);
  const activeSpace = spaces.find((g) => g.id === activeSpaceId);
  const tint = activeSpace ? spaceRamp(activeSpace.colorIndex).base : null;

  const focus = useMemo<CameraFocus | null>(() => {
    const sel = selectedId ? layout.byTaskId.get(selectedId) : undefined;
    if (sel) return { key: `task:${sel.task.id}`, x: sel.rest[0], y: sel.rest[1] };
    const zone = layout.zones.find((z) => z.space.id === activeSpaceId);
    if (!zone) return null;
    const ry = zone.radius / CONSTELLATION.ellipseX;
    return {
      key: `space:${zone.space.id}:${spaceFocusToken}`,
      x: zone.center[0],
      y: zone.center[1],
      frame: { top: zone.center[1] + ry + CONSTELLATION.zoneLabelOffset, bottom: zone.center[1] - ry },
    };
  }, [layout, selectedId, activeSpaceId, spaceFocusToken]);

  const bgCenter = useMemo<[number, number]>(
    () => [(layout.bounds.minX + layout.bounds.maxX) / 2, (layout.bounds.minY + layout.bounds.maxY) / 2],
    [layout.bounds],
  );
  const zoom = useMemo(() => {
    const maxDistance = maxZoomDistance(layout.bounds);
    // Quantised so small layout changes do not regenerate the star field.
    const bgScale = Math.ceil(backgroundScale(layout.bounds, maxDistance, PARALLAX.backdrop.z, PARALLAX.backdrop.size) * 2) / 2;
    return { maxDistance, bgScale, far: Math.max(CAMERA.far, maxDistance - PARALLAX.backdrop.z + CAMERA.boundsMargin * 4) };
  }, [layout.bounds]);
  // Keep star density roughly constant as the background stretches, within a fixed budget.
  const stars = Math.round(q.stars * Math.min(zoom.bgScale * zoom.bgScale, 4));

  return (
    <div className={`scene-root${props.hideLabels ? ' hide-labels' : ''}`}>
      <Canvas
        frameloop={animate ? 'always' : 'demand'}
        dpr={q.dpr}
        camera={{ position: [0, 0, CAMERA.distance], fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far }}
        gl={{ antialias: quality === 'low', powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = EFFECTS.toneMappingExposure;
        }}
        onPointerMissed={() => {
          if (!pointerState.dragged) props.onSelect(null);
        }}
      >
        <color attach="background" args={[PALETTE.base]} />
        <Suspense fallback={null}>
          <StudioRig />
          <CameraRig focus={focus} bounds={layout.bounds} maxDistance={zoom.maxDistance} far={zoom.far} reducedMotion={reducedMotion} />
          <ParallaxBackground center={bgCenter} scale={zoom.bgScale} tint={tint} stars={stars} ambient={animate} />
          {layout.clusters.map((cluster) => (
            <ClusterFrame key={cluster.kind} cluster={cluster} labelLayer={labelLayer} />
          ))}
          {layout.zones.map((zone) => (
            <Constellation
              key={zone.space.id}
              zone={zone}
              ramp={spaceRamp(zone.space.colorIndex)}
              stats={spaceStats[zone.space.id] ?? EMPTY_STATS}
              active={zone.space.id === activeSpaceId}
              ambient={animate}
              spacing={layout.zoneSpacing}
              registry={registry}
              labelLayer={labelLayer}
              onSelectSpace={props.onSelectSpace}
            />
          ))}
          {layout.zones.flatMap((zone) =>
            zone.orbs.map((orb) => (
              <TaskOrb
                key={orb.task.id}
                orb={orb}
                selected={orb.task.id === selectedId}
                ramp={spaceRamp(zone.space.colorIndex)}
                ambient={animate}
                reducedMotion={reducedMotion}
                segments={q.sphereSegments}
                labelEligible={zone.space.id === activeSpaceId}
                registry={registry}
                labels={labels}
                labelLayer={labelLayer}
                onSelect={props.onSelect}
                onOpen={props.onOpen}
                onToggle={props.onToggle}
              />
            )),
          )}
          <LabelCuller registry={labels} activeSpaceId={activeSpaceId} />
          <Composer quality={quality} />
        </Suspense>
      </Canvas>
      <div ref={labelLayer} className="label-layer" />
    </div>
  );
}
