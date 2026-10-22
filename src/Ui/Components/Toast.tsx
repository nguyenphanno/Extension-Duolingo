/**
 * Toast.tsx — ephemeral feedback, anchored to the bottom of the surface.
 */
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon, InfoIcon } from '../Icons/Icons';
import { createId } from '@Shared/Utils/Id';

export type ToastLevel = 'success' | 'warn' | 'error' | 'info';

export interface ToastItem {
  id: string;
  level: ToastLevel;
  message: string;
}

const ICONS: Record<ToastLevel, ReactNode> = {
  success: <CheckIcon size={16} />,
  warn: <AlertIcon size={16} />,
  error: <AlertIcon size={16} />,
  info: <InfoIcon size={16} />,
};

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (level: ToastLevel, message: string) => {
      const id = createId('toast');
      setItems((current) => [...current.slice(-2), { id, level, message }]);
      setTimeout(() => dismiss(id), 3600);
    },
    [dismiss],
  );

  return { items, push, dismiss };
}

export function ToastStack({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toasts">
      {items.map((item) => (
        <div key={item.id} className={`toast toast--${item.level}`} onClick={() => onDismiss(item.id)} role="status">
          {ICONS[item.level]}
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}
