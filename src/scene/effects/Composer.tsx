import { Bloom, ChromaticAberration, EffectComposer, N8AO, SMAA, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import type { ReactElement } from 'react';
import { Vector2 } from 'three';
import type { QualityTier } from '../../contracts/events';
import { EFFECTS, QUALITY } from '../../contracts/tokens';

const caOffset = new Vector2(...EFFECTS.chromaticAberration.offset);

export function Composer({ quality }: { quality: QualityTier }) {
  const q = QUALITY[quality];
  if (quality === 'low') return null;

  const effects: ReactElement[] = [];
  if (q.ao) effects.push(<N8AO key="ao" aoRadius={EFFECTS.ao.aoRadius} intensity={EFFECTS.ao.intensity} distanceFalloff={EFFECTS.ao.distanceFalloff} />);
  if (q.bloom)
    effects.push(
      <Bloom
        key="bloom"
        intensity={EFFECTS.bloom.intensity}
        luminanceThreshold={EFFECTS.bloom.luminanceThreshold}
        luminanceSmoothing={EFFECTS.bloom.luminanceSmoothing}
        mipmapBlur={EFFECTS.bloom.mipmapBlur}
      />,
    );
  if (q.chromaticAberration)
    effects.push(<ChromaticAberration key="ca" offset={caOffset} radialModulation={false} modulationOffset={0} blendFunction={BlendFunction.NORMAL} />);
  effects.push(<Vignette key="vignette" offset={EFFECTS.vignette.offset} darkness={EFFECTS.vignette.darkness} />);
  if (q.smaa) effects.push(<SMAA key="smaa" />);

  return <EffectComposer multisampling={0}>{effects}</EffectComposer>;
}
