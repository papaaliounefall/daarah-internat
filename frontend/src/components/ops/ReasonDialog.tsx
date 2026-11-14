import React, { useState } from 'react';
import { Button, Modal, TextAreaField, useToast } from '../ui';
import { isValidReason, plainErrorMessage } from '../../lib/apiErrors';

interface Props {
  title: string;
  message?: React.ReactNode;
  /** Libellé du champ (« Motif de l'annulation »). */
  label: string;
  confirmLabel: string;
  danger?: boolean;
  /** Motif obligatoire (≥ 3 caractères) ; sinon facultatif. */
  required?: boolean;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

/** Confirmation avec saisie d'un motif : annulation, refus, sortie définitive… Jamais de suppression. */
export const ReasonDialog: React.FC<Props> = ({ title, message, label, confirmLabel, danger = true, required = true, onConfirm, onClose }) => {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = required ? isValidReason(reason) : true;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      const msg = plainErrorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Retour</Button>
          <Button type="submit" form="reason-form" variant={danger ? 'danger' : 'primary'} loading={busy} disabled={!valid}>{confirmLabel}</Button>
        </>
      }
    >
      <form id="reason-form" onSubmit={submit} className="space-y-3">
        {message && <div className="text-sm text-slate-700">{message}</div>}
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <TextAreaField
          label={label}
          required={required}
          value={reason}
          onChange={e => setReason(e.target.value)}
          hint={required ? 'Au moins 3 caractères. Le motif est conservé dans le journal.' : undefined}
          autoFocus
        />
      </form>
    </Modal>
  );
};
