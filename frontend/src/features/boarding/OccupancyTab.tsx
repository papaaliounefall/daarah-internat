import React from 'react';
import { useFetch } from '../../hooks/useFetch';
import { getOccupancy } from '../../services/boarding';
import { Badge } from '../../components/ui';
import { Async, Stat, TableWrap } from '../../components/ops/Async';
import { occupancyPercent, occupancyTone } from './boardingUtils';

const Bar: React.FC<{ occupied: number; capacity: number }> = ({ occupied, capacity }) => {
  const pct = occupancyPercent(occupied, capacity);
  const tone = occupancyTone(occupied, capacity);
  const color = tone === 'danger' ? 'bg-danger' : tone === 'warning' ? 'bg-gold-500' : 'bg-brand-600';
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${occupied} places occupées sur ${capacity}`}>
      <div className="h-1.5 w-24 overflow-hidden rounded bg-slate-100"><div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <span className="text-xs tabular-nums text-slate-600">{occupied}/{capacity}</span>
    </div>
  );
};

/** Occupation réelle de l'internat (agrégats, sans identité d'enfant). */
export const OccupancyTab: React.FC = () => {
  const state = useFetch(getOccupancy, []);
  return (
    <Async state={state} isEmpty={d => d.buildings.length === 0} emptyTitle="Aucun bâtiment" emptyHint="Créez d'abord un bâtiment et ses chambres dans l'onglet « Chambres ».">
      {o => (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Capacité" value={o.capacity} hint="Chambres actives" />
            <Stat label="Occupées" value={o.occupied} />
            <Stat label="Places libres" value={o.free} tone={o.free === 0 ? 'danger' : 'success'} />
            <Stat label="Taux d'occupation" value={`${Math.round(o.occupancyRate)} %`} />
            <Stat label="Actuellement sortis" value={o.studentsOut} />
          </div>
          {o.buildings.map(b => (
            <section key={b.id} aria-label={b.name}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">{b.name}</h3>
                <span className="text-xs text-slate-500">{b.occupied} occupées sur {b.capacity} · {b.free} libres</span>
              </div>
              {b.rooms.length === 0 ? <p className="text-sm text-slate-500">Aucune chambre dans ce bâtiment.</p> : (
                <TableWrap>
                  <table className="table-base min-w-[34rem]">
                    <thead><tr><th>Chambre</th><th>Responsable</th><th>Occupation</th><th className="text-right">Places libres</th><th>État</th></tr></thead>
                    <tbody>
                      {b.rooms.map(r => (
                        <tr key={r.id} className={r.isActive ? '' : 'text-slate-500'}>
                          <td className="font-medium">{r.number}{r.name && r.name !== r.number ? ` (${r.name})` : ''}</td>
                          <td>{r.supervisorName || '—'}</td>
                          <td><Bar occupied={r.occupancy} capacity={r.capacity} /></td>
                          <td className="text-right tabular-nums">{r.freePlaces}</td>
                          <td>{!r.isActive ? <Badge>Désactivée</Badge> : r.freePlaces === 0 ? <Badge tone="danger">Complète</Badge> : <Badge tone="success">Disponible</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </section>
          ))}
        </div>
      )}
    </Async>
  );
};
