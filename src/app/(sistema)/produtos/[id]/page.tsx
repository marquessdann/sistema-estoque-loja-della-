'use client';

import { ArrowLeftRight, Copy, PackageMinus, PackagePlus, Power, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LojaTag } from '@/components/loja';
import { KitComposicao } from '@/components/kit-composicao';
import { DetalheOperacao } from '@/components/operacoes';
import { ProdutoForm } from '@/components/produto-form';
import { Carregando, Confirmar, TipoBadge, Titulo, Vazio } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { abaixoDoMinimo, dataHora, estoqueNaLoja, moeda, rotuloMotivo } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { MovimentacaoLinha } from '@/lib/tipos';

export default function DetalheProduto() {
  const { id } = useParams<{ id: string }>();
  const { produtoPorId, lojas, versao, recarregar, pode, ehAdmin, ehCeo } = useDados();
  const router = useRouter();
  const produto = produtoPorId(Number(id));
  const [alteracoes, setAlteracoes] = useState<
    { id: number; usuario_nome: string | null; acao: string; tabela: string; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null; criado_em: string }[]
  >([]);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [historico, setHistorico] = useState<MovimentacaoLinha[] | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [confirmarStatus, setConfirmarStatus] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    supabaseNavegador()
      .from('vw_movimentacoes')
      .select('*')
      .eq('produto_id', Number(id))
      .order('criado_em', { ascending: false })
      .limit(100)
      .then(({ data }) => setHistorico((data ?? []) as MovimentacaoLinha[]));
  }, [id, versao]);

  // histórico de alterações do cadastro (só o admin lê a auditoria)
  useEffect(() => {
    if (!ehAdmin) return;
    supabaseNavegador()
      .from('auditoria')
      .select('id, usuario_nome, acao, tabela, antes, depois, criado_em')
      .or(`and(tabela.eq.produtos,registro_id.eq.${Number(id)}),and(tabela.eq.produto_loja,registro_id.like.${Number(id)}/*)`)
      .order('criado_em', { ascending: false })
      .limit(50)
      .then(({ data }) => setAlteracoes((data ?? []) as typeof alteracoes));
  }, [id, versao, ehAdmin]);

  if (!produto) return <Vazio>Produto não encontrado.</Vazio>;

  async function excluir() {
    setOcupado(true);
    const { error } = await supabaseNavegador().rpc('excluir_produto', { p_id: Number(id) });
    setOcupado(false);
    setConfirmarExcluir(false);
    if (error) return toast.error(mensagemErro(error));
    toast.success('Produto excluído.');
    await recarregar();
    router.push('/produtos');
  }

  async function alternarStatus() {
    if (!produto) return;
    setOcupado(true);
    const { error } = await supabaseNavegador().rpc('definir_produto_ativo', { p_id: produto.id, p_ativo: !produto.ativo });
    setOcupado(false);
    setConfirmarStatus(false);
    if (error) return toast.error(mensagemErro(error));
    await recarregar();
    toast.success(produto.ativo ? 'Produto inativado.' : 'Produto reativado.');
  }

  const temSaldo = produto.estoques.some((e) => e.saldo > 0);

  return (
    <div className="space-y-5">
      <Titulo
        sub={
          <>
            SKU {produto.sku}
            {produto.ean && ` · EAN ${produto.ean}`}
            {produto.eh_kit && <span className="ml-2 rounded bg-dourado px-1.5 py-0.5 text-xs font-bold text-preto">KIT</span>}
            {!produto.ativo && <span className="ml-2 font-semibold text-rose-400">INATIVO</span>}
          </>
        }
      >
        {produto.nome}
      </Titulo>

      {/* Estoque por loja */}
      <div className="grid gap-3 sm:grid-cols-2">
        {lojas.map((l) => {
          const e = estoqueNaLoja(produto, l.id);
          const baixo = abaixoDoMinimo(produto, l.id);
          return (
            <div key={l.id} className="cartao border-l-4" style={{ borderLeftColor: l.cor }}>
              <div className="flex items-center justify-between">
                <div>
                  <LojaTag loja={l} />
                  <div className="mt-1 text-xs text-suave">{produto.eh_kit ? 'kits que dá para montar' : `mínimo ${e.estoque_minimo}`}</div>
                </div>
                <div className={`font-titulo text-4xl font-bold tabular ${baixo ? 'text-rose-400' : ''}`}>{e.saldo}</div>
              </div>
            </div>
          );
        })}
      </div>
      <KitComposicao produto={produto} />

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-suave">
        <span>
          Total nas lojas: <b className="text-white">{lojas.reduce((s, l) => s + estoqueNaLoja(produto, l.id).saldo, 0)}</b> {produto.unidade}
        </span>
        <span>
          Custo médio: <b className="text-white">{moeda(produto.custo_medio)}</b>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {produto.ativo && pode('transferir') && (
          <Link href={`/transferencia?produto=${produto.id}`} className="btn-azul col-span-2 sm:col-span-1">
            <ArrowLeftRight className="h-4 w-4" /> Transferir
          </Link>
        )}
        {produto.ativo && !produto.eh_kit && pode('entrada') && (
          <Link href={`/entrada?produto=${produto.id}`} className="btn-secundario">
            <PackagePlus className="h-4 w-4" /> Entrada
          </Link>
        )}
        {produto.ativo && pode('saida') && (
          <Link href={`/saida?produto=${produto.id}`} className="btn-secundario">
            <PackageMinus className="h-4 w-4" /> Saída
          </Link>
        )}
        {pode('produtos') && (
          <Link href={`/produtos/novo?duplicar=${produto.id}`} className="btn-secundario">
            <Copy className="h-4 w-4" /> Duplicar
          </Link>
        )}
        {ehAdmin && (
          <button className={`btn-secundario ${produto.ativo ? 'text-rose-300' : 'text-emerald-300'}`} onClick={() => setConfirmarStatus(true)}>
            <Power className="h-4 w-4" /> {produto.ativo ? 'Inativar' : 'Reativar'}
          </button>
        )}
        {ehCeo && historico && historico.length === 0 && (
          <button className="btn-secundario text-rose-300" onClick={() => setConfirmarExcluir(true)}>
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
        )}
      </div>

      <ProdutoForm key={produto.id} produto={produto} somenteLeitura={!pode('produtos')} />

      {/* Histórico do produto */}
      <div className="cartao p-0 sm:p-0">
        <h2 className="border-b border-borda px-4 py-3 font-titulo font-bold">Histórico de movimentações</h2>
        {!historico ? (
          <Carregando />
        ) : historico.length === 0 ? (
          <p className="p-4 text-sm text-suave">Este produto ainda não teve movimentações.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Loja</th>
                  <th className="text-right">Qtd.</th>
                  <th className="text-right">Antes → depois</th>
                  <th>Detalhe</th>
                  <th>Usuário</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((m) => (
                  <tr key={m.id} className="cursor-pointer" onClick={() => setAberta(m.operacao_id)}>
                    <td className="whitespace-nowrap text-xs">{dataHora(m.criado_em)}</td>
                    <td>
                      <TipoBadge tipo={m.tipo} />
                    </td>
                    <td>
                      <LojaTag loja={{ nome: m.loja_nome, cor: m.loja_cor }} tamanho="sm" />
                    </td>
                    <td className={`tabular text-right font-semibold ${m.quantidade > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {m.quantidade > 0 ? '+' : ''}
                      {m.quantidade}
                    </td>
                    <td className="tabular text-right">
                      <span className="text-suave">{m.saldo_antes}</span> → {m.saldo_apos}
                    </td>
                    <td className="text-xs text-suave">
                      {rotuloMotivo(m.motivo)}
                      {m.nf_numero && ` · NF ${m.nf_numero}`}
                      {m.tipo === 'entrada' && m.custo_unitario != null && ` · ${moeda(m.custo_unitario)}/un`}
                    </td>
                    <td className="whitespace-nowrap text-xs">{m.usuario_nome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ehAdmin && (
        <div className="cartao p-0 sm:p-0">
          <h2 className="border-b border-borda px-4 py-3 font-titulo font-bold">Alterações do cadastro</h2>
          {alteracoes.length === 0 ? (
            <p className="p-4 text-sm text-suave">Nenhuma alteração registrada.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {alteracoes.map((a) => {
                const campos =
                  a.antes && a.depois
                    ? Object.keys(a.depois).filter(
                        (k) => !['atualizado_em', 'atualizado_por', 'saldo'].includes(k) && JSON.stringify(a.antes![k]) !== JSON.stringify(a.depois![k]),
                      )
                    : [];
                return (
                  <li key={a.id} className="px-4 py-2 text-sm">
                    <b>{a.usuario_nome ?? 'Sistema'}</b> {a.acao} {a.tabela === 'produto_loja' ? 'o estoque mínimo' : 'o cadastro'}
                    {campos.length > 0 && (
                      <span className="text-suave">
                        {' '}
                        ({campos.map((k) => `${k}: ${String(a.antes![k] ?? '—')} → ${String(a.depois![k] ?? '—')}`).join('; ')})
                      </span>
                    )}
                    <div className="text-xs text-suave">{dataHora(a.criado_em)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <DetalheOperacao id={aberta} aoFechar={() => setAberta(null)} />

      <Confirmar
        aberto={confirmarExcluir}
        titulo="Excluir produto?"
        textoConfirmar="Sim, excluir"
        perigo
        ocupado={ocupado}
        aoCancelar={() => setConfirmarExcluir(false)}
        aoConfirmar={excluir}
      >
        <p>Este produto nunca teve movimentação, então pode ser excluído de vez. Esta ação não pode ser desfeita.</p>
      </Confirmar>

      <Confirmar
        aberto={confirmarStatus}
        titulo={produto.ativo ? 'Inativar produto?' : 'Reativar produto?'}
        textoConfirmar={produto.ativo ? 'Sim, inativar' : 'Sim, reativar'}
        perigo={produto.ativo}
        ocupado={ocupado}
        aoCancelar={() => setConfirmarStatus(false)}
        aoConfirmar={alternarStatus}
      >
        {produto.ativo ? (
          <>
            <p>O produto some das buscas e não poderá receber novos lançamentos. O histórico continua guardado.</p>
            {temSaldo && <p className="font-semibold text-orange-300">Atenção: este produto ainda tem saldo em estoque.</p>}
          </>
        ) : (
          <p>O produto volta a aparecer nas buscas e pode receber lançamentos.</p>
        )}
      </Confirmar>
    </div>
  );
}
