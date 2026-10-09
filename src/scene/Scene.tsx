import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { QualityTier } from '../contracts/events';
import type { Region, Task } from '../contracts/task';
import { CAMERA, PALETTE, QUALITY, regionHue } from '../contracts/tokens';
import { CameraRig, type CameraFocus } from './CameraRig';
import { Composer } from './effects/Composer';
import { pointerState, type PositionRegistry } from './interaction';
import { computeLayout } from './layout';
import { StudioRig } from './lighting/StudioRig';
import { Constellation } from './objects/Constellation';
import { ParallaxBackground } from './objects/ParallaxBackground';
import { TaskOrb } from './objects/TaskOrb';
import './scene.css';

export interface SceneProps {
  regions: Region[];
  /** Ordered tasks per region (already filtered for visibility). */
  tasksByRegion: Record<string, Task[]>;
  activeRegionId: string | null;
  selectedId: string | null;
  quality: QualityTier;
  ambient: boolean;
  reducedMotion: boolean;
  onSelect(id: string | null): void;
  onSelectRegion(id: string): void;
  onOpen(id: string): void;
  onToggle(id: string): void;
}

function usePageActive(): boolean {
  const [active, setActive] = useState(() => document.visibilityState === 'visible' && document.hasFocus());
  useEffect(() => {
    const update = () => setActive(document.visibilityState === 'visible' && document.hasFocus());
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return active;
}

/**
 * One persistent canvas. With ambient motion on, it renders continuously only while the window is
 * focused and visible; otherwise it renders on demand, so a background window costs ~0% GPU.
 */
export function Scene(props: SceneProps) {
  const { regions, tasksByRegion, activeRegionId, selectedId, quality, ambient, reducedMotion } = props;
  const q = QUALITY[quality];
  const labelLayer = useRef<HTMLDivElement>(null);
  const registry = useMemo<PositionRegistry>(() => new Map(), []);
  const pageActive = usePageActive();
  const animate = ambient && !reducedMotion && pageActive;

  const layout = useMemo(() => computeLayout(regions, tasksByRegion), [regions, tasksByRegion]);
  const activeRegion = regions.find((g) => g.id === activeRegionId);
  const accent = activeRegion ? regionHue(activeRegion.colorIndex) : PALETTE.accent;

  const focus = useMemo<CameraFocus | null>(() => {
    const sel = selectedId ? layout.byTaskId.get(selectedId) : undefined;
    if (sel) return { key: `task:${sel.task.id}`, x: sel.rest[0], y: sel.rest[1] };
    const zone = layout.zones.find((z) => z.region.id === activeRegionId);
    if (zone) return { key: `region:${zone.region.id}`, x: zone.center[0], y: zone.center[1] + CAMERA.zoneFocusOffsetY };
    return null;
  }, [layout, selectedId, activeRegionId]);

  const bgCenter = useMemo<[number, number]>(
    () => [(layout.bounds.minX + layout.bounds.maxX) / 2, (layout.bounds.minY + layout.bounds.maxY) / 2],
    [layout.bounds],
  );

  return (
    <div className="scene-root">
      <Canvas
        frameloop={animate ? 'always' : 'demand'}
        dpr={q.dpr}
        camera={{ position: [0, 0, CAMERA.distance], fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far }}
        gl={{ antialias: quality === 'low', powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
        onPointerMissed={() => {
          if (!pointerState.dragged) props.onSelect(null);
        }}
      >
        <color attach="background" args={[PALETTE.base]} />
        <Suspense fallback={null}>
          <StudioRig />
          <CameraRig focus={focus} bounds={layout.bounds} reducedMotion={reducedMotion} />
          <ParallaxBackground center={bgCenter} accent={accent} stars={q.stars} ambient={animate} />
          {layout.zones.map((zone) => (
            <Constellation
              key={zone.region.id}
              zone={zone}
              active={zone.region.id === activeRegionId}
              ambient={animate}
              registry={registry}
              labelLayer={labelLayer}
              onSelectRegion={props.onSelectRegion}
            />
          ))}
          {layout.zones.flatMap((zone) =>
            zone.orbs.map((orb) => (
              <TaskOrb
                key={orb.task.id}
                orb={orb}
                selected={orb.task.id === selectedId}
                regionColor={regionHue(zone.region.colorIndex)}
                ambient={animate}
                reducedMotion={reducedMotion}
                segments={q.sphereSegments}
                registry={registry}
                labelLayer={labelLayer}
                onSelect={props.onSelect}
                onOpen={props.onOpen}
                onToggle={props.onToggle}
              />
            )),
          )}
          <Composer quality={quality} />
        </Suspense>
      </Canvas>
      <div ref={labelLayer} className="label-layer" />
    </div>
  );
}
