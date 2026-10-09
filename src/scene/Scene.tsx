import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import type { QualityTier } from '../contracts/events';
import type { Task } from '../contracts/task';
import { LAYOUT, PALETTE, QUALITY } from '../contracts/tokens';
import { Composer } from './effects/Composer';
import { StudioRig } from './lighting/StudioRig';
import { Backdrop } from './objects/Backdrop';
import { TaskStack } from './objects/TaskStack';
import './scene.css';

export interface SceneProps {
  tasks: Task[];
  selectedId: string | null;
  accent: string;
  quality: QualityTier;
  reducedMotion: boolean;
  onSelect(id: string | null): void;
  onOpen(id: string): void;
  onToggle(id: string): void;
}

/** The single persistent canvas. Renders only on demand, so an idle window costs ~0% CPU/GPU. */
export function Scene({ tasks, selectedId, accent, quality, reducedMotion, onSelect, onOpen, onToggle }: SceneProps) {
  const q = QUALITY[quality];
  return (
    <div className="scene-root">
      <Canvas
        frameloop="demand"
        dpr={q.dpr}
        camera={{ position: LAYOUT.camera.position, fov: LAYOUT.camera.fov, near: LAYOUT.camera.near, far: LAYOUT.camera.far }}
        gl={{ antialias: quality === 'low', powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.transmissionResolutionScale = quality === 'high' ? 1 : 0.5;
        }}
        onPointerMissed={() => onSelect(null)}
      >
        <color attach="background" args={[PALETTE.base]} />
        <Suspense fallback={null}>
          <StudioRig />
          <Backdrop accent={accent} />
          <TaskStack
            tasks={tasks}
            selectedId={selectedId}
            accent={accent}
            reducedMotion={reducedMotion}
            onSelect={onSelect}
            onOpen={onOpen}
            onToggle={onToggle}
          />
          <Composer quality={quality} />
        </Suspense>
      </Canvas>
    </div>
  );
}
