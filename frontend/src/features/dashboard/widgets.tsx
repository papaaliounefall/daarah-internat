import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Circle, type LucideIcon } from 'lucide-react';
import { BrandPanel } from '../../components/ui/Brand';
import type { SetupStep } from './dashboardUtils';

/** Chiffre clé : toujours un lien vers le module concerné. */
export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  to: string;
  hint?: string;
  tone?: 'default' | 'warn' | 'danger';
  icon?: LucideIcon;
}> = ({ label, value, to, hint, tone = 'default', icon: Icon }) => (
  <Link
    to={to}
    className="group panel block p-4 transition-colors hover:border-brand-500"
    aria-label={`${label} : ${typeof value === 'string' || typeof value === 'number' ? value : ''} — ouvrir`}
  >
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {Icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700"><Icon className="h-4 w-4" aria-hidden /></span>}
    </div>
    <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
  </Link>
);

export const ChartCard: React.FC<{
  title: string;
  to?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, to, linkLabel = 'Ouvrir', children, className = '' }) => (
  <section className={`panel flex flex-col ${className}`}>
    <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {to && (
        <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
          {linkLabel} <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      )}
    </div>
    <div className="flex-1 p-4">{children}</div>
  </section>
);

/** État vide explicite d'un bloc : ce qui manque et où le créer. */
export const BlockEmpty: React.FC<{ title: string; hint?: string; to?: string; action?: string }> = ({ title, hint, to, action }) => (
  <div className="py-6 text-center">
    <p className="text-sm font-medium text-ink">{title}</p>
    {hint && <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">{hint}</p>}
    {to && action && <Link to={to} className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">{action}</Link>}
  </div>
);

/** Guide de démarrage affiché tant que l'installation n'est pas complète. */
export const SetupChecklist: React.FC<{ steps: SetupStep[] }> = ({ steps }) => (
  <section className="panel mb-6 border-gold-500/50 bg-gold-100/40 p-4" aria-label="Mise en route">
    <h2 className="text-sm font-semibold text-ink">Pour démarrer</h2>
    <p className="mb-3 text-sm text-slate-600">Quelques étapes suffisent pour mettre le Daara en service. Ce guide disparaît dès qu'elles sont terminées.</p>
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-start gap-2.5 text-sm">
          {s.done
            ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-label="Terminé" />
            : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-label="À faire" />}
          <div className={s.done ? 'text-slate-400 line-through' : ''}>
            <span className="font-medium text-ink">{i + 1}. </span>
            {s.to && !s.done ? <Link to={s.to} className="font-medium text-brand-700 underline">{s.label}</Link> : <span className={s.done ? '' : 'font-medium text-ink'}>{s.label}</span>}
            {!s.done && <span className="block text-xs text-slate-500">{s.hint}</span>}
          </div>
        </li>
      ))}
    </ol>
  </section>
);

export interface QuickAction { label: string; to: string; icon: LucideIcon }

/** Bandeau d'accueil du tableau de bord : salutation, contexte et raccourcis des tâches courantes. */
export const WelcomeBanner: React.FC<{ name: string; subtitle: string; actions: QuickAction[] }> = ({ name, subtitle, actions }) => (
  <BrandPanel className="mb-6 rounded-md px-5 py-5 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold sm:text-2xl">Bonjour{name ? `, ${name}` : ''}</h1>
        <p className="mt-0.5 text-sm first-letter:uppercase text-brand-100">{subtitle}</p>
      </div>
      {actions.length > 0 && (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {actions.map(a => (
            <Link key={a.to + a.label} to={a.to}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-white/10 px-3.5 text-sm font-medium text-white ring-1 ring-white/25 transition-colors hover:bg-white/20 sm:flex-none">
              <a.icon className="h-4 w-4" aria-hidden /> {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  </BrandPanel>
);
