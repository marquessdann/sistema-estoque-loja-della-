'use client';

import { CircleCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LojaTag } from '@/components/loja';
import { DetalheOperacao, LinhaOperacao } from '@/components/operacoes';
import { Carregando, Titulo, Vazio } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { abaixoDoMinimo, estoqueNaLoja, moeda, numero } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { OperacaoResumo } from '@/lib/tipos';

const NIVEIS = { baixo: 'Estoque baixo', medio: 'Estoque médio', ok: 'Estoque OK', vazio: 'Estoque vazio' } as const;
const FRASES = {
  baixo: 'Seu estoque está baixo.',
  medio: 'Seu estoque está médio.',
  ok: 'Seu estoque está OK.',
  vazio: 'Este estoque ainda não tem produtos.',
} as const;
const FRASE_COR = { baixo: 'text-rose-300', medio: 'text-amber-200', ok: 'text-emerald-300', vazio: 'text-suave' } as const;

export default function Painel() {
  const { produtos, lojas, versao, usuario, lojaAtual } = useDados();
  const [ultimas, setUltimas] = useState<OperacaoResumo[] | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);

  useEffect(() => {
    if (!lojaAtual) return;
    supabaseNavegador()
      .from('vw_operacoes')
      .select('*')
      .or(`loja_origem_id.eq.${lojaAtual.id},loja_destino_id.eq.${lojaAtual.id}`)
      .order('criado_em', { ascending: false })
      .limit(10)
      .then(({ data }) => setUltimas((data ?? []) as OperacaoResumo[]));
  }, [versao, lojaAtual]);

  // kits não têm estoque próprio (os componentes já estão contados)
  const ativos = useMemo(() => produtos.filter((p) => p.ativo && !p.eh_kit), [produtos]);

  const ordenadas = [...lojas].sort((a, b) => (a.id === lojaAtual?.id ? -1 : b.id === lojaAtual?.id ? 1 : 0));
  const resumo = ordenadas.map((l) => {
    let unidades = 0;
    let valor = 0;
    const baixos = [];
    const medios = []; // acima do mínimo, mas até o dobro dele: perto de acabar
    for (const p of ativos) {
      const e = estoqueNaLoja(p, l.id);
      unidades += e.saldo;
      valor += e.saldo * p.custo_medio;
      if (abaixoDoMinimo(p, l.id)) baixos.push(p);
      else if (e.estoque_minimo > 0 && e.saldo < e.estoque_minimo * 2) medios.push(p);
    }
    const nivel: 'baixo' | 'medio' | 'ok' | 'vazio' = baixos.length
      ? 'baixo'
      : medios.length
        ? 'medio'
        : unidades === 0
          ? 'vazio'
          : 'ok';
    return { loja: l, unidades, valor, baixos, medios, nivel };
  });
  const valorTotal = resumo.reduce((s, r) => s + r.valor, 0);
  const primeiroNome = usuario?.nome.split(' ')[0];

  return (
    <div className="space-y-6">
      <Titulo sub={`Olá, ${primeiroNome}! Você está trabalhando no estoque ${lojaAtual?.nome}.`}>Painel</Titulo>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="cartao">
          <div className="text-xs uppercase tracking-wide text-suave">Produtos ativos</div>
          <div className="mt-1 font-titulo text-3xl font-bold tabular">{numero(ativos.length)}</div>
        </div>
        {resumo.map((r) => (
          <div key={r.loja.id} className="cartao border-t-4" style={{ borderTopColor: r.loja.cor }}>
            <LojaTag loja={r.loja} tamanho="sm" />
            <div className="mt-2 font-titulo text-3xl font-bold tabular">{numero(r.unidades)}</div>
            <div className="text-xs text-suave">unidades · {moeda(r.valor)}</div>
            <div className={`mt-1 text-xs font-semibold ${r.baixos.length ? 'text-rose-400' : 'text-emerald-400'}`}>
              {r.baixos.length ? `${r.baixos.length} abaixo do mínimo` : 'Nenhum abaixo do mínimo'}
            </div>
          </div>
        ))}
        <div className="cartao border-t-4 border-t-dourado">
          <div className="text-xs uppercase tracking-wide text-suave">Valor do estoque (custo)</div>
          <div className="mt-1 break-words font-titulo text-xl font-bold tabular text-dourado sm:text-2xl">{moeda(valorTotal)}</div>
          <div className="text-xs text-suave">custo médio × saldo, todas as lojas</div>
        </div>
      </div>

      {/* Situação do estoque: baixo / médio / OK */}
      <div className="grid gap-4 lg:grid-cols-2">
        {resumo.map((r) => (
          <div key={r.loja.id} className="cartao" data-nivel={r.nivel}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {r.nivel === 'ok' ? (
                <CircleCheck className="h-5 w-5 text-emerald-400" />
              ) : (
                <TriangleAlert
                  className={`h-5 w-5 ${r.nivel === 'baixo' ? 'text-rose-400' : r.nivel === 'medio' ? 'text-amber-300' : 'text-suave'}`}
                />
              )}
              <h2 className="font-titulo font-bold">{NIVEIS[r.nivel]}</h2>
              <LojaTag loja={r.loja} tamanho="sm" />
            </div>
            <p className={`text-sm ${FRASE_COR[r.nivel]}`}>{FRASES[r.nivel]}</p>
          </div>
        ))}
      </div>

      {/* Últimas movimentações */}
      <div className="cartao p-0 sm:p-0">
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <h2 className="font-titulo font-bold">Últimas movimentações deste estoque</h2>
          <Link href="/movimentacoes" className="text-sm text-dourado hover:underline">
            Ver todas
          </Link>
        </div>
        {!ultimas ? (
          <Carregando />
        ) : ultimas.length === 0 ? (
          <div className="p-4">
            <Vazio>Nenhuma movimentação ainda.</Vazio>
          </div>
        ) : (
          ultimas.map((op) => <LinhaOperacao key={op.id} op={op} aoAbrir={() => setAberta(op.id)} />)
        )}
      </div>

      <DetalheOperacao id={aberta} aoFechar={() => setAberta(null)} />
    </div>
  );
}
