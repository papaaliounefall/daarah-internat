import React from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const styles: Record<Variant, string> = {
  primary: 'bg-brand-800 text-white hover:bg-brand-900 disabled:bg-brand-800/50',
  secondary: 'border border-line bg-white text-ink hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-danger text-white hover:bg-red-800 disabled:bg-danger/50',
  ghost: 'text-brand-800 hover:bg-brand-50 disabled:text-slate-400',
};

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  size?: 'sm' | 'md';
}

export const Button: React.FC<Props> = ({ variant = 'primary', loading, size = 'md', className = '', children, disabled, type = 'button', ...rest }) => (
  <button
    type={type}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${
      size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'
    } ${styles[variant]} ${className}`}
    {...rest}
  >
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
    {children}
  </button>
);
