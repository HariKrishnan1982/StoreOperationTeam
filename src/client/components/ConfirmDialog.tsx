import { useState } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Field } from './Field';
import { Input } from './Input';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  busy?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  requireReason = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Enter reason (at least 3 characters)',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (requireReason && trimmed.length < 3) {
      setError('Please enter at least 3 characters.');
      return;
    }
    setError('');
    setReason('');
    onConfirm(requireReason ? trimmed : undefined);
  };

  const handleClose = () => {
    setError('');
    setReason('');
    onCancel();
  };

  return (
    <Dialog open={open} title={title} onClose={handleClose}>
      <p className="muted">{message}</p>
      {requireReason ? (
        <Field id="confirm-reason" label={reasonLabel} error={error} required>
          <Input
            id="confirm-reason"
            value={reason}
            placeholder={reasonPlaceholder}
            aria-invalid={error ? 'true' : undefined}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError('');
            }}
          />
        </Field>
      ) : null}
      <div className="dialog-actions">
        <Button variant="secondary" onClick={handleClose} disabled={busy}>
          Back
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={handleConfirm} disabled={busy}>
          {busy ? 'Working...' : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
