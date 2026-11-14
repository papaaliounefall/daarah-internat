import React from 'react';

/** Étoile à huit branches (khatam), motif géométrique islamique, très discret. */
const STAR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.07' stroke-width='1'%3E%3Crect x='20' y='20' width='32' height='32'/%3E%3Crect x='20' y='20' width='32' height='32' transform='rotate(45 36 36)'/%3E%3Ccircle cx='36' cy='36' r='5'/%3E%3C/g%3E%3C/svg%3E\")";

/** Bandeau vert institutionnel uni avec motif discret (pas de dégradé). */
export const BrandPanel: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`relative overflow-hidden bg-brand-800 text-white ${className}`} style={{ backgroundImage: STAR }}>
    <div className="relative">{children}</div>
  </div>
);

export const Logo: React.FC<{ className?: string }> = ({ className = 'h-12 w-auto' }) => (
  <img src="/logo.png" alt="Logo du Daara Internat Shaykh Aliou Fatima" className={className} />
);

/** Identité complète, telle que sur la carte officielle. */
export const Identity: React.FC<{ tone?: 'light' | 'dark'; align?: 'left' | 'center' }> = ({ tone = 'dark', align = 'left' }) => {
  const light = tone === 'light';
  return (
    <div className={align === 'center' ? 'text-center' : ''}>
      <p className={`font-arabic text-2xl leading-snug ${light ? 'text-gold-100' : 'text-gold-700'}`} lang="ar" dir="rtl"
        style={{ textAlign: align === 'center' ? 'center' : 'right' }}>
        مدرسة الشيخ علي فاطمة الداخلية
      </p>
      <p className={`mt-1 text-lg font-semibold leading-tight ${light ? 'text-white' : 'text-brand-800'}`}>Daara Internat Shaykh Aliou Fatima</p>
      <p className={`text-sm ${light ? 'text-brand-100' : 'text-slate-500'}`}>Kahone · Kaolack · Sénégal</p>
    </div>
  );
};
