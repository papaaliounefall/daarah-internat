import { formatDate, formatFcfa } from '../../lib/format';
import { METHOD_LABEL } from '../../types/finance';
import type { Donation } from '../../types/social';

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Document HTML imprimable du reçu de don (toutes les valeurs sont échappées). */
export function donationReceiptHtml(d: Donation, establishmentName = ''): string {
  const row = (label: string, value: string) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Reçu ${escapeHtml(d.receiptNumber)}</title>
<style>
body{font-family:system-ui,sans-serif;color:#1f2a26;margin:32px;max-width:560px}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:#555}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;font-size:14px}th{width:38%;color:#555;font-weight:600}
.cancel{margin-top:16px;padding:8px;border:1px solid #b3372f;color:#b3372f;font-weight:600}
</style></head><body>
<h1>Reçu de don n° ${escapeHtml(d.receiptNumber)}</h1>
<p>${escapeHtml(establishmentName)}</p>
<table>
${row('Donateur', d.donorName)}
${d.sponsorName ? row('Parrain / partenaire', d.sponsorName) : ''}
${row('Montant', formatFcfa(d.amount))}
${row('Date', formatDate(d.date))}
${row('Mode de versement', METHOD_LABEL[d.method])}
${d.purpose ? row('Objet', d.purpose) : ''}
${d.recordedByName ? row('Enregistré par', d.recordedByName) : ''}
</table>
${d.isCancelled ? `<div class="cancel">DON ANNULÉ — motif : ${escapeHtml(d.cancelReason)}</div>` : ''}
<script>window.onload=function(){window.print()}</script>
</body></html>`;
}

/** Ouvre le reçu dans un nouvel onglet et lance l'impression. Retourne false si la fenêtre est bloquée. */
export function printDonationReceipt(d: Donation, establishmentName = ''): boolean {
  const blob = new Blob([donationReceiptHtml(d, establishmentName)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return win !== null;
}
