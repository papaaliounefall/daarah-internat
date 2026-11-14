import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { listAllStaff } from '../../services/staff';
import { listBuildings, listRooms, saveBuilding, saveRoom } from '../../services/boarding';
import { plainErrorMessage } from '../../lib/apiErrors';
import { Badge, Button, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import type { Building, Room } from '../../types/boarding';

const BuildingModal: React.FC<{ building: Building | null; onClose: () => void; onSaved: () => void }> = ({ building, onClose, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState(building?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await saveBuilding(building?.id ?? null, name.trim());
      toast.success(building ? 'Bâtiment renommé.' : 'Bâtiment créé.');
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={building ? 'Renommer le bâtiment' : 'Nouveau bâtiment'} onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="building-form" loading={busy} disabled={!name.trim()}>Enregistrer</Button>
      </>
    }>
      <form id="building-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <TextField label="Nom du bâtiment" required value={name} onChange={e => setName(e.target.value)} maxLength={100} />
      </form>
    </Modal>
  );
};

const RoomModal: React.FC<{ room: Room | null; buildings: Building[]; onClose: () => void; onSaved: () => void }> = ({ room, buildings, onClose, onSaved }) => {
  const toast = useToast();
  const staff = useFetch(listAllStaff, []);
  const [building, setBuilding] = useState(room?.building ?? buildings[0]?.id ?? '');
  const [number, setNumber] = useState(room?.number ?? '');
  const [name, setName] = useState(room?.name ?? '');
  const [capacity, setCapacity] = useState(room ? String(room.capacity) : '4');
  const [supervisor, setSupervisor] = useState(room?.supervisor ?? '');
  const [active, setActive] = useState(room?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cap = Number(capacity);
  const capError = capacity && (!Number.isInteger(cap) || cap < 1) ? 'Au moins 1 place.' : room && cap < room.occupancy ? `La capacité ne peut pas être inférieure à l'occupation actuelle (${room.occupancy}).` : undefined;
  const valid = Boolean(building && number.trim() && capacity) && !capError;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await saveRoom(room?.id ?? null, { building, number: number.trim(), name: name.trim(), capacity: cap, supervisor: supervisor || null, isActive: active });
      toast.success(room ? 'Chambre modifiée.' : 'Chambre créée.');
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const active_staff = (staff.data ?? []).filter(s => s.status !== 'PARTI');

  return (
    <Modal title={room ? 'Modifier la chambre' : 'Nouvelle chambre'} onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="room-form" loading={busy} disabled={!valid}>Enregistrer</Button>
      </>
    }>
      <form id="room-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <SelectField label="Bâtiment" required value={building} onChange={e => setBuilding(e.target.value)}>
          {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Numéro" required value={number} onChange={e => setNumber(e.target.value)} maxLength={20} />
          <TextField label="Nom (facultatif)" value={name} onChange={e => setName(e.target.value)} maxLength={100} />
        </div>
        <TextField label="Capacité (places)" inputMode="numeric" required value={capacity} onChange={e => setCapacity(e.target.value)} error={capError} />
        <SelectField label="Responsable de la chambre" value={supervisor} onChange={e => setSupervisor(e.target.value)} hint={staff.error ? 'Liste du personnel indisponible.' : undefined}>
          <option value="">Aucun</option>
          {active_staff.map(s => <option key={s.id} value={s.id}>{s.fullName}{s.roleTitle ? ` — ${s.roleTitle}` : ''}</option>)}
        </SelectField>
        {room && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Chambre active
            {room.occupancy > 0 && <span className="text-xs text-slate-500">(une chambre occupée ne peut pas être désactivée)</span>}
          </label>
        )}
      </form>
    </Modal>
  );
};

/** Bâtiments et chambres : création et modification (jamais de suppression, désactivation si vide). */
export const RoomsTab: React.FC = () => {
  const buildings = useFetch(listBuildings, []);
  const rooms = useFetch(() => listRooms(), []);
  const [filter, setFilter] = useState('');
  const [editBuilding, setEditBuilding] = useState<Building | 'new' | null>(null);
  const [editRoom, setEditRoom] = useState<Room | 'new' | null>(null);
  const reload = () => { buildings.reload(); rooms.reload(); };
  const list = (rooms.data ?? []).filter(r => !filter || r.building === filter);

  return (
    <div>
      <FilterBar actions={
        <>
          <Button variant="secondary" onClick={() => setEditBuilding('new')}><Plus className="h-4 w-4" aria-hidden /> Nouveau bâtiment</Button>
          <Button onClick={() => setEditRoom('new')} disabled={!buildings.data || buildings.data.length === 0}><Plus className="h-4 w-4" aria-hidden /> Nouvelle chambre</Button>
        </>
      }>
        <SelectField label="Bâtiment" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">Tous</option>
          {(buildings.data ?? []).map(b => <option key={b.id} value={b.id}>{b.name} ({b.roomsCount})</option>)}
        </SelectField>
        {filter && buildings.data && (
          <Button variant="ghost" onClick={() => setEditBuilding(buildings.data!.find(b => b.id === filter) ?? null)}>Renommer ce bâtiment</Button>
        )}
      </FilterBar>

      <Async state={rooms} isEmpty={() => list.length === 0} emptyTitle="Aucune chambre"
        emptyHint={buildings.data && buildings.data.length === 0 ? "Créez d'abord un bâtiment, puis ses chambres." : 'Aucune chambre dans ce bâtiment.'}>
        {() => (
          <TableWrap>
            <table className="table-base min-w-[44rem]">
              <thead><tr><th>Bâtiment</th><th>Chambre</th><th className="text-right">Capacité</th><th className="text-right">Occupation</th><th>Responsable</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id} className={r.isActive ? '' : 'text-slate-500'}>
                    <td>{r.buildingName}</td>
                    <td className="font-medium">{r.number}{r.name && r.name !== r.number ? ` (${r.name})` : ''}</td>
                    <td className="text-right tabular-nums">{r.capacity}</td>
                    <td className="text-right tabular-nums">{r.occupancy}</td>
                    <td>{r.supervisorName || '—'}</td>
                    <td>{r.isActive ? <Badge tone="success">Active</Badge> : <Badge>Désactivée</Badge>}</td>
                    <td className="text-right"><Button variant="ghost" size="sm" onClick={() => setEditRoom(r)}>Modifier</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Async>

      {editBuilding && <BuildingModal building={editBuilding === 'new' ? null : editBuilding} onClose={() => setEditBuilding(null)} onSaved={reload} />}
      {editRoom && buildings.data && <RoomModal room={editRoom === 'new' ? null : editRoom} buildings={buildings.data} onClose={() => setEditRoom(null)} onSaved={reload} />}
    </div>
  );
};
