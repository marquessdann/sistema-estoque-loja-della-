import type { Produto, TipoOperacao } from './tipos';

// Funções para mostrar números, valores e datas no padrão brasileiro.

const moedaFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numFmt = new Intl.NumberFormat('pt-BR');

export const moeda = (v: number | string | null | undefined) => moedaFmt.format(Number(v ?? 0));
export const numero = (v: number | string | null | undefined) => numFmt.format(Number(v ?? 0));

export function dataHora(iso: string | null | undefined) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function data(iso: string | null | undefined) {
  if (!iso) return '';
  // datas puras (AAAA-MM-DD) não devem sofrer ajuste de fuso
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }
  return new Date(iso).toLocaleDateString('pt-BR');
}

// AAAA-MM-DD de hoje (fuso local), útil para filtros
export function hojeISO(deslocamentoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

// Converte "1.234,56" ou "1234.56" em número. Vazio => null.
export function lerNumero(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  let t = texto.trim().replace(/[R$\s]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const TIPOS: Record<TipoOperacao, { rotulo: string; cor: string }> = {
  entrada: { rotulo: 'Entrada', cor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' },
  saida: { rotulo: 'Saída', cor: 'text-rose-400 bg-rose-400/10 border-rose-400/30' },
  ajuste: { rotulo: 'Ajuste', cor: 'text-violet-300 bg-violet-400/10 border-violet-400/30' },
  transferencia: { rotulo: 'Transferência', cor: 'text-sky-300 bg-sky-400/10 border-sky-400/30' },
  estorno: { rotulo: 'Estorno', cor: 'text-orange-300 bg-orange-400/10 border-orange-400/30' },
};

export const MOTIVOS_ENTRADA = [
  { valor: 'compra', rotulo: 'Compra (com nota fiscal)' },
  { valor: 'devolucao', rotulo: 'Devolução de cliente' },
  { valor: 'bonificacao', rotulo: 'Bonificação / brinde do fornecedor' },
  { valor: 'outro', rotulo: 'Outro' },
];

export const MOTIVOS_SAIDA = [
  { valor: 'venda', rotulo: 'Venda' },
  { valor: 'perda', rotulo: 'Perda / extravio' },
  { valor: 'avaria', rotulo: 'Avaria / defeito' },
  { valor: 'uso_interno', rotulo: 'Uso interno' },
  { valor: 'outro', rotulo: 'Outro' },
];

const ROTULO_MOTIVO: Record<string, string> = Object.fromEntries(
  [...MOTIVOS_ENTRADA, ...MOTIVOS_SAIDA].map((m) => [m.valor, m.rotulo.split(' (')[0]]),
);
ROTULO_MOTIVO.transferencia = 'Transferência entre lojas';

export const rotuloMotivo = (m: string | null | undefined) => (m ? (ROTULO_MOTIVO[m] ?? m) : '');

export const UNIDADES = ['UN', 'KIT', 'CX', 'PC', 'PAR', 'JG', 'CJ', 'PCT'];

// Saldo/mínimo de um produto numa loja
export function estoqueNaLoja(p: Produto, lojaId: number) {
  return p.estoques.find((e) => e.loja_id === lojaId) ?? { loja_id: lojaId, saldo: 0, estoque_minimo: 0 };
}

export const saldoTotal = (p: Produto) => p.estoques.reduce((s, e) => s + e.saldo, 0);

export const abaixoDoMinimo = (p: Produto, lojaId: number) => {
  const e = estoqueNaLoja(p, lojaId);
  return e.estoque_minimo > 0 && e.saldo < e.estoque_minimo;
};

// Texto sem acento e minúsculo, para busca
export const normalizar = (t: string | null | undefined) =>
  (t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function buscarProdutos(lista: Produto[], termo: string) {
  const t = normalizar(termo);
  if (!t) return lista;
  const partes = t.split(/\s+/);
  return lista.filter((p) => {
    const alvo = `${normalizar(p.nome)} ${normalizar(p.sku)} ${p.ean ?? ''}`;
    return partes.every((parte) => alvo.includes(parte));
  });
}

// Cor de texto legível sobre uma cor de fundo
export function corTexto(hex: string) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#0A0A0A' : '#FFFFFF';
}

// Sugestão de transferência: quando uma loja está abaixo do mínimo e outra
// loja tem SOBRA (saldo acima do mínimo dela), sugere quanto transferir.
export function sugestaoTransferencia(p: Produto, lojaId: number, lojaIds: number[]) {
  const e = estoqueNaLoja(p, lojaId);
  const falta = e.estoque_minimo - e.saldo;
  if (falta <= 0) return null;
  let melhor: { origemId: number; quantidade: number } | null = null;
  for (const outra of lojaIds) {
    if (outra === lojaId) continue;
    const o = estoqueNaLoja(p, outra);
    const sobra = o.saldo - o.estoque_minimo;
    if (sobra > 0 && (!melhor || sobra > melhor.quantidade)) {
      melhor = { origemId: outra, quantidade: Math.min(falta, sobra) };
    }
  }
  return melhor;
}

// Converte AAAA-MM-DD (dia no horário do Brasil/local) em instante ISO para filtros
export const inicioDoDia = (d: string) => new Date(`${d}T00:00:00`).toISOString();
export const fimDoDia = (d: string) => new Date(`${d}T23:59:59.999`).toISOString();
