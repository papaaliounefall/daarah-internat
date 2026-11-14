import React from 'react';
import { NavLink } from 'react-router-dom';
import { NAV, NAV_GROUPS, canSee } from '../../app/navigation';
import { useAuth } from '../../stores/authStore';

interface Props {
  /** Tiroir mobile ouvert. */
  open: boolean;
  onClose: () => void;
  /** Rail réduit (icônes seules), grand écran uniquement. */
  collapsed: boolean;
}

/**
 * Menu latéral. Grand écran : fixe sur toute la hauteur de la fenêtre (il reste en place quand on fait défiler la page),
 * réductible en rail d'icônes. Mobile : tiroir ouvert par le bouton menu.
 */
export const Sidebar: React.FC<Props> = ({ open, onClose, collapsed }) => {
  const user = useAuth(s => s.user)!;
  const items = NAV.filter(i => canSee(i, user));

  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-40 bg-black/40 lg:hidden" aria-hidden />}
      <aside
        aria-label="Navigation principale"
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-white transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:translate-x-0 lg:shrink-0 ${
          collapsed ? 'lg:w-[4.25rem]' : 'lg:w-64'
        } ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className={`flex items-center gap-3 border-b border-line px-4 py-3 ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}>
          <img src="/logo.png" alt="Logo du Daara" className={`shrink-0 ${collapsed ? 'h-11 w-auto lg:h-9' : 'h-11 w-auto'}`} />
          <div className={`min-w-0 leading-tight ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="truncate text-sm font-semibold text-brand-800">Daara Shaykh Aliou Fatima</p>
            <p className="font-arabic truncate text-sm text-gold-700" lang="ar" dir="rtl">مدرسة الشيخ علي فاطمة</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV_GROUPS.map(group => {
            const list = items.filter(i => i.group === group);
            if (!list.length) return null;
            return (
              <div key={group} className="mb-3">
                <p className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${collapsed ? 'lg:hidden' : ''}`}>{group}</p>
                {collapsed && <div className="mx-3 mb-1 hidden border-t border-line lg:block" aria-hidden />}
                <ul className="space-y-0.5">
                  {list.map(item => (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        end={item.path === '/app'}
                        onClick={onClose}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${collapsed ? 'lg:justify-center lg:px-0' : ''} ${
                            isActive ? 'bg-brand-800 font-medium text-white' : 'text-slate-700 hover:bg-brand-50'
                          }`
                        }
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                        <span className={collapsed ? 'lg:sr-only' : ''}>{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
