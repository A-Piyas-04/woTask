import { useEffect, useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';

export interface ConfirmDialogProps {
  title: string;
  /** One or two short lines. Say what will happen, including anything that is not obvious. */
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

/**
 * A deliberate stop before something that is hard to take back.
 *
 * Used sparingly and on purpose: deleting a space (which takes its tasks with it) and completing a
 * task whose chain says it is not its turn yet. Deleting a *task* gets no dialog - it is cheap and
 * one Ctrl+Z away - and that asymmetry is the point. A confirm on everything trains people to
 * dismiss confirms.
 *
 * Cancel is focused first, so the reflexive Enter is the safe answer.
 */
export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = 'Cancel', danger, onConfirm, onCancel }: ConfirmDialogProps) {
  const card = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useFocusTrap(card);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={card} className="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body">
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-body" lang="bn-BD en">
          {body}
        </p>
        <div className="confirm-actions">
          <button ref={cancel} className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
