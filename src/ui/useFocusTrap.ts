import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside `ref` while it is open, and restores focus to whatever had it when the dialog
 * closes.
 *
 * Without this, Tab walks straight out of a modal and into the app behind it, which leaves a
 * keyboard user editing a form they can no longer see. Escape is handled globally in `shortcuts.ts`
 * (it has an ordering stack across all the overlays), so it is deliberately not handled here.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);

    if (!root.contains(document.activeElement)) items()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = items();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      // Only take focus back if it is still inside the dialog; if something else has claimed it
      // since, stealing it would be worse than leaving it alone.
      if (restoreTo?.isConnected && root.contains(document.activeElement)) restoreTo.focus();
    };
  }, [ref, active]);
}
