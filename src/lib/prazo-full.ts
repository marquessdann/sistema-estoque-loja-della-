// Prazo do Mercado Livre FULL: contagem regressiva e avisos de cada lote.
import { hojeISO } from './formato';
import type { LoteFull } from './tipos';

const DIA = 86_400_000;
export const AVISOS_CRITICOS = [15, 10, 5, 2, 1];

export const fimDoLote = (l: LoteFull) => new Date(new Date(l.inicio).getTime() + l.dias * DIA);

/** quanto falta, já separado em dias/horas/minutos/segundos */
export function restante(l: LoteFull, agora = Date.now()) {
  const ms = fimDoLote(l).getTime() - agora;
  const abs = Math.abs(ms);
  return {
    ms,
    vencido: ms <= 0,
    dias: Math.floor(abs / DIA),
    horas: Math.floor((abs % DIA) / 3_600_000),
    minutos: Math.floor((abs % 3_600_000) / 60_000),
    segundos: Math.floor((abs % 60_000) / 1000),
    /** "faltam X dias" arredondado para cima (59 dias e 3 horas = 60) */
    diasCheios: Math.ceil(ms / DIA),
  };
}

export type NivelLote = 'ok' | 'atencao' | 'critico' | 'vencido' | 'encerrado';
export function nivel(l: LoteFull, agora = Date.now()): NivelLote {
  if (l.encerrado_em) return 'encerrado';
  const r = restante(l, agora);
  if (r.vencido) return 'vencido';
  if (r.diasCheios <= 5) return 'critico';
  if (r.diasCheios <= 15) return 'atencao';
  return 'ok';
}

export type TipoAviso = 'vencido' | 'critico' | 'quinzena' | 'semanal';
export interface Aviso {
  lote: LoteFull;
  tipo: TipoAviso; // o mais importante do lote
  chaves: string[]; // tudo o que fica "visto" ao clicar em Ok
}

/**
 * Avisos que valem agora para um lote (antes de olhar o que a pessoa já viu):
 * toda segunda-feira, a cada 15 dias desde o início, faltando 15/10/5/2/1 dia e, depois de vencer, 1 por dia.
 */
export function avisosDoLote(l: LoteFull, agora = new Date()): { tipo: TipoAviso; chave: string }[] {
  if (l.encerrado_em) return [];
  const t = agora.getTime();
  if (t < new Date(l.inicio).getTime()) return [];
  const r = restante(l, t);
  const hoje = hojeISO();
  const lista: { tipo: TipoAviso; chave: string }[] = [];
  if (r.vencido) {
    lista.push({ tipo: 'vencido', chave: `vencido-${hoje}` });
    return lista;
  }
  const limite = [...AVISOS_CRITICOS].reverse().find((d) => r.diasCheios <= d);
  if (limite != null) lista.push({ tipo: 'critico', chave: `critico-${limite}` });
  const quinzenas = Math.floor((t - new Date(l.inicio).getTime()) / (15 * DIA));
  if (quinzenas >= 1) lista.push({ tipo: 'quinzena', chave: `quinzena-${quinzenas}` });
  if (agora.getDay() === 1) lista.push({ tipo: 'semanal', chave: `seg-${hoje}` });
  return lista;
}

/** Junta os avisos ainda não vistos (vistos = "loteId:chave") */
export function avisosPendentes(lotes: LoteFull[], vistos: Set<string>, agora = new Date()): Aviso[] {
  const ordem: TipoAviso[] = ['vencido', 'critico', 'quinzena', 'semanal'];
  const saida: Aviso[] = [];
  for (const l of lotes) {
    const novos = avisosDoLote(l, agora).filter((a) => !vistos.has(`${l.id}:${a.chave}`));
    if (novos.length === 0) continue;
    const tipo = ordem.find((o) => novos.some((n) => n.tipo === o))!;
    saida.push({ lote: l, tipo, chaves: novos.map((n) => n.chave) });
  }
  return saida.sort((a, b) => fimDoLote(a.lote).getTime() - fimDoLote(b.lote).getTime());
}

const dataCurta = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const horaCurta = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Frase do aviso, ex.: "Você tem mais 30 dias da mercadoria deixada no FULL dia 16/10." */
export function fraseDoLote(l: LoteFull, agora = Date.now()) {
  const r = restante(l, agora);
  const inicio = new Date(l.inicio);
  const fim = fimDoLote(l);
  if (agora < inicio.getTime()) {
    return `A contagem começa em ${dataCurta(inicio)} às ${horaCurta(inicio)} e vence em ${dataCurta(fim)} às ${horaCurta(fim)}.`;
  }
  if (r.vencido) {
    return `O prazo da mercadoria deixada no FULL dia ${dataCurta(inicio)} venceu em ${dataCurta(fim)} às ${horaCurta(fim)}. Pode estar pagando armazenagem.`;
  }
  const qtd = r.diasCheios === 1 ? 'último dia' : `mais ${r.diasCheios} dias`;
  return `Você tem ${qtd} da mercadoria deixada no FULL dia ${dataCurta(inicio)}. Vence em ${dataCurta(fim)} às ${horaCurta(fim)}.`;
}

export const ROTULO_AVISO: Record<TipoAviso, string> = {
  vencido: 'Prazo vencido',
  critico: 'Prazo acabando',
  quinzena: 'Aviso quinzenal',
  semanal: 'Aviso de segunda-feira',
};
