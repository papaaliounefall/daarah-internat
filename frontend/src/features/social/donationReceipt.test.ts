import { donationReceiptHtml, escapeHtml } from './donationReceipt';
import type { Donation } from '../../types/social';

const donation: Donation = {
  id: 'd', receiptNumber: 'DON-2026-001', sponsor: null, sponsorName: '', donorName: 'A <b>Diop</b>', donorPhone: '', amount: 50000,
  date: '2026-03-04', purpose: 'Zakat', method: 'WAVE', attachmentUrl: null, recordedByName: 'Directeur', isCancelled: false,
  cancelReason: '', cancelledByName: '', cancelledAt: null, createdAt: '2026-03-04T10:00:00Z',
};

describe('reçu de don', () => {
  it('échappe le HTML', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
  it('affiche numéro, montant FCFA et date, sans HTML injecté', () => {
    const html = donationReceiptHtml(donation, 'Daara');
    expect(html).toContain('DON-2026-001');
    expect(html).toContain('50 000 FCFA');
    expect(html).toContain('04/03/2026');
    expect(html).toContain('A &lt;b&gt;Diop&lt;/b&gt;');
    expect(html).not.toContain('<b>Diop');
    expect(html).not.toContain('DON ANNULÉ');
  });
  it('signale un don annulé avec son motif', () => {
    const html = donationReceiptHtml({ ...donation, isCancelled: true, cancelReason: 'Doublon' });
    expect(html).toContain('DON ANNULÉ');
    expect(html).toContain('Doublon');
  });
});
