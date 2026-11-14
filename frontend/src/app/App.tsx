import React, { lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { Spinner, ToastProvider } from '../components/ui';
import { LoginPage } from '../features/auth/LoginPage';
import { ProfilePage } from '../features/account/ProfilePage';
import { useAuth } from '../stores/authStore';
import { NAV, canSee } from './navigation';

// Chargement différé par module : le portail public et la connexion restent légers.
const lz = <T extends Record<string, React.ComponentType<any>>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(() => loader().then(m => ({ default: m[name] })));

const PublicPortal = lz(() => import('../features/public/PublicPortal'), 'PublicPortal');
const DashboardPage = lz(() => import('../features/dashboard/DashboardPage'), 'DashboardPage');
const ParentPortal = lz(() => import('../features/parents/ParentPortal'), 'ParentPortal');
const StudentList = lz(() => import('../features/students/StudentList'), 'StudentList');
const StudentDetailPage = lz(() => import('../features/students/StudentDetail'), 'StudentDetailPage');
const CartesPage = lz(() => import('../features/carte/CartesPage'), 'CartesPage');
const MemorizationPage = lz(() => import('../features/memorization/MemorizationPage'), 'MemorizationPage');
const QuranReaderPage = lz(() => import('../features/quran/QuranReader'), 'QuranReaderPage');
const ClassesModule = lz(() => import('../features/classes/ClassesModule'), 'ClassesModule');
const AttendanceModule = lz(() => import('../features/attendance/AttendanceModule'), 'AttendanceModule');
const VisitsPage = lz(() => import('../features/visits/VisitsPage'), 'VisitsPage');
const BoardingModule = lz(() => import('../features/boarding/BoardingModule'), 'BoardingModule');
const FinanceModule = lz(() => import('../features/finance/FinanceModule'), 'FinanceModule');
const SocialModule = lz(() => import('../features/social/SocialModule'), 'SocialModule');
const InventoryModule = lz(() => import('../features/inventory/InventoryModule'), 'InventoryModule');
const StaffModule = lz(() => import('../features/staff/StaffModule'), 'StaffModule');
const UsersPage = lz(() => import('../features/users/UsersPage'), 'UsersPage');
const SettingsPage = lz(() => import('../features/settings/SettingsPage'), 'SettingsPage');
const AuditPage = lz(() => import('../features/audit/AuditPage'), 'AuditPage');
const NotificationsPage = lz(() => import('../features/notifications/NotificationsPage'), 'NotificationsPage');

/** Exige une session ; impose le changement de mot de passe initial. */
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <Spinner label="Vérification de la session…" />;
  if (!user) return <Navigate to="/connexion" state={{ from: location.pathname }} replace />;
  if (user.mustChangePassword && location.pathname !== '/app/profil') return <Navigate to="/app/profil" replace />;
  return <>{children}</>;
};

/** Page réservée : affichage d'un message clair (le serveur refuse de toute façon les requêtes). */
const Guard: React.FC<{ path: string; children: React.ReactNode }> = ({ path, children }) => {
  const user = useAuth(s => s.user)!;
  const item = NAV.find(n => n.path === path);
  if (item && !canSee(item, user)) {
    return (
      <div role="alert" className="py-16 text-center">
        <p className="font-medium">Accès non autorisé</p>
        <p className="text-sm text-slate-500">Votre profil ne donne pas accès à cette page.</p>
      </div>
    );
  }
  return <>{children}</>;
};

const g = (path: string, el: React.ReactNode) => <Guard path={path}>{el}</Guard>;

const Home: React.FC = () => {
  const role = useAuth(s => s.user!.role);
  return role === 'PARENT' ? <ParentPortal /> : <DashboardPage />;
};

export const App: React.FC = () => {
  const init = useAuth(s => s.init);
  useEffect(() => { void init(); }, [init]);

  return (
    <BrowserRouter>
      <ToastProvider>
        <React.Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<PublicPortal />} />
            <Route path="/connexion" element={<LoginPage />} />
            <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
              <Route index element={<Home />} />
              <Route path="mes-enfants" element={g('/app/mes-enfants', <ParentPortal />)} />
              <Route path="talibes" element={g('/app/talibes', <StudentList />)} />
              <Route path="talibes/:id" element={g('/app/talibes', <StudentDetailPage />)} />
              <Route path="cartes" element={g('/app/cartes', <CartesPage />)} />
              <Route path="suivi" element={g('/app/suivi', <MemorizationPage />)} />
              <Route path="coran" element={<QuranReaderPage />} />
              <Route path="classes" element={g('/app/classes', <ClassesModule />)} />
              <Route path="presences" element={g('/app/presences', <AttendanceModule />)} />
              <Route path="visites" element={g('/app/visites', <VisitsPage />)} />
              <Route path="internat" element={g('/app/internat', <BoardingModule />)} />
              <Route path="finances" element={g('/app/finances', <FinanceModule />)} />
              <Route path="social" element={g('/app/social', <SocialModule />)} />
              <Route path="stocks" element={g('/app/stocks', <InventoryModule />)} />
              <Route path="personnel" element={g('/app/personnel', <StaffModule />)} />
              <Route path="utilisateurs" element={g('/app/utilisateurs', <UsersPage />)} />
              <Route path="parametres" element={g('/app/parametres', <SettingsPage />)} />
              <Route path="journal" element={g('/app/journal', <AuditPage />)} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="profil" element={<ProfilePage />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
      </ToastProvider>
    </BrowserRouter>
  );
};
