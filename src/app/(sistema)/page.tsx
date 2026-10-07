'use client';

import { ArrowLeftRight, PackagePlus, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LojaTag } from '@/components/loja';
import { DetalheOperacao, LinhaOperacao } from '@/components/operacoes';
import { Carregando, Titulo, Vazio } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { abaixoDoMinimo, estoqueNaLoja, moeda, numero, sugestaoTransferencia } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { OperacaoResumo } from '@/lib/tipos';

export default function Painel() {
  const { produtos, lojas, versao, usuario, pode, lojaAtual } = useDados();
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

  const ativos = useMemo(() => produtos.filter((p) => p.ativo), [produtos]);
  const lojaIds = lojas.map((l) => l.id);

  const ordenadas = [...lojas].sort((a, b) => (a.id === lojaAtual?.id ? -1 : b.id === lojaAtual?.id ? 1 : 0));
  const resumo = ordenadas.map((l) => {
    let unidades = 0;
    let valor = 0;
    const baixos = [];
    for (const p of ativos) {
      const e = estoqueNaLoja(p, l.id);
      unidades += e.saldo;
      valor += e.saldo * p.custo_medio;
      if (abaixoDoMinimo(p, l.id)) baixos.push(p);
    }
    return { loja: l, unidades, valor, baixos };
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
          <div className="mt-1 font-titulo text-2xl font-bold tabular text-dourado">{moeda(valorTotal)}</div>
          <div className="text-xs text-suave">custo médio × saldo, todas as lojas</div>
        </div>
      </div>

      {/* Atalhos (só o que o usuário pode fazer) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {pode('entrada') && (
          <Link href="/entrada" className="btn-principal h-14 text-base">
            <PackagePlus className="h-5 w-5" /> Entrada
          </Link>
        )}
        {pode('transferir') && (
          <Link href="/transferencia" className="btn-azul h-14 text-base">
            <ArrowLeftRight className="h-5 w-5" /> Transferir
          </Link>
        )}
        {pode('saida') && (
          <Link href="/saida" className="btn-secundario h-14 text-base">
            Saída
          </Link>
        )}
        {pode('inventario') && (
          <Link href="/inventario" className="btn-secundario h-14 text-base">
            Inventário
          </Link>
        )}
      </div>

      {/* Alertas de estoque baixo */}
      <div className="grid gap-4 lg:grid-cols-2">
        {resumo.map((r) => (
          <div key={r.loja.id} className="cartao">
            <div className="mb-3 flex items-center gap-2">
              <TriangleAlert className={`h-5 w-5 ${r.baixos.length ? 'text-rose-400' : 'text-emerald-400'}`} />
              <h2 className="font-titulo font-bold">Estoque baixo</h2>
              <LojaTag loja={r.loja} tamanho="sm" />
            </div>
            {r.baixos.length === 0 ? (
              <p className="text-sm text-suave">Tudo certo: nenhum produto abaixo do mínimo.</p>
            ) : (
              <ul className="space-y-2">
                {r.baixos.slice(0, 12).map((p) => {
                  const e = estoqueNaLoja(p, r.loja.id);
                  const sug = sugestaoTransferencia(p, r.loja.id, lojaIds);
                  const origem = sug ? lojas.find((l) => l.id === sug.origemId) : null;
                  return (
                    <li key={p.id} className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link href={`/produtos/${p.id}`} className="min-w-0 font-medium hover:text-dourado">
                          {p.nome}
                        </Link>
                        <span className="text-sm tabular">
                          <b className="text-rose-400">{e.saldo}</b>
                          <span className="text-suave"> / mín. {e.estoque_minimo}</span>
                        </span>
                      </div>
                      {sug && origem && origem.id === lojaAtual?.id && pode('transferir') ? (
                        // a sobra está AQUI: dá para enviar daqui mesmo
                        <Link
                          href={`/transferencia?destino=${r.loja.id}&produto=${p.id}&qtd=${sug.quantidade}`}
                          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-marinho px-3 py-1.5 text-xs font-semibold text-white hover:bg-azul"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                          Enviar {sug.quantidade} daqui para {r.loja.nome}
                        </Link>
                      ) : sug && origem ? (
                        // a sobra está na outra loja: a transferência é feita no painel dela
                        <div className="mt-2 text-xs text-sky-300">
                          {origem.nome} tem sobra de {sug.quantidade}: a transferência é feita dentro do estoque {origem.nome}.
                        </div>
                      ) : r.loja.id !== lojaAtual?.id || !pode('entrada') ? null : (
                        <Link
                          href={`/entrada?produto=${p.id}`}
                          className="mt-2 inline-flex items-center gap-1 text-xs text-dourado hover:underline"
                        >
                          Sem sobra na outra loja — registrar compra/entrada
                        </Link>
                      )}
                    </li>
                  );
                })}
                {r.baixos.length > 12 && (
                  <li className="text-center text-sm">
                    <Link href={`/produtos?baixo=${r.loja.id}`} className="text-dourado hover:underline">
                      Ver todos os {r.baixos.length} produtos
                    </Link>
                  </li>
                )}
              </ul>
            )}
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
