import type { Cargo, Permissao, Plataforma, Produto, StatusTransferencia, TipoOperacao } from './tipos';

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
  { valor: 'venda', rotulo: 'Pedido (venda)' },
  { valor: 'perda', rotulo: 'Perda / extravio' },
  { valor: 'avaria', rotulo: 'Avaria / defeito' },
  { valor: 'uso_interno', rotulo: 'Uso interno' },
  { valor: 'devolucao_fornecedor', rotulo: 'Devolução ao fornecedor' },
  { valor: 'outro', rotulo: 'Outro (descreva na observação)' },
];

const ROTULO_MOTIVO: Record<string, string> = Object.fromEntries(
  [...MOTIVOS_ENTRADA, ...MOTIVOS_SAIDA].map((m) => [m.valor, m.rotulo.split(' (')[0]]),
);
Object.assign(ROTULO_MOTIVO, {
  transferencia: 'Transferência entre lojas',
  outro: 'Outro',
});

export const rotuloMotivo = (m: string | null | undefined) => (m ? (ROTULO_MOTIVO[m] ?? m) : '');

export const UNIDADES = ['UN', 'KIT', 'CX', 'PC', 'PAR', 'JG', 'CJ', 'PCT'];

// Saldo/mínimo de um produto numa loja
export function estoqueNaLoja(p: Produto, lojaId: number) {
  const e = p.estoques.find((x) => x.loja_id === lojaId);
  return { loja_id: lojaId, saldo: e?.saldo ?? 0, estoque_minimo: e?.estoque_minimo ?? 0 };
}

// Quanto pode sair da loja (o saldo atual)
export const disponivelNaLoja = (p: Produto, lojaId: number) => estoqueNaLoja(p, lojaId).saldo;

// Total nas lojas
export const saldoTotal = (p: Produto, lojaIds?: number[]) =>
  p.estoques.filter((e) => !lojaIds || lojaIds.includes(e.loja_id)).reduce((s, e) => s + e.saldo, 0);

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
    const alvo = `${normalizar(p.nome)} ${normalizar(p.sku)} ${p.ean ?? ''} ${normalizar(p.codigo_fornecedor)}`;
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

export const STATUS_TRANSF: Record<StatusTransferencia, { rotulo: string; cor: string }> = {
  concluida: { rotulo: 'Concluída', cor: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/40' },
  estornada: { rotulo: 'Estornada', cor: 'text-rose-300 bg-rose-400/10 border-rose-400/40' },
};

// Código de barras: só números; com 8, 12, 13 ou 14 dígitos confere o dígito verificador (GTIN)
export function eanValido(ean: string) {
  if (!/^\d{4,14}$/.test(ean)) return false;
  const n = ean.length;
  if (![8, 12, 13, 14].includes(n)) return true;
  let soma = 0;
  for (let i = 0; i < n - 1; i++) soma += Number(ean[i]) * ((n - 1 - i) % 2 === 1 ? 3 : 1);
  return (10 - (soma % 10)) % 10 === Number(ean[n - 1]);
}

// Identificador único de um formulário: se o mesmo envio chegar 2 vezes, o banco não duplica
export const novaChave = () => crypto.randomUUID();

// ---------- Fiscal ----------
export const ORIGENS_FISCAIS = [
  { valor: 0, rotulo: '0 - Nacional' },
  { valor: 1, rotulo: '1 - Estrangeira (importação direta)' },
  { valor: 2, rotulo: '2 - Estrangeira (adquirida no mercado interno)' },
  { valor: 3, rotulo: '3 - Nacional, mais de 40% importado' },
  { valor: 4, rotulo: '4 - Nacional (processos básicos)' },
  { valor: 5, rotulo: '5 - Nacional, até 40% importado' },
  { valor: 6, rotulo: '6 - Estrangeira (importação direta, sem similar)' },
  { valor: 7, rotulo: '7 - Estrangeira (mercado interno, sem similar)' },
  { valor: 8, rotulo: '8 - Nacional, mais de 70% importado' },
];
export const formatarNCM = (n: string | null | undefined) =>
  n && n.length === 8 ? `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}` : (n ?? '');
export const formatarCEST = (c: string | null | undefined) =>
  c && c.length === 7 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5)}` : (c ?? '');

// ---------- Cargos ----------
// Mesma regra do banco (tem_permissao): o banco confere de novo em toda gravação.
export const CARGOS: Record<Cargo, { rotulo: string; cor: string; descricao: string }> = {
  ceo: { rotulo: 'CEO', cor: 'bg-blue-600 text-white', descricao: 'Tudo: usuários, senhas dos estoques, lojas e configurações.' },
  gerente: {
    rotulo: 'Gerente',
    cor: 'bg-amber-100 text-amber-900',
    descricao: 'Autoriza: produtos, entrada, baixa, transferência, inventário, estorno, relatórios e log. Sem usuários e configurações.',
  },
  funcionario: {
    rotulo: 'Funcionário',
    cor: 'bg-slate-100 text-slate-700',
    descricao: 'O básico: entra nos estoques, transfere e dá baixa. Vê só o que ele lançou.',
  },
};

export function podeCargo(cargo: Cargo, p: Permissao) {
  if (cargo === 'ceo' || cargo === 'gerente') return true;
  return p === 'saida' || p === 'transferir';
}

// ---------- Plataformas dos pedidos ----------
export const PLATAFORMAS: Record<Plataforma, { rotulo: string; cor: string }> = {
  mercado_livre: { rotulo: 'Mercado Livre', cor: 'bg-yellow-300 text-slate-900' },
  tiktok_shop: { rotulo: 'TikTok Shop', cor: 'bg-slate-900 text-white' },
  shopee: { rotulo: 'Shopee', cor: 'bg-orange-600 text-white' },
};
export const rotuloPlataforma = (p: Plataforma | string | null | undefined) =>
  p ? (PLATAFORMAS[p as Plataforma]?.rotulo ?? p) : '';
/** no FULL só sai pedido do Mercado Livre */
export const ehFull = (codigo: string | null | undefined) => codigo === 'FULL_ML';

/** agora, no formato do campo "data e hora" (datetime-local), no horário do aparelho */
export function agoraLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
