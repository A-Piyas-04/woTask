import { useThree } from '@react-three/fiber';
import { Bloom, ChromaticAberration, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { useEffect, type ReactElement } from 'react';
import * as THREE from 'three';
import type { QualityTier } from '../../contracts/events';
import { EFFECTS, QUALITY } from '../../contracts/tokens';

const caOffset = new THREE.Vector2(...EFFECTS.chromaticAberration.offset);

/**
 * Tone mapping is applied exactly once. Without post-processing (Low) the renderer does it; with the
 * post chain the scene renders into HDR targets, which the renderer never tone-maps, so ACES runs
 * as the last colour step of the chain instead and the renderer's own pass is switched off.
 */
export function Composer({ quality }: { quality: QualityTier }) {
  const q = QUALITY[quality];
  const gl = useThree((s) => s.gl);
  const usePost = quality !== 'low';

  useEffect(() => {
    gl.toneMapping = usePost ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = EFFECTS.toneMappingExposure;
  }, [gl, usePost]);

  if (!usePost) return null;

  const effects: ReactElement[] = [];
  if (q.bloom)
    effects.push(
      <Bloom
        key="bloom"
        intensity={EFFECTS.bloom.intensity}
        luminanceThreshold={EFFECTS.bloom.luminanceThreshold}
        luminanceSmoothing={EFFECTS.bloom.luminanceSmoothing}
        mipmapBlur={EFFECTS.bloom.mipmapBlur}
        radius={EFFECTS.bloom.radius}
      />,
    );
  if (q.chromaticAberration)
    effects.push(<ChromaticAberration key="ca" offset={caOffset} radialModulation={false} modulationOffset={0} blendFunction={BlendFunction.NORMAL} />);
  effects.push(<Vignette key="vignette" offset={EFFECTS.vignette.offset} darkness={EFFECTS.vignette.darkness} />);
  effects.push(<ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />);
  if (q.smaa) effects.push(<SMAA key="smaa" />);

  return <EffectComposer multisampling={0}>{effects}</EffectComposer>;
}
