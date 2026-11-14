import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Spinner } from '../ui';

const KEY = 'daara.sidebar.collapsed';
const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

function readCollapsed(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export const AppLayout: React.FC = () => {
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { pathname } = useLocation();

  // Le bouton menu ouvre le tiroir sur mobile et réduit/élargit le menu sur grand écran.
  const toggleMenu = useCallback(() => {
    if (isDesktop()) {
      setCollapsed(c => {
        try { localStorage.setItem(KEY, c ? '0' : '1'); } catch { /* préférence non conservée */ }
        return !c;
      });
    } else {
      setDrawer(d => !d);
    }
  }, []);

  // Le tiroir se ferme à chaque navigation ; la page repart en haut.
  useEffect(() => { setDrawer(false); window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={drawer} onClose={() => setDrawer(false)} collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={toggleMenu} menuOpen={drawer} />
        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Suspense fallback={<Spinner />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};
