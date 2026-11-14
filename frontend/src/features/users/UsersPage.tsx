import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Search, UserX, Users } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuth } from '../../stores/authStore';
import { deactivateUser, listUsers, type UserQuery } from '../../services/users';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Spinner, useToast } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { ROLE_LABEL } from '../../app/navigation';
import { formatDateTime } from '../../lib/format';
import type { Role } from '../../types';
import type { ManagedUser } from '../../types/users';
import { UserFormModal } from './UserFormModal';
import { ParentLinksModal } from './ParentLinksModal';
import { canEditUser } from './usersUtils';

const PAGE_SIZE = 20;
const ROLE_TONE: Record<Role, 'gold' | 'info' | 'success' | 'neutral'> = { DIRECTEUR: 'gold', ASSISTANT: 'info', MAITRE: 'success', PARENT: 'neutral' };

export const UsersPage: React.FC = () => {
  const me = useAuth(s => s.user)!;
  const toast = useToast();
  const isDirector = me.role === 'DIRECTEUR';

  const [search, setSearch] = useState('');
  const dq = useDebouncedValue(search);
  const [role, setRole] = useState<Role | ''>('');
  const [active, setActive] = useState<UserQuery['active']>('true');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [dq, role, active]);

  const list = useFetch(() => listUsers({ page, pageSize: PAGE_SIZE, search: dq, role, active }), [page, dq, role, active]);

  const [editing, setEditing] = useState<ManagedUser | 'new' | null>(null);
  const [links, setLinks] = useState<ManagedUser | null>(null);
  const [toDeactivate, setToDeactivate] = useState<ManagedUser | null>(null);
  const [busy, setBusy] = useState(false);

  const deactivate = async () => {
    if (!toDeactivate) return;
    setBusy(true);
    try {
      await deactivateUser(toDeactivate.id);
      toast.success(`Le compte de ${toDeactivate.fullName} est désactivé.`);
      setToDeactivate(null);
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const count = list.data?.count ?? 0;
  const hasFilter = Boolean(dq || role || active !== 'true');

  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        description={isDirector ? 'Comptes du personnel et des familles, avec leurs droits.' : 'Comptes des parents et tuteurs.'}
        actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Nouveau compte</Button>}
      />

      <div className="panel">
        <div className="grid gap-3 border-b border-line p-3 sm:grid-cols-3">
          <div className="relative">
            <label htmlFor="usr-search" className="sr-only">Rechercher un compte</label>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input id="usr-search" type="search" className="input pl-9" placeholder="Nom, identifiant ou courriel" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div>
            <label htmlFor="usr-role" className="sr-only">Rôle</label>
            <select id="usr-role" className="input" value={role} onChange={e => setRole(e.target.value as Role | '')}>
              <option value="">Tous les rôles</option>
              {(Object.keys(ROLE_LABEL) as Role[]).filter(r => isDirector || r !== 'DIRECTEUR').map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="usr-active" className="sr-only">État du compte</label>
            <select id="usr-active" className="input" value={active} onChange={e => setActive(e.target.value as UserQuery['active'])}>
              <option value="true">Comptes actifs</option>
              <option value="false">Comptes désactivés</option>
              <option value="">Tous les comptes</option>
            </select>
          </div>
        </div>

        {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : count === 0 ? (
          hasFilter ? (
            <EmptyState title="Aucun compte ne correspond" hint="Modifiez la recherche ou les filtres." />
          ) : (
            <EmptyState title="Aucun compte" hint="Créez les comptes des maîtres, des assistants et des parents." action={<Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Nouveau compte</Button>} />
          )
        ) : (
          <>
            <div className={`overflow-x-auto ${list.loading ? 'opacity-60' : ''}`}>
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Compte</th>
                    <th scope="col">Rôle</th>
                    <th scope="col" className="hidden md:table-cell">Contact</th>
                    <th scope="col" className="hidden lg:table-cell">Dernière connexion</th>
                    <th scope="col" className="text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {list.data!.results.map(u => {
                    const editable = canEditUser(me.role, u.role);
                    const self = u.id === me.id;
                    return (
                      <tr key={u.id} className={u.isActive ? '' : 'text-slate-500'}>
                        <td>
                          <p className="font-medium">{u.fullName}{self && <span className="ml-1 text-xs font-normal text-slate-500">(vous)</span>}</p>
                          <p className="font-mono text-xs text-slate-500">{u.username}</p>
                          {!u.isActive && <Badge tone="danger">Désactivé</Badge>}
                          {u.mustChangePassword && u.isActive && <p className="text-xs text-warn">Mot de passe initial à changer</p>}
                        </td>
                        <td>
                          <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                          {u.role === 'ASSISTANT' && u.canViewFinance && <p className="mt-1 text-xs text-slate-500">Accès aux finances</p>}
                          {u.role === 'MAITRE' && <p className="mt-1 text-xs text-slate-500">{u.assignedClassIds.length} classe{u.assignedClassIds.length > 1 ? 's' : ''}</p>}
                          {u.role === 'PARENT' && <p className="mt-1 text-xs text-slate-500">{u.associatedStudentIds.length} enfant{u.associatedStudentIds.length > 1 ? 's' : ''}</p>}
                        </td>
                        <td className="hidden text-sm md:table-cell">
                          {u.phone && <p>{u.phone}</p>}
                          {u.email && <p className="text-slate-500">{u.email}</p>}
                          {!u.phone && !u.email && <span className="text-slate-400">—</span>}
                        </td>
                        <td className="hidden text-sm lg:table-cell">{u.lastLogin ? formatDateTime(u.lastLogin) : <span className="text-slate-400">Jamais</span>}</td>
                        <td>
                          <div className="flex flex-wrap justify-end gap-1">
                            {u.role === 'PARENT' && (
                              <Button variant="ghost" size="sm" onClick={() => setLinks(u)}><Users className="h-4 w-4" aria-hidden /> Enfants</Button>
                            )}
                            {editable && (
                              <Button variant="ghost" size="sm" onClick={() => setEditing(u)} aria-label={`Modifier ${u.fullName}`}><Pencil className="h-4 w-4" aria-hidden /></Button>
                            )}
                            {isDirector && u.isActive && !self && (
                              <Button variant="ghost" size="sm" onClick={() => setToDeactivate(u)} aria-label={`Désactiver ${u.fullName}`}><UserX className="h-4 w-4" aria-hidden /></Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
          </>
        )}
      </div>

      {editing && (
        <UserFormModal
          actorRole={me.role}
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); list.reload(); }}
        />
      )}
      {links && <ParentLinksModal parent={links} onClose={() => setLinks(null)} onChanged={list.reload} />}
      {toDeactivate && (
        <ConfirmDialog
          title="Désactiver ce compte ?"
          confirmLabel="Désactiver"
          danger
          loading={busy}
          onConfirm={deactivate}
          onCancel={() => setToDeactivate(null)}
          message={
            <>
              <p><strong>{toDeactivate.fullName}</strong> ne pourra plus se connecter.</p>
              <p className="mt-2 text-slate-500">Le compte et son historique sont conservés. Le directeur peut le réactiver en modifiant le compte.</p>
            </>
          }
        />
      )}
    </div>
  );
};
