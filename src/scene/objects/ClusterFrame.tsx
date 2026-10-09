import { Html } from '@react-three/drei';
import { useEffect, useMemo, type RefObject } from 'react';
import * as THREE from 'three';
import { SPACE_KIND_PLURALS } from '../../contracts/task';
import { CLUSTER, PALETTE } from '../../contracts/tokens';
import type { Cluster } from '../layout';

interface Props {
  cluster: Cluster;
  labelLayer: RefObject<HTMLDivElement | null>;
}

function roundedRect({ minX, maxX, minY, maxY }: Cluster['rect']): THREE.BufferGeometry {
  const r = Math.min(CLUSTER.cornerRadius, (maxX - minX) / 2, (maxY - minY) / 2);
  const s = new THREE.Shape();
  s.moveTo(minX + r, minY);
  s.lineTo(maxX - r, minY);
  s.quadraticCurveTo(maxX, minY, maxX, minY + r);
  s.lineTo(maxX, maxY - r);
  s.quadraticCurveTo(maxX, maxY, maxX - r, maxY);
  s.lineTo(minX + r, maxY);
  s.quadraticCurveTo(minX, maxY, minX, maxY - r);
  s.lineTo(minX, minY + r);
  s.quadraticCurveTo(minX, minY, minX + r, minY);
  return new THREE.BufferGeometry().setFromPoints(s.getPoints(12));
}

/** Hairline outline and title around every space of one kind (Projects, Goals, Categories). */
export function ClusterFrame({ cluster, labelLayer }: Props) {
  const { rect, kind, count } = cluster;
  const line = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({ color: PALETTE.white, transparent: true, opacity: CLUSTER.outlineOpacity, depthWrite: false });
    return new THREE.LineLoop(roundedRect(rect), mat);
  }, [rect]);
  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line],
  );

  return (
    <group>
      <primitive object={line} position-z={-1} raycast={() => null} />
      <Html
        center
        portal={labelLayer as RefObject<HTMLElement>}
        position={[(rect.minX + rect.maxX) / 2, rect.maxY + CLUSTER.titleOffset, -1]}
        pointerEvents="none"
        zIndexRange={[5, 0]}
      >
        <div className="cluster-label" data-kind={kind}>
          <span className="cluster-name">
            <span className="kind-mark" data-kind={kind} />
            {SPACE_KIND_PLURALS[kind]}
          </span>
          <span className="cluster-count">
            {count} {count === 1 ? 'space' : 'spaces'}
          </span>
        </div>
      </Html>
    </group>
  );
}
