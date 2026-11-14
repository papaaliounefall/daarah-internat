import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { useAuth } from '../../stores/authStore';
import { BrandPanel, Logo } from '../../components/ui/Brand';
import { Button, Field } from '../../components/ui';

export const LoginPage: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || '/app'} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(location.state?.from || '/app', { replace: true });
    } catch (err: any) {
      setError(err?.response?.status === 401 ? 'Identifiant ou mot de passe incorrect.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      {/* Identité : bandeau en haut sur mobile, colonne à gauche sur grand écran */}
      <BrandPanel className="flex items-center justify-center px-6 py-8 lg:py-0">
        <div className="mx-auto flex max-w-md flex-row items-center gap-4 lg:flex-col lg:gap-6 lg:text-center">
          <Logo className="h-16 w-auto shrink-0 lg:h-44" />
          <div className="min-w-0 lg:space-y-1">
            <p className="font-arabic text-xl leading-snug text-gold-100 lg:text-3xl" lang="ar" dir="rtl">مدرسة الشيخ علي فاطمة الداخلية</p>
            <p className="font-arabic hidden text-lg text-gold-100/90 lg:block" lang="ar" dir="rtl">لتحفيظ القرآن · كاهون كولاك - السنغال</p>
            <h1 className="mt-1 text-base font-semibold leading-tight lg:mt-3 lg:text-xl">Daara Internat Shaykh Aliou Fatima</h1>
            <p className="text-sm text-brand-100">Internat de mémorisation du Saint Coran</p>
            <p className="hidden text-sm text-brand-100 lg:block">Kahone · Kaolack · Sénégal</p>
          </div>
        </div>
      </BrandPanel>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold text-ink">Connexion</h2>
          <p className="mt-1 text-sm text-slate-500">Accédez à votre espace de gestion.</p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <Field label="Identifiant" required>
              {id => (
                <input id={id} className="input h-11" autoComplete="username" autoCapitalize="none" autoFocus required
                  value={username} onChange={e => setUsername(e.target.value)} />
              )}
            </Field>
            <Field label="Mot de passe" required>
              {id => (
                <div className="relative">
                  <input id={id} className="input h-11 pr-11" type={show ? 'text' : 'password'} autoComplete="current-password" required
                    value={password} onChange={e => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShow(s => !s)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-ink"
                    aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </Field>
            <Button type="submit" className="h-11 w-full" loading={busy} disabled={!username || !password}>Se connecter</Button>
          </form>

          <p className="mt-6 text-sm text-slate-500">
            Mot de passe oublié ? Contactez la direction du Daara pour le faire réinitialiser.
          </p>
          <Link to="/" className="mt-6 inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Retour au site du Daara
          </Link>
        </div>
      </main>
    </div>
  );
};
