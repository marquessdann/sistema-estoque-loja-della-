'use client';

import { AlarmClock, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useDados } from '@/lib/dados';
import { avisosPendentes, fraseDoLote, restante, ROTULO_AVISO, type Aviso, type NivelLote } from '@/lib/prazo-full';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { LoteFull } from '@/lib/tipos';
import { Modal } from './ui';

export const COR_NIVEL: Record<NivelLote, string> = {
  ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  atencao: 'border-amber-400/50 bg-amber-400/10 text-amber-300',
  critico: 'border-rose-500/60 bg-rose-500/15 text-rose-300',
  vencido: 'border-rose-600 bg-rose-600/25 text-rose-200',
  encerrado: 'border-borda bg-painel2 text-suave',
};

/** relógio que atualiza a cada segundo */
export function useAgora(intervalo = 1000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), intervalo);
    return () => clearInterval(t);
  }, [intervalo]);
  return agora;
}

/** Contagem regressiva: dias, horas, minutos e segundos */
export function Contagem({ lote, agora, grande = false }: { lote: LoteFull; agora: number; grande?: boolean }) {
  const r = restante(lote, agora);
  const blocos = [
    [r.dias, 'dias'],
    [r.horas, 'horas'],
    [r.minutos, 'min'],
    [r.segundos, 'seg'],
  ] as const;
  return (
    <div>
      {r.vencido && <div className="mb-1 text-xs font-bold uppercase tracking-wide">Vencido há</div>}
      <div className="flex gap-2">
        {blocos.map(([v, rotulo]) => (
          <div
            key={rotulo}
            className={`rounded-lg bg-black/30 text-center ${grande ? 'min-w-[68px] px-3 py-2' : 'min-w-[48px] px-2 py-1'}`}
          >
            <div className={`tabular font-titulo font-bold ${grande ? 'text-3xl' : 'text-lg'}`}>{String(v).padStart(2, '0')}</div>
            <div className="text-[10px] uppercase tracking-wide opacity-80">{rotulo}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mostra o pop-up do prazo FULL em qualquer tela (cada aviso 1 vez por pessoa) */
export function AvisosFull() {
  const { usuario, versao } = useDados();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const agora = useAgora();
  const minuto = Math.floor(agora / 60_000);

  const verificar = useCallback(async () => {
    if (!usuario) return;
    const sb = supabaseNavegador();
    const [{ data: lotes }, { data: vistos }] = await Promise.all([
      sb.from('lotes_full').select('*').is('encerrado_em', null),
      sb.from('avisos_full_vistos').select('lote_id, aviso'),
    ]);
    const jaVistos = new Set((vistos ?? []).map((v) => `${v.lote_id}:${v.aviso}`));
    setAvisos(avisosPendentes((lotes ?? []) as LoteFull[], jaVistos));
  }, [usuario]);

  // confere ao abrir, quando os dados mudam e a cada 10 minutos (ex.: virou segunda-feira)
  useEffect(() => {
    verificar();
  }, [verificar, versao, Math.floor(minuto / 10)]); // eslint-disable-line react-hooks/exhaustive-deps

  async function entendi() {
    setOcupado(true);
    await supabaseNavegador().rpc('marcar_avisos_full', {
      p: avisos.flatMap((a) => a.chaves.map((aviso) => ({ lote_id: a.lote.id, aviso }))),
    });
    setOcupado(false);
    setAvisos([]);
  }

  const urgente = avisos.some((a) => a.tipo === 'vencido' || a.tipo === 'critico');
  return (
    <Modal
      aberto={avisos.length > 0}
      aoFechar={entendi}
      titulo={
        <span className={`flex items-center gap-2 ${urgente ? 'text-rose-300' : 'text-dourado'}`}>
          <AlarmClock className="h-5 w-5" /> Prazo do Mercado Livre FULL
        </span>
      }
    >
      <div className="space-y-3">
        {avisos.map((a) => (
          <div
            key={a.lote.id}
            className={`rounded-xl border p-3 ${
              a.tipo === 'vencido' ? COR_NIVEL.vencido : a.tipo === 'critico' ? COR_NIVEL.critico : COR_NIVEL.atencao
            }`}
          >
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide">
              {ROTULO_AVISO[a.tipo]} · {a.lote.nome}
            </div>
            <p className="mb-3 text-sm text-white">{fraseDoLote(a.lote, agora)}</p>
            <Contagem lote={a.lote} agora={agora} />
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href="/prazo-full" className="btn-secundario" onClick={entendi}>
          <CalendarClock className="h-4 w-4" /> Ver prazos
        </Link>
        <button className="btn-principal" onClick={entendi} disabled={ocupado}>
          Ok, vi
        </button>
      </div>
    </Modal>
  );
}
