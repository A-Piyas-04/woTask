import { useEffect, useRef, useState } from 'react';
import { MOTION } from '../contracts/tokens';
import { useReducedMotion } from './useReducedMotion';

export type PanelState = 'open' | 'leaving';

/**
 * Keeps a panel mounted long enough to animate out.
 *
 * Panels used to appear with a slide and then simply vanish, which reads as a glitch rather than a
 * dismissal - and because the task panel and the space panel occupy the same corner and the store
 * closes one when the other opens, swapping between them blinked.
 *
 * `last` holds the final non-null value so the panel can still render its content on the way out,
 * after the store has already forgotten it.
 */
export function useExitTransition<T>(value: T | undefined): { value: T | undefined; state: PanelState } {
  const reducedMotion = useReducedMotion();
  const [, force] = useState(0);
  const last = useRef<T | undefined>(value);
  const timer = useRef<number | undefined>(undefined);
  const leaving = useRef(false);

  if (value !== undefined) {
    last.current = value;
    leaving.current = false;
    window.clearTimeout(timer.current);
  }

  useEffect(() => {
    if (value !== undefined || last.current === undefined || leaving.current) return;
    if (reducedMotion) {
      last.current = undefined;
      return;
    }
    leaving.current = true;
    force((n) => n + 1);
    timer.current = window.setTimeout(() => {
      last.current = undefined;
      leaving.current = false;
      force((n) => n + 1);
    }, MOTION.ui.panelOutMs);
  }, [value, reducedMotion]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { value: value ?? last.current, state: value === undefined && leaving.current ? 'leaving' : 'open' };
}
