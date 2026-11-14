import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Unlink } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { addGuardianship, listGuardianships, removeGuardianship } from '../../services/users';
import { Button, ConfirmDialog, ErrorState, Modal, SelectField, Spinner, useToast } from '../../components/ui';
import { RELATION_LABEL, type Guardianship, type ManagedUser, type Relation } from '../../types/users';
import { StudentPicker, type PickedStudent } from './StudentPicker';

/** Enfants rattachés à un compte parent : ajout et retrait de liens (ni le compte ni l'enfant ne sont supprimés). */
export const ParentLinksModal: React.FC<{ parent: ManagedUser; onClose: () => void; onChanged: () => void }> = ({ parent, onClose, onChanged }) => {
  const toast = useToast();
  const links = useFetch(() => listGuardianships(parent.id), [parent.id]);
  const [picked, setPicked] = useState<PickedStudent[]>([]);
  const [relation, setRelation] = useState<Relation>('PERE');
  const [adding, setAdding] = useState(false);
  const [toRemove, setToRemove] = useState<Guardianship | null>(null);
  const [removing, setRemoving] = useState(false);

  const add = async () => {
    if (picked.length === 0) return;
    setAdding(true);
    try {
      await addGuardianship(parent.id, picked[0].id, relation);
      toast.success(`${picked[0].fullName} est rattaché à ${parent.fullName}.`);
      setPicked([]);
      links.reload();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAdding(false);
    }
  };

  const remove = async () => {
    if (!toRemove) return;
    setRemoving(true);
    try {
      await removeGuardianship(toRemove.id);
      toast.success('Lien retiré.');
      setToRemove(null);
      links.reload();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Modal title={`Enfants de ${parent.fullName}`} size="lg" onClose={onClose}>
      {links.loading ? <Spinner /> : links.error ? <ErrorState message={links.error} onRetry={links.reload} /> : (
        <>
          {links.data!.length === 0 ? (
            <p className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Ce compte n'est rattaché à aucun enfant : le parent ne voit encore aucune information.
            </p>
          ) : (
            <ul className="mb-4 divide-y divide-line rounded-md border border-line">
              {links.data!.map(l => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <Link to={`/app/talibes/${l.student}`} className="text-sm font-medium hover:text-brand-700 hover:underline">{l.studentName}</Link>
                    <p className="text-xs text-slate-500">{RELATION_LABEL[l.relation] ?? l.relation}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setToRemove(l)} aria-label={`Retirer le lien avec ${l.studentName}`}>
                    <Unlink className="h-4 w-4" aria-hidden /> Retirer
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 rounded-md border border-line p-3">
            <StudentPicker single label="Rattacher un enfant" selected={picked} onChange={setPicked} excludeIds={links.data!.map(l => l.student)} />
            <SelectField label="Lien avec l'enfant" value={relation} onChange={e => setRelation(e.target.value as Relation)}>
              {(Object.keys(RELATION_LABEL) as Relation[]).map(r => <option key={r} value={r}>{RELATION_LABEL[r]}</option>)}
            </SelectField>
            <Button onClick={add} loading={adding} disabled={picked.length === 0}>Rattacher</Button>
          </div>
        </>
      )}

      {toRemove && (
        <ConfirmDialog
          title="Retirer ce lien ?"
          confirmLabel="Retirer le lien"
          danger
          loading={removing}
          onConfirm={remove}
          onCancel={() => setToRemove(null)}
          message={<p>{parent.fullName} ne verra plus les informations de <strong>{toRemove.studentName}</strong>. Le compte et le dossier de l'enfant sont conservés.</p>}
        />
      )}
    </Modal>
  );
};
