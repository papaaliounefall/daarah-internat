import React from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { Button } from './Button';

export const Spinner: React.FC<{ label?: string }> = ({ label = 'Chargement…' }) => (
  <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
  </div>
);

export const EmptyState: React.FC<{ title: string; hint?: string; action?: React.ReactNode }> = ({ title, hint, action }) => (
  <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
    <Inbox className="h-8 w-8 text-slate-300" aria-hidden />
    <p className="font-medium text-ink">{title}</p>
    {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
    {action}
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
    <AlertCircle className="h-8 w-8 text-danger" aria-hidden />
    <p className="max-w-md text-sm text-slate-700">{message}</p>
    {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Réessayer</Button>}
  </div>
);

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold';
const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-brand-50 text-brand-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-800',
  info: 'bg-sky-50 text-sky-800',
  gold: 'bg-gold-100 text-gold-700',
};
export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode }> = ({ tone = 'neutral', children }) => (
  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
);

export const PageHeader: React.FC<{ title: string; description?: string; actions?: React.ReactNode }> = ({ title, description, actions }) => (
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);
