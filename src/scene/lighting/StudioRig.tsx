import { Environment, Lightformer } from '@react-three/drei';
import { LIGHTING } from '../../contracts/tokens';

/** Procedural studio lighting. No HDRI file and no preset: everything is generated locally. */
export function StudioRig() {
  return (
    <>
      <ambientLight intensity={LIGHTING.ambient} />
      <directionalLight position={LIGHTING.key.position} intensity={LIGHTING.key.intensity} color={LIGHTING.key.color} />
      <directionalLight position={LIGHTING.fill.position} intensity={LIGHTING.fill.intensity} color={LIGHTING.fill.color} />
      <directionalLight position={LIGHTING.rim.position} intensity={LIGHTING.rim.intensity} color={LIGHTING.rim.color} />
      <Environment resolution={LIGHTING.envResolution} frames={1} background={false}>
        {LIGHTING.formers.map((f, i) => (
          <Lightformer
            key={i}
            form="rect"
            position={f.position}
            scale={f.scale}
            intensity={f.intensity}
            color={f.color}
            rotation={['rotationX' in f ? f.rotationX : 0, 'rotationY' in f ? f.rotationY : 0, 0]}
          />
        ))}
      </Environment>
    </>
  );
}
