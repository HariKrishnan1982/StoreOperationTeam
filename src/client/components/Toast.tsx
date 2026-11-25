import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export interface ToastMessage {
  id: number;
  tone: 'success' | 'error' | 'info';
  text: string;
}

export interface ToastRegionProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

export function ToastRegion({ toasts, onDismiss }: ToastRegionProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-region" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`toast toast-${toast.tone}`}
        >
          <span>{toast.text}</span>
          <IconButton label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
            <X size={16} aria-hidden="true" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
