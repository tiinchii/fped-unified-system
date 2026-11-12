import { useEffect, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  /** For a window with a lot in it (a whole procurement record). */
  wide?: boolean;
}

/** Closes with Esc. It does not close on a click outside, so a half-filled form is not lost by accident. */
export function Modal({ title, onClose, children, footer, wide }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label={title}>
      <div className={wide ? 'modal wide' : 'modal'}>
        <h3>{title}</h3>
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}
