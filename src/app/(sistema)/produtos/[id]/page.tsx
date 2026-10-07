'use client';

import { ArrowLeftRight, Copy, PackageMinus, PackagePlus, Power } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LojaTag } from '@/components/loja';
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
  const { produtoPorId, lojas, versao, recarregar } = useDados();
  const produto = produtoPorId(Number(id));
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

  if (!produto) return <Vazio>Produto não encontrado.</Vazio>;

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
            {!produto.ativo && <span className="ml-2 font-semibold text-rose-400">INATIVO</span>}
          </>
        }
      >
        {produto.nome}
      </Titulo>

      {/* Saldos e ações rápidas */}
      <div className="grid gap-3 sm:grid-cols-2">
        {lojas.map((l) => {
          const e = estoqueNaLoja(produto, l.id);
          const baixo = abaixoDoMinimo(produto, l.id);
          return (
            <div key={l.id} className="cartao flex items-center justify-between border-l-4" style={{ borderLeftColor: l.cor }}>
              <div>
                <LojaTag loja={l} />
                <div className="mt-1 text-xs text-suave">mínimo {e.estoque_minimo}</div>
              </div>
              <div className={`font-titulo text-4xl font-bold tabular ${baixo ? 'text-rose-400' : ''}`}>{e.saldo}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {produto.ativo && (
          <>
            <Link href={`/transferencia?produto=${produto.id}`} className="btn-azul col-span-2 sm:col-span-1">
              <ArrowLeftRight className="h-4 w-4" /> Transferir
            </Link>
            <Link href={`/entrada?produto=${produto.id}`} className="btn-secundario">
              <PackagePlus className="h-4 w-4" /> Entrada
            </Link>
            <Link href={`/saida?produto=${produto.id}`} className="btn-secundario">
              <PackageMinus className="h-4 w-4" /> Saída
            </Link>
          </>
        )}
        <Link href={`/produtos/novo?duplicar=${produto.id}`} className="btn-secundario">
          <Copy className="h-4 w-4" /> Duplicar
        </Link>
        <button className={`btn-secundario ${produto.ativo ? 'text-rose-300' : 'text-emerald-300'}`} onClick={() => setConfirmarStatus(true)}>
          <Power className="h-4 w-4" /> {produto.ativo ? 'Inativar' : 'Reativar'}
        </button>
      </div>

      <ProdutoForm key={`${produto.id}-${produto.atualizado_em}`} produto={produto} />

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
                  <th className="text-right">Saldo</th>
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
                    <td className="tabular text-right">{m.saldo_apos}</td>
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

      <DetalheOperacao id={aberta} aoFechar={() => setAberta(null)} />

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
