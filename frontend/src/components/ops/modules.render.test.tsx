import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { camelize } from '../../lib/case';

const mocks = vi.hoisted(() => ({ handler: null as null | ((url: string) => Promise<unknown>) }));

vi.mock('../../lib/api', async orig => {
  const real = await orig<typeof import('../../lib/api')>();
  return { ...real, http: { get: (url: string) => mocks.handler!(url), post: vi.fn(), patch: vi.fn() } };
});

// Réponses au format réel de l'API (snake_case), converties comme le fait l'intercepteur Axios.
const student = { id: 's1', full_name: 'Ibrahima Testeur', registration_number: 'DAF-2026-0001' };
const page = (results: unknown[]) => ({ count: results.length, next: null, previous: null, results });
const due = {
  id: 'd1', student: 's1', student_name: student.full_name, registration_number: student.registration_number, academic_year: 'y1',
  fee_schedule: 'f1', kind: 'MENSUALITE', label: 'Mensualité novembre 2026', period: '2026-11-01', due_date: '2026-11-05', amount: 10000,
  paid_amount: 4000, balance: 6000, status: 'PARTIELLE', is_overdue: true, is_cancelled: false,
};
const payment = {
  id: 'p1', receipt_number: 'REC-2026-0001', student: 's1', student_name: student.full_name, registration_number: student.registration_number,
  due: 'd1', fee_kind: 'MENSUALITE', period_label: 'Novembre 2026', amount: 4000, date: '2026-11-07', method: 'WAVE', reference: 'W1',
  status: 'PAYE', recorded_by_name: 'Directeur', notes: '', cancelled_by_name: '', cancelled_at: null, cancel_reason: '', created_at: '2026-11-07T10:00:00Z',
};
const expense = {
  id: 'e1', category: 'ALIMENTATION', title: 'Riz', amount: 150000, date: '2026-11-07', paid_to: 'Marché', reference: '', attachment_url: null,
  status: 'EN_ATTENTE', requires_approval: true, created_by_name: 'Assistant', approved_by_name: '', decided_at: null, decision_note: '',
  cancel_reason: '', cancelled_by_name: '', cancelled_at: null, created_at: '2026-11-07T10:00:00Z',
};
const item = {
  id: 'i1', name: 'Riz', category: 'c1', category_name: 'Denrées', unit: 'kg', quantity: 12.5, min_threshold: 20, is_low: true,
  default_supplier: null, supplier_name: '', last_restocked: '2026-11-07', is_active: true,
};
const movement = {
  id: 'm1', item: 'i1', item_name: 'Riz', unit: 'kg', kind: 'SORTIE', quantity: 35, quantity_before: 50, quantity_after: 15, date: '2026-11-07',
  supplier: null, supplier_name: '', reason: 'cuisine', recorded_by_name: 'Directeur', created_at: '2026-11-07T10:00:00Z',
};
const room = {
  id: 'r1', building: 'b1', building_name: 'Bâtiment A', number: '1', name: '', capacity: 2, occupancy: 1, free_places: 1,
  supervisor: null, supervisor_name: '', is_active: true,
};
const assignment = {
  id: 'a1', student: 's1', student_name: student.full_name, registration_number: student.registration_number, room: 'r1', room_label: '1',
  building_name: 'Bâtiment A', bed_number: '1', start_date: '2026-11-07', end_date: null, note: '', assigned_by_name: 'Directeur', is_active: true,
};

const routes: [RegExp, unknown][] = [
  [/^\/academic-years\//, page([{ id: 'y1', name: '2026-2027', start_date: '2026-01-01', end_date: '2026-12-31', is_current: true, is_closed: false }])],
  [/^\/finance\/summary\//, {
    from: '2026-01-01', to: '2026-11-07', total_payments: 4000, total_donations: 0, total_revenue: 4000, total_expenses: 0, balance: 4000,
    outstanding: 36000, outstanding_dues_count: 4, students_in_arrears: 2, pending_expenses_count: 1, pending_expenses_amount: 150000,
    revenue_by_type: [{ key: 'MENSUALITE', label: 'Mensualités', amount: 4000, count: 1 }],
    revenue_by_method: [{ key: 'WAVE', label: 'Wave', amount: 4000, count: 1 }],
    monthly: [{ month: '2026-10', payments: 0, donations: 0, revenue: 0, expenses: 0, balance: 0 }, { month: '2026-11', payments: 4000, donations: 0, revenue: 4000, expenses: 0, balance: 4000 }],
  }],
  [/^\/finance\/arrears\//, { count: 1, total_balance: 36000, academic_year: 'y1', results: [{ student: 's1', student_name: student.full_name, registration_number: student.registration_number, student_status: 'PAYANT', total_due: 40000, total_paid: 4000, balance: 36000, overdue_count: 2, oldest_due_date: '2026-11-05' }] }],
  [/^\/finance\/dues\//, page([due])],
  [/^\/finance\/fees\//, page([{ id: 'f1', academic_year: 'y1', academic_year_name: '2026-2027', name: 'Mensualité', kind: 'MENSUALITE', amount: 10000, applies_to: 'TOUS', due_day: 5, is_active: true }])],
  [/^\/finance\/discounts\//, page([{ id: 'x1', student: 's1', student_name: student.full_name, registration_number: student.registration_number, academic_year: 'y1', label: 'Fratrie', kind: 'POURCENT', value: 10, reason: '', approved_by_name: 'Directeur', is_active: true }])],
  [/^\/payments\//, page([payment])],
  [/^\/expenses\//, page([expense])],
  [/^\/social\/overview\//, { ...page([{ id: 's1', registration_number: student.registration_number, full_name: student.full_name, status: 'SOCIAL', sponsors: [{ sponsorship_id: 'sp1', sponsor_id: 'k1', sponsor_name: 'Fondation Baraka', monthly_amount: 15000, start_date: '2026-01-01' }], status_changes: [{ from_status: 'PAYANT', to_status: 'SOCIAL', reason: 'Famille démunie', effective_date: '2026-02-01', changed_by_name: 'Directeur' }] }]), summary: { social_count: 1, paying_count: 0, sponsored_social_count: 1, social_without_sponsor_count: 0, active_sponsorships: 1, total_monthly_sponsorship: 15000 } }],
  [/^\/social\/sponsors\//, page([{ id: 'k1', name: 'Fondation Baraka', kind: 'PARRAIN', phone: '', email: '', country: 'France', notes: '', active_sponsorships: 1, created_at: '2026-01-01T00:00:00Z' }])],
  [/^\/social\/sponsorships\//, page([{ id: 'sp1', student: 's1', student_name: student.full_name, registration_number: student.registration_number, student_status: 'SOCIAL', sponsor: 'k1', sponsor_name: 'Fondation Baraka', sponsor_phone: '', sponsor_email: '', monthly_amount: 15000, start_date: '2026-01-01', end_date: null, status: 'ACTIF', notes: '', created_at: '2026-01-01T00:00:00Z' }])],
  [/^\/social\/donations\//, page([{ id: 'n1', receipt_number: 'DON-2026-001', sponsor: 'k1', sponsor_name: 'Fondation Baraka', donor_name: 'Fondation Baraka', donor_phone: '', amount: 50000, date: '2026-11-07', purpose: 'Zakat', method: 'WAVE', attachment_url: null, recorded_by_name: 'Directeur', is_cancelled: false, cancel_reason: '', cancelled_by_name: '', cancelled_at: null, created_at: '2026-11-07T00:00:00Z' }])],
  [/^\/inventory\/summary\//, { total_items: 1, active_items: 1, low_stock_count: 1, out_of_stock_count: 0, categories: [{ id: 'c1', name: 'Denrées', items: 1, low_items: 1 }], last_30_days: { since: '2026-10-08', entries: 1, exits: 1, adjustments: 0, quantity_in: 50, quantity_out: 35 }, recent_movements: [movement], generated_on: '2026-11-07' }],
  [/^\/inventory\/alerts\//, { count: 1, results: [item] }],
  [/^\/inventory\/items\//, page([item])],
  [/^\/inventory\/movements\//, page([movement])],
  [/^\/inventory\/categories\//, page([{ id: 'c1', name: 'Denrées', items_count: 1 }])],
  [/^\/inventory\/suppliers\//, page([{ id: 'u1', name: 'Marché Kahone', phone: '', address: '' }])],
  [/^\/staff\/[^/]+\/positions\//, [{ id: 'q1', staff: 'st1', role_title: 'Maître', start_date: '2026-11-07', end_date: null, note: 'Entrée en fonction' }]],
  [/^\/staff\/[^/]+\/documents\//, []],
  [/^\/staff\/st1\//, { id: 'st1', user: null, user_name: '', full_name: 'Ousmane Ba', category: 'MAITRE', role_title: 'Maître', phone: '771111111', email: '', address: '', hire_date: '2026-11-07', end_date: null, status: 'ACTIF', id_number: '123', notes: '', created_at: '2026-11-07T00:00:00Z' }],
  [/^\/staff\//, page([{ id: 'st1', full_name: 'Ousmane Ba', category: 'MAITRE', role_title: 'Maître', phone: '771111111', status: 'ACTIF' }])],
  [/^\/boarding\/occupancy\//, { capacity: 2, occupied: 1, free: 1, occupancy_rate: 50, students_out: 0, buildings: [{ id: 'b1', name: 'Bâtiment A', capacity: 2, occupied: 1, free: 1, rooms: [{ id: 'r1', number: '1', name: '', capacity: 2, occupancy: 1, free_places: 1, is_active: true, supervisor_name: '' }] }] }],
  [/^\/boarding\/buildings\//, page([{ id: 'b1', name: 'Bâtiment A', rooms_count: 1 }])],
  [/^\/boarding\/rooms\//, page([room])],
  [/^\/boarding\/assignments\//, page([assignment])],
  [/^\/boarding\/movements\/currently-out\//, [{ student: 's1', student_name: student.full_name, registration_number: student.registration_number, room: 'r1', room_label: '1', since: '2026-11-07T03:46:00Z', expected_return: '2026-11-08T03:46:00Z', reason: 'visite' }]],
  [/^\/boarding\/movements\//, page([{ id: 'bm1', student: 's1', student_name: student.full_name, registration_number: student.registration_number, kind: 'SORTIE', occurred_at: '2026-11-07T03:46:00Z', reason: 'visite', expected_return: null, recorded_by_name: 'Directeur', created_at: '2026-11-07T03:46:00Z' }])],
  [/^\/users\//, page([])],
];

mocks.handler = async (url: string) => {
  const hit = routes.find(([re]) => re.test(url));
  if (!hit) throw Object.assign(new Error(`route inconnue ${url}`), { response: { status: 404, data: { detail: 'Introuvable.' } } });
  return { data: camelize(hit[1]) };
};

import { useAuth } from '../../stores/authStore';
import { SummaryTab } from '../../features/finance/SummaryTab';
import { PaymentsTab } from '../../features/finance/PaymentsTab';
import { DuesTab } from '../../features/finance/DuesTab';
import { ArrearsTab } from '../../features/finance/ArrearsTab';
import { ExpensesTab } from '../../features/finance/ExpensesTab';
import { FeesTab } from '../../features/finance/FeesTab';
import { SocialModule } from '../../features/social/SocialModule';
import { InventoryModule } from '../../features/inventory/InventoryModule';
import { StaffModule } from '../../features/staff/StaffModule';
import { BoardingModule } from '../../features/boarding/BoardingModule';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

let root: Root | null = null;
let host: HTMLDivElement;

async function mount(el: React.ReactElement, url = '/') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<MemoryRouter initialEntries={[url]}>{el}</MemoryRouter>); });
  // laisse les requêtes simulées se résoudre
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return host.textContent ?? '';
}

const asUser = (role: 'DIRECTEUR' | 'ASSISTANT', canViewFinance = false) =>
  useAuth.setState({
    user: { id: 'u', username: 'x', firstName: 'A', lastName: 'B', fullName: 'A B', email: '', phone: '', role, isActive: true, canViewFinance, mustChangePassword: false, assignedClassIds: [], associatedStudentIds: [] },
    initializing: false,
  });

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  root = null;
});

describe('rendu des écrans sur des réponses au format réel de l’API', () => {
  beforeEach(() => asUser('DIRECTEUR'));

  it('finances : synthèse, paiements, échéances, impayés, dépenses, frais', async () => {
    const summary = await mount(<SummaryTab />);
    expect(summary).toContain('Recettes');
    expect(summary).toContain('36 000 FCFA');
    expect(summary).toContain('Exporter le rapport en PDF');
    expect(await mount(<PaymentsTab />)).toContain('REC-2026-0001');
    const dues = await mount(<DuesTab />);
    expect(dues).toContain('Mensualité novembre 2026');
    expect(dues).toContain('Générer les échéances');
    expect(await mount(<ArrearsTab />)).toContain('36 000 FCFA');
    const expenses = await mount(<ExpensesTab />);
    expect(expenses).toContain('En attente de validation');
    expect(expenses).toContain('Valider');
    const fees = await mount(<FeesTab />);
    expect(fees).toContain('Grille de frais');
    expect(fees).toContain('Fratrie');
  });

  it('un assistant ne voit ni annulation de paiement ni validation de dépense', async () => {
    asUser('ASSISTANT', true);
    const pay = await mount(<PaymentsTab />);
    expect(pay).toContain('REC-2026-0001');
    expect(pay).not.toContain('Annuler');
    const exp = await mount(<ExpensesTab />);
    expect(exp).not.toContain('Valider');
    expect(exp).not.toContain('Refuser');
    const fees = await mount(<FeesTab />);
    expect(fees).toContain('Consultation seule');
    expect(fees).not.toContain('Ajouter un frais');
  });

  it('social : vue d’ensemble, parrains, parrainages, dons', async () => {
    const overview = await mount(<SocialModule />, '/?onglet=apercu');
    expect(overview).toContain('Fondation Baraka');
    expect(overview).toContain('1 changement');
    expect(await mount(<SocialModule />, '/?onglet=parrains')).toContain('France');
    expect(await mount(<SocialModule />, '/?onglet=parrainages')).toContain('15 000 FCFA');
    const dons = await mount(<SocialModule />, '/?onglet=dons');
    expect(dons).toContain('DON-2026-001');
    expect(dons).toContain('Enregistrer un don');
  });

  it('social : un assistant sans accès finances n’a pas l’onglet Dons', async () => {
    asUser('ASSISTANT', false);
    const txt = await mount(<SocialModule />);
    expect(txt).not.toContain('Dons');
    expect(txt).not.toContain('Ajouter un parrain');
  });

  it('stocks : tableau de bord, articles, mouvements, alertes, références', async () => {
    expect(await mount(<InventoryModule />, '/?onglet=tableau')).toContain('Articles par catégorie');
    const items = await mount(<InventoryModule />, '/?onglet=articles');
    expect(items).toContain('12,5 kg');
    expect(items).toContain('Stock bas');
    expect(await mount(<InventoryModule />, '/?onglet=mouvements')).toContain('50 → 15 kg');
    expect(await mount(<InventoryModule />, '/?onglet=alertes')).toContain('1 article à réapprovisionner');
    expect(await mount(<InventoryModule />, '/?onglet=categories')).toContain('Denrées');
    expect(await mount(<InventoryModule />, '/?onglet=fournisseurs')).toContain('Marché Kahone');
  });

  it('personnel : liste complète pour le directeur, liste réduite pour l’assistant', async () => {
    const dir = await mount(<StaffModule />);
    expect(dir).toContain('Ousmane Ba');
    expect(dir).toContain('Nouveau dossier');
    expect(dir).toContain('Ouvrir le dossier');
    asUser('ASSISTANT');
    const ass = await mount(<StaffModule />);
    expect(ass).toContain('Ousmane Ba');
    expect(ass).not.toContain('Nouveau dossier');
    expect(ass).not.toContain('Ouvrir le dossier');
  });

  it('internat : occupation, affectations, mouvements, chambres, historique', async () => {
    const occ = await mount(<BoardingModule />, '/?onglet=occupation');
    expect(occ).toContain('Taux d\'occupation');
    expect(occ).toContain('50 %');
    const aff = await mount(<BoardingModule />, '/?onglet=affectations');
    expect(aff).toContain('Changer de chambre');
    expect(aff).toContain('Sortie définitive');
    const mv = await mount(<BoardingModule />, '/?onglet=mouvements');
    expect(mv).toContain('Actuellement sortis');
    expect(mv).toContain('Enregistrer le retour');
    expect(await mount(<BoardingModule />, '/?onglet=chambres')).toContain('Bâtiment A');
    expect(await mount(<BoardingModule />, '/?onglet=historique')).toContain('Lecture seule');
  });
});
