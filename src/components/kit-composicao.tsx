'use client';

import { Boxes, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { KitItem, Produto } from '@/lib/tipos';
import { ProdutoBusca } from './produto-busca';
import { CampoQuantidade } from './ui';

// Composição do kit: quais produtos (e quantos de cada) formam 1 kit.
// Dar baixa em 1 kit tira cada componente do estoque.
export function KitComposicao({ produto }: { produto: Produto }) {
  const { produtoPorId, lojas, pode, recarregar } = useDados();
  const [itens, setItens] = useState<(Omit<KitItem, 'quantidade'> & { quantidade: number | '' })[]>(produto.kit ?? []);
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const podeEditar = pode('produtos');
  // produto com estoque ou histórico próprio não vira kit
  const temEstoqueProprio = !produto.eh_kit && produto.estoques.some((e) => e.saldo !== 0);

  useEffect(() => {
    if (!editando) setItens(produto.kit ?? []);
  }, [produto.kit, editando]);

  if (!produto.eh_kit && (!podeEditar || temEstoqueProprio)) return null;

  async function salvar() {
    if (itens.some((i) => !i.quantidade || Number(i.quantidade) < 1)) return toast.error('Informe a quantidade de cada componente.');
    setOcupado(true);
    const { error } = await supabaseNavegador().rpc('salvar_kit', {
      p_kit: produto.id,
      p_itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: Number(i.quantidade) })),
    });
    setOcupado(false);
    if (error) return toast.error(mensagemErro(error));
    await recarregar();
    setEditando(false);
    toast.success(itens.length ? 'Composição do kit salva!' : 'O produto deixou de ser kit.');
  }

  function adicionar(p: Produto) {
    if (p.id === produto.id) return toast.error('O kit não pode ser componente dele mesmo.');
    setItens((l) =>
      l.some((i) => i.produto_id === p.id)
        ? l.map((i) => (i.produto_id === p.id ? { ...i, quantidade: (Number(i.quantidade) || 0) + 1 } : i))
        : [...l, { produto_id: p.id, quantidade: 1 }],
    );
  }

  if (!produto.eh_kit && !editando)
    return (
      <div className="cartao flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-suave">É um kit (vários produtos vendidos juntos)?</span>
        <button className="btn-secundario" onClick={() => setEditando(true)}>
          <Boxes className="h-4 w-4" /> Transformar em kit
        </button>
      </div>
    );

  return (
    <div className="cartao space-y-3" data-kit>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-titulo font-bold">
          <Boxes className="h-5 w-5 text-dourado" /> Composição do kit
        </h2>
        {podeEditar && !editando && (
          <button className="btn-secundario text-xs" onClick={() => setEditando(true)}>
            Editar composição
          </button>
        )}
      </div>
      <p className="text-xs text-suave">
        O kit não tem estoque próprio. Dar baixa em 1 kit tira do estoque cada produto abaixo; o número de kits disponíveis é
        o que dá para montar com o componente que acabar primeiro.
      </p>
      <ul className="divide-y divide-borda rounded-lg border border-borda">
        {itens.map((i) => {
          const c = produtoPorId(i.produto_id);
          return (
            <li key={i.produto_id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <Link href={`/produtos/${i.produto_id}`} className="inline-block py-2 font-medium hover:underline">
                  {c?.nome ?? `Produto ${i.produto_id}`}
                </Link>
                <div className="text-xs text-suave">
                  SKU {c?.sku} ·{' '}
                  {lojas.map((l) => `${l.nome}: ${c?.estoques.find((e) => e.loja_id === l.id)?.saldo ?? 0}`).join(' · ')}
                </div>
              </div>
              {editando ? (
                <>
                  <CampoQuantidade
                    valor={i.quantidade}
                    min={1}
                    aoMudar={(v) => setItens((l) => l.map((x) => (x.produto_id === i.produto_id ? { ...x, quantidade: v } : x)))}
                  />
                  <button
                    className="btn-fantasma text-rose-400"
                    aria-label="Remover componente"
                    onClick={() => setItens((l) => l.filter((x) => x.produto_id !== i.produto_id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <b className="tabular">x{i.quantidade}</b>
              )}
            </li>
          );
        })}
        {itens.length === 0 && <li className="p-3 text-sm text-suave">Nenhum componente ainda.</li>}
      </ul>
      {editando && (
        <>
          <ProdutoBusca aoEscolher={adicionar} semKits placeholder="Adicionar produto ao kit..." />
          <div className="flex justify-end gap-2">
            <button className="btn-secundario" onClick={() => setEditando(false)}>
              Cancelar
            </button>
            <button className="btn-principal" disabled={ocupado} onClick={salvar}>
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} Salvar composição
            </button>
          </div>
        </>
      )}
    </div>
  );
}
