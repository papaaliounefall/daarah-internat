import React, { useId } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Reçoit l'id à poser sur le contrôle pour lier label et champ. */
  children: (id: string) => React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, hint, error, required, className = '', children }) => {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
};

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string };
export const TextField: React.FC<InputProps> = ({ label, hint, error, className, required, ...rest }) => (
  <Field label={label} hint={hint} error={error} required={required} className={className}>
    {id => <input id={id} required={required} className="input" {...rest} />}
  </Field>
);

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string };
export const SelectField: React.FC<SelectProps> = ({ label, hint, error, className, required, children, ...rest }) => (
  <Field label={label} hint={hint} error={error} required={required} className={className}>
    {id => <select id={id} required={required} className="input" {...rest}>{children}</select>}
  </Field>
);

type AreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string };
export const TextAreaField: React.FC<AreaProps> = ({ label, hint, error, className, required, ...rest }) => (
  <Field label={label} hint={hint} error={error} required={required} className={className}>
    {id => <textarea id={id} required={required} rows={3} className="input" {...rest} />}
  </Field>
);
