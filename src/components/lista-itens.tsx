'use client';

import { ArrowRight, Trash2 } from 'lucide-react';
import { useDados } from '@/lib/dados';
import { disponivelNaLoja, estoqueNaLoja, moeda, numero } from '@/lib/formato';
import type { Loja } from '@/lib/tipos';
import { LojaTag } from './loja';
import { CampoQuantidade, Vazio } from './ui';

export interface ItemLancamento {
  produto_id: number;
  quantidade: number | '';
  custo?: number | ''; // só na entrada
}

// Problemas de um item (quantidade vazia ou maior que o saldo)
export function erroDoItem(
  item: ItemLancamento,
  saldoDisponivel: number | null,
): string | null {
  if (item.quantidade === '' || item.quantidade <= 0) return 'Informe a quantidade';
  if (saldoDisponivel !== null && item.quantidade > saldoDisponivel)
    return `Só há ${saldoDisponivel} disponível`;
  return null;
}

// Tabela de produtos de um lançamento (entrada, saída ou transferência)
export function ListaItens({
  itens,
  aoMudar,
  modo,
  lojaOrigem,
  lojaDestino,
}: {
  itens: ItemLancamento[];
  aoMudar: (itens: ItemLancamento[]) => void;
  modo: 'entrada' | 'saida' | 'transferencia';
  lojaOrigem?: Loja;
  lojaDestino?: Loja;
}) {
  const { produtoPorId } = useDados();

  if (itens.length === 0) {
    return <Vazio>Nenhum produto adicionado. Use a busca acima (ou o leitor de código de barras).</Vazio>;
  }

  const atualizar = (i: number, mudanca: Partial<ItemLancamento>) =>
    aoMudar(itens.map((it, j) => (j === i ? { ...it, ...mudanca } : it)));
  const remover = (i: number) => aoMudar(itens.filter((_, j) => j !== i));

  const totalUnidades = itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
  const totalValor = itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.custo) || 0), 0);

  return (
    <div className="space-y-2">
      {itens.map((item, i) => {
        const p = produtoPorId(item.produto_id);
        if (!p) return null;
        const saldoOrigem = lojaOrigem ? estoqueNaLoja(p, lojaOrigem.id).saldo : null;
        const dispOrigem = lojaOrigem ? disponivelNaLoja(p, lojaOrigem.id) : null;
        const saldoDestino = lojaDestino ? estoqueNaLoja(p, lojaDestino.id).saldo : null;
        const erro = erroDoItem(item, modo === 'entrada' ? null : dispOrigem);
        const qtd = Number(item.quantidade) || 0;
        return (
          <div
            key={item.produto_id}
            className={`rounded-xl border bg-painel2 p-3 ${erro && item.quantidade !== '' ? 'border-rose-500/70' : 'border-borda'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium leading-snug">{p.nome}</div>
                <div className="text-xs text-suave">
                  SKU {p.sku} {p.ean && `· EAN ${p.ean}`} · {p.unidade}
                </div>
              </div>
              <button onClick={() => remover(i)} className="btn-fantasma text-rose-400" aria-label="Remover">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="w-36">
                <span className="rotulo text-xs">Quantidade</span>
                <CampoQuantidade
                  valor={item.quantidade}
                  aoMudar={(v) => atualizar(i, { quantidade: v })}
                  max={modo === 'entrada' ? undefined : (dispOrigem ?? undefined)}
                />
              </div>

              {modo === 'entrada' && (
                <>
                  <div className="w-36">
                    <span className="rotulo text-xs">Custo unitário (R$)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      className="campo tabular text-right"
                      value={item.custo ?? ''}
                      onChange={(e) => atualizar(i, { custo: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </div>
                  <div className="pb-2.5 text-sm text-suave">
                    Subtotal <b className="tabular text-white">{moeda(qtd * (Number(item.custo) || 0))}</b>
                  </div>
                  {lojaDestino && (
                    <div className="pb-2.5 text-sm text-suave">
                      Saldo: <span className="tabular">{saldoDestino}</span>
                      <ArrowRight className="mx-1 inline h-3 w-3" />
                      <b className="tabular text-emerald-400">{(saldoDestino ?? 0) + qtd}</b>
                    </div>
                  )}
                </>
              )}

              {modo === 'saida' && lojaOrigem && (
                <div className="pb-2.5 text-sm text-suave">
                  Disponível <b className="tabular text-white">{dispOrigem}</b>
                  <ArrowRight className="mx-1 inline h-3 w-3" />
                  saldo fica <b className="tabular text-white">{Math.max(0, (saldoOrigem ?? 0) - qtd)}</b>
                </div>
              )}

              {modo === 'transferencia' && lojaOrigem && lojaDestino && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 pb-2 text-sm text-suave">
                  <span className="flex items-center gap-1">
                    <LojaTag loja={lojaOrigem} tamanho="sm" />
                    <span className="tabular" title="disponível">{dispOrigem}</span>
                    <ArrowRight className="h-3 w-3" />
                    <b className="tabular text-white">{Math.max(0, (dispOrigem ?? 0) - qtd)}</b>
                  </span>
                  <span className="flex items-center gap-1">
                    <LojaTag loja={lojaDestino} tamanho="sm" />
                    <span className="tabular">{saldoDestino}</span>
                    <ArrowRight className="h-3 w-3" />
                    <b className="tabular text-emerald-400">{(saldoDestino ?? 0) + qtd}</b>
                  </span>
                </div>
              )}
            </div>
            {erro && item.quantidade !== '' && <div className="mt-2 text-sm font-medium text-rose-400">⚠ {erro}</div>}
          </div>
        );
      })}

      <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 px-1 pt-1 text-sm text-suave">
        <span>
          {itens.length} produto(s) · <b className="tabular text-white">{numero(totalUnidades)}</b> unidade(s)
        </span>
        {modo === 'entrada' && (
          <span>
            Total dos itens <b className="tabular text-dourado">{moeda(totalValor)}</b>
          </span>
        )}
      </div>
    </div>
  );
}
