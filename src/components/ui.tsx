'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { avatarTone, campusLabel, initials, statusClass } from '@/lib/client-api';

const ToastContext = createContext<(message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback((text: string) => {
    setMessage(text);
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 3200);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        id="toast"
        role="status"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translate(-50%, 0)' : 'translate(-50%, 15px)',
        }}
      >
        {message}
      </div>
    </ToastContext.Provider>
  );
}

export function Modal({
  open,
  onClose,
  title,
  hint,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="formdialog"
      style={wide ? { width: 'min(820px, calc(100vw - 28px))' } : undefined}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={onClose}
    >
      <div className="formpanel">
        <div className="paneltop">
          <div>
            <h2>{title}</h2>
            {hint ? <div className="tiny muted" style={{ margin: '8px 0 0' }}>{hint}</div> : null}
          </div>
          <button className="btn subtle" type="button" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function PageHead({
  kicker,
  title,
  intro,
  actions,
}: {
  kicker: string;
  title: string;
  intro?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="pagehead">
      <div>
        <div className="kicker">{kicker}</div>
        <h1>{title}</h1>
        {intro ? <div className="intro">{intro}</div> : null}
      </div>
      {actions ? <div className="headactions">{actions}</div> : null}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <span className={statusClass(status)}>{status}</span>;
}

export function CampusTag({ campus }: { campus: string | null | undefined }) {
  return <span className="campus-tag">{campusLabel(campus)}</span>;
}

export function Avatar({
  first,
  last,
  gender,
  photo,
  size = 34,
}: {
  first: string;
  last: string;
  gender?: string;
  photo?: string;
  size?: number;
}) {
  if (photo) {
    return (
      <img
        className="avatar"
        src={photo}
        alt={`${first} ${last}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`avatar ${avatarTone(gender ?? '')}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {initials(first, last)}
    </span>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      <b>{value === '' || value === null || value === undefined ? '—' : value}</b>
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="tiny muted" style={{ padding: '18px 4px' }}>{label}</div>;
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return <div className="error" style={{ minHeight: 0 }}>{message}</div>;
}

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(value: boolean) => void>(() => {});

  const confirm = useCallback((next: ConfirmOptions) => (
    new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(next);
    })
  ), []);

  function settle(value: boolean) {
    resolver.current(value);
    setOptions(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(options)}
        onClose={() => settle(false)}
        title={options?.title ?? 'Confirm action'}
        hint={options?.message}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" type="button" onClick={() => settle(false)}>
            {options?.cancelLabel ?? 'Cancel'}
          </button>
          <button
            className={options?.danger ? 'btn danger' : 'btn primary'}
            type="button"
            onClick={() => settle(true)}
          >
            {options?.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="skeleton-row">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <td key={columnIndex}>
              <span className="skeleton" style={{ width: columnIndex === 1 ? '72%' : '52%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function EmptyState({
  icon = '⌕',
  title,
  message,
  action,
}: {
  icon?: string;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <b>{title}</b>
      <p>{message}</p>
      {action}
    </div>
  );
}
