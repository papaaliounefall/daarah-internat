import { http } from '../lib/api';
import { saveBlob } from '../lib/format';

/** Lit le message JSON d'une erreur dont le corps a été reçu en Blob (responseType: 'blob'). */
async function blobError(err: unknown): Promise<never> {
  const e = err as { response?: { data?: unknown } };
  const data = e.response?.data;
  if (data instanceof Blob) {
    try {
      const body = JSON.parse(await data.text());
      (e.response as { data: unknown }).data = body;
    } catch { /* corps non JSON : message générique */ }
  }
  throw err;
}

/** Récupère un PDF avec le jeton d'accès (les en-têtes d'un lien direct n'en portent pas). */
export const fetchPdf = (url: string, params?: Record<string, unknown>) =>
  http.get<Blob>(url, { params, responseType: 'blob' }).then(r => r.data).catch(blobError);

/** Ouvre le PDF dans un nouvel onglet ; si le navigateur bloque la fenêtre, le télécharge. */
export function showPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  const win = window.open(url, '_blank');
  if (!win) { saveBlob(blob, filename); URL.revokeObjectURL(url); return; }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const openReceipt = async (paymentId: string, receiptNumber: string) =>
  showPdf(await fetchPdf(`/documents/receipts/${paymentId}/`), `recu-${receiptNumber}.pdf`);

export const openFinanceReport = async (from: string, to: string) =>
  showPdf(await fetchPdf('/documents/finance-report/', { from, to }), `rapport-financier-${from}-${to}.pdf`);
