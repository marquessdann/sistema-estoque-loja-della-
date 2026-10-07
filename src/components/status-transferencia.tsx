import { STATUS_TRANSF } from '@/lib/formato';
import type { StatusTransferencia } from '@/lib/tipos';

// Etiqueta com a situação da transferência
export function StatusBadge({ status }: { status: StatusTransferencia }) {
  const s = STATUS_TRANSF[status];
  return <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${s.cor}`}>{s.rotulo}</span>;
}
