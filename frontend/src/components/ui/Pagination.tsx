import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

interface Props {
  page: number;
  pageSize: number;
  count: number;
  onPage: (page: number) => void;
}

/** Pagination serveur : « 21–40 sur 132 » + précédent / suivant. */
export const Pagination: React.FC<Props> = ({ page, pageSize, count, onPage }) => {
  if (count === 0) return null;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(count, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2.5 text-sm text-slate-600">
      <span aria-live="polite">{from}–{to} sur {count}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Page précédente">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Précédent
        </Button>
        <span className="tabular-nums">Page {page} / {pages}</span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Page suivante">
          Suivant <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
};
