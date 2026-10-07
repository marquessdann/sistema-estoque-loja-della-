'use client';

import { ArrowRight, FileDown, FileSpreadsheet, Paperclip, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { exportarExcel, exportarPDF, type Coluna } from '@/lib/exportar';
import {
  dataHora,
  data as fmtData,
  fimDoDia,
  hojeISO,
  inicioDoDia,
  moeda,
  numero,
  PLATAFORMAS,
  rotuloMotivo,
  rotuloPlataforma,
  TIPOS,
} from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { MovimentacaoLinha, NotaFiscal, OperacaoResumo, Plataforma, TipoOperacao } from '@/lib/tipos';
import { formatarChave, formatarCNPJ } from '@/lib/validacao';
import { LojaTag } from './loja';
import { abrirAnexoNota } from './nota-fiscal';
import { ProdutoBusca } from './produto-busca';
import { Campo, Carregando, Confirmar, Modal, TipoBadge, Vazio } from './ui';

// Resumo de "de onde para onde" de uma operação
export function LojasDaOperacao({ op }: { op: OperacaoResumo }) {
  const origem = op.origem_nome ? { nome: op.origem_nome, cor: op.origem_cor ?? '#555' } : null;
  const destino = op.destino_nome ? { nome: op.destino_nome, cor: op.destino_cor ?? '#555' } : null;
  if (origem && destino)
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <LojaTag loja={origem} tamanho="sm" />
        <ArrowRight className="h-3 w-3 text-suave" />
        <LojaTag loja={destino} tamanho="sm" />
      </span>
    );
  if (origem || destino) return <LojaTag loja={origem ?? destino} tamanho="sm" />;
  return <span className="text-xs text-suave">Todas as lojas</span>;
}

// Etiqueta da plataforma do pedido (Mercado Livre / TikTok Shop / Shopee)
export function PlataformaTag({ plataforma }: { plataforma: Plataforma | null | undefined }) {
  if (!plataforma || !PLATAFORMAS[plataforma]) return null;
  return <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${PLATAFORMAS[plataforma].cor}`}>{PLATAFORMAS[plataforma].rotulo}</span>;
}

// Uma linha da lista de operações (clicável)
export function LinhaOperacao({ op, aoAbrir }: { op: OperacaoResumo; aoAbrir: () => void }) {
  return (
    <button
      onClick={aoAbrir}
      className="flex w-full flex-col gap-1.5 border-b border-borda/60 px-3 py-3 text-left transition last:border-0 hover:bg-white/[0.03] sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="flex items-center gap-2 sm:w-44 sm:shrink-0">
        <TipoBadge tipo={op.tipo} />
        <span className="text-xs text-suave">nº {op.id}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <LojasDaOperacao op={op} />
          <span className="text-neutral-300">{rotuloMotivo(op.motivo)}</span>
          <PlataformaTag plataforma={op.plataforma} />
          {op.numero_pedido && <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs font-semibold">Pedido {op.numero_pedido}</span>}
          {op.cliente_nome && <span className="text-xs text-suave">{op.cliente_nome}</span>}
          {op.nf_numero && <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-dourado">NF {op.nf_numero}</span>}
          {op.estornada_por && <span className="rounded bg-orange-400/10 px-1.5 py-0.5 text-xs text-orange-300">estornada</span>}
        </div>
        <div className="mt-0.5 text-xs text-suave">
          {dataHora(op.data_hora ?? op.criado_em)} · {op.usuario_nome} · {op.qtd_produtos} produto(s), {numero(op.qtd_unidades)} un.
        </div>
      </div>
    </button>
  );
}

// Janela com todos os detalhes de uma operação (itens, nota, estorno)
export function DetalheOperacao({ id, aoFechar }: { id: number | null; aoFechar: () => void }) {
  const { versao, pode, lojaAtual } = useDados();
  const [op, setOp] = useState<OperacaoResumo | null>(null);
  const [itens, setItens] = useState<MovimentacaoLinha[]>([]);
  const [nota, setNota] = useState<NotaFiscal | null>(null);
  const [estornar, setEstornar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!id) return;
    const sb = supabaseNavegador();
    setOp(null);
    (async () => {
      const [o, m] = await Promise.all([
        sb.from('vw_operacoes').select('*').eq('id', id).single(),
        sb.from('vw_movimentacoes').select('*').eq('operacao_id', id).order('produto_nome').order('quantidade'),
      ]);
      if (o.error) return toast.error(mensagemErro(o.error));
      setOp(o.data as OperacaoResumo);
      setItens((m.data ?? []) as MovimentacaoLinha[]);
      if (o.data.nota_fiscal_id) {
        const n = await sb.from('vw_notas').select('*').eq('id', o.data.nota_fiscal_id).single();
        setNota((n.data as NotaFiscal) ?? null);
      } else setNota(null);
    })();
  }, [id, versao]);

  async function confirmarEstorno() {
    if (!op) return;
    if (!motivo.trim()) return toast.error('Informe o motivo do estorno.');
    setOcupado(true);
    const { data, error } = await supabaseNavegador().rpc('estornar_operacao', {
      p_operacao_id: op.id,
      p_motivo: motivo.trim(),
    });
    setOcupado(false);
    if (error) return toast.error(mensagemErro(error));
    toast.success(`Lançamento nº ${op.id} estornado (estorno nº ${data}).`);
    setEstornar(false);
    setMotivo('');
  }

  // só estorna lançamento do estoque em que a pessoa está
  const doEstoqueAtual = itens.length > 0 && itens.every((m) => m.loja_id === lojaAtual?.id);
  const podeEstornar = op && op.tipo !== 'estorno' && !op.estornada_por && !op.transferencia_id && pode('estornar') && doEstoqueAtual;

  return (
    <Modal aberto={id !== null} aoFechar={aoFechar} titulo={op ? `${TIPOS[op.tipo].rotulo} nº ${op.id}` : 'Carregando...'} largura="max-w-3xl">
      {!op ? (
        <Carregando />
      ) : (
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <Info rotulo="Registrado em">{dataHora(op.criado_em)}</Info>
            {op.data_hora && dataHora(op.data_hora) !== dataHora(op.criado_em) && (
              <Info rotulo="Data e hora informadas">{dataHora(op.data_hora)}</Info>
            )}
            {op.plataforma && (
              <Info rotulo="Plataforma">
                <PlataformaTag plataforma={op.plataforma} />
              </Info>
            )}
            {op.numero_pedido && <Info rotulo="Número do pedido">{op.numero_pedido}</Info>}
            {op.cliente_nome && <Info rotulo="Cliente">{op.cliente_nome}</Info>}
            {op.transferencia_id && (
              <Info rotulo="Transferência">
                <Link href={`/transferencias/${op.transferencia_id}`} className="text-dourado underline">
                  Ver transferência nº {op.transferencia_id}
                </Link>
              </Info>
            )}
            <Info rotulo="Feito por">{op.usuario_nome}</Info>
            <Info rotulo="Loja(s)">
              <LojasDaOperacao op={op} />
            </Info>
            <Info rotulo="Motivo">{rotuloMotivo(op.motivo) || '—'}</Info>
            {op.observacao && (
              <Info rotulo="Observação" className="sm:col-span-2">
                {op.observacao}
              </Info>
            )}
            {op.estorno_de && <Info rotulo="Estorno do lançamento">nº {op.estorno_de}</Info>}
            {op.estornada_por && (
              <Info rotulo="Situação">
                <span className="text-orange-300">Estornado pelo lançamento nº {op.estornada_por}</span>
              </Info>
            )}
          </div>

          {nota && (
            <div className="rounded-xl border border-borda bg-painel2 p-3">
              <div className="mb-2 font-semibold text-dourado">
                Nota fiscal {nota.numero}
                {nota.serie && ` · série ${nota.serie}`}
              </div>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <span>Emissão: {fmtData(nota.data_emissao) || '—'}</span>
                <span>Valor: {nota.valor_total != null ? moeda(nota.valor_total) : '—'}</span>
                <span className="sm:col-span-2">
                  Fornecedor: {nota.fornecedor_nome ?? '—'} {nota.fornecedor_cnpj && `(${formatarCNPJ(nota.fornecedor_cnpj)})`}
                </span>
                {nota.chave_acesso && <span className="tabular sm:col-span-2">Chave: {formatarChave(nota.chave_acesso)}</span>}
                {(nota.cfop || nota.natureza_operacao) && (
                  <span className="sm:col-span-2">
                    CFOP {nota.cfop ?? '—'} · {nota.natureza_operacao ?? ''}
                  </span>
                )}
              </div>
              {nota.arquivo_path && (
                <button className="btn-secundario mt-2 min-h-0 py-1.5 text-xs" onClick={() => abrirAnexoNota(nota.arquivo_path!)}>
                  <Paperclip className="h-3.5 w-3.5" /> Abrir anexo ({nota.arquivo_nome})
                </button>
              )}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-borda">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Loja</th>
                  <th className="text-right">Qtd.</th>
                  <th className="text-right">Saldo antes → depois</th>
                  <th className="text-right">Custo un.</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="font-medium">{m.produto_nome}</div>
                      <div className="text-xs text-suave">SKU {m.sku}</div>
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
                    <td className="tabular text-right text-suave">{m.custo_unitario != null ? moeda(m.custo_unitario) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {podeEstornar && (
            <div className="flex justify-end">
              <button className="btn-secundario text-orange-300" onClick={() => setEstornar(true)}>
                <Undo2 className="h-4 w-4" /> Estornar (desfazer) este lançamento
              </button>
            </div>
          )}
        </div>
      )}

      <Confirmar
        aberto={estornar}
        titulo="Estornar lançamento?"
        textoConfirmar="Sim, estornar"
        perigo
        ocupado={ocupado}
        aoCancelar={() => setEstornar(false)}
        aoConfirmar={confirmarEstorno}
      >
        <p>
          O sistema vai criar um lançamento <b>inverso</b> que desfaz as quantidades deste lançamento. O original continua
          no histórico, marcado como estornado.
        </p>
        <Campo rotulo="Motivo do estorno" obrigatorio>
          <input className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: quantidade digitada errada" autoFocus />
        </Campo>
      </Confirmar>
    </Modal>
  );
}

function Info({ rotulo, children, className = '' }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-wide text-suave">{rotulo}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

// Lista de operações com filtros (usada em Movimentações e Histórico de transferências)
export function ListaOperacoes({ tipoFixo }: { tipoFixo?: TipoOperacao }) {
  const { versao, produtoPorId, pode, lojaAtual } = useDados();
  const [de, setDe] = useState(hojeISO(-30));
  const [ate, setAte] = useState(hojeISO());
  const [tipo, setTipo] = useState<TipoOperacao | ''>(tipoFixo ?? '');
  // cada estoque vê as próprias movimentações
  const lojaId = lojaAtual?.id ?? '';
  const [nf, setNf] = useState('');
  const [pedido, setPedido] = useState('');
  const [plataforma, setPlataforma] = useState<Plataforma | ''>('');
  const [produtoId, setProdutoId] = useState<number | null>(null);
  const [lista, setLista] = useState<OperacaoResumo[] | null>(null);
  const [limite, setLimite] = useState(100);
  const [aberta, setAberta] = useState<number | null>(null);

  // abre direto pelo endereço (?nf=123 ou ?op=45)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('nf')) {
      setNf(q.get('nf')!);
      setDe('');
    }
    if (q.get('op')) setAberta(Number(q.get('op')));
  }, []);

  const buscar = useCallback(async () => {
    const sb = supabaseNavegador();
    let consulta = sb.from('vw_operacoes').select('*').order('criado_em', { ascending: false }).limit(limite);
    if (de) consulta = consulta.gte('criado_em', inicioDoDia(de));
    if (ate) consulta = consulta.lte('criado_em', fimDoDia(ate));
    if (tipo) consulta = consulta.eq('tipo', tipo);
    if (lojaId) consulta = consulta.or(`loja_origem_id.eq.${lojaId},loja_destino_id.eq.${lojaId}`);
    if (nf.trim()) consulta = consulta.ilike('nf_numero', `%${nf.trim().replace(/[%_,()]/g, '')}%`);
    if (pedido.trim()) consulta = consulta.ilike('numero_pedido', `%${pedido.trim().replace(/[%_,()]/g, '')}%`);
    if (plataforma) consulta = consulta.eq('plataforma', plataforma);
    if (produtoId) {
      // (os 300 lançamentos mais recentes do produto: limite do tamanho do endereço da consulta)
      const { data: movs } = await sb.from('movimentacoes').select('operacao_id').eq('produto_id', produtoId).order('id', { ascending: false }).limit(300);
      const ids = [...new Set((movs ?? []).map((m) => m.operacao_id))];
      if (ids.length === 0) return setLista([]);
      consulta = consulta.in('id', ids);
    }
    const { data, error } = await consulta;
    if (error) {
      toast.error(mensagemErro(error));
      return setLista([]);
    }
    setLista(data as OperacaoResumo[]);
  }, [de, ate, tipo, lojaId, nf, pedido, plataforma, produtoId, limite]);

  useEffect(() => {
    const t = setTimeout(buscar, 250);
    return () => clearTimeout(t);
  }, [buscar, versao]);

  async function exportar(formato: 'xlsx' | 'pdf') {
    // exporta item a item (cada produto de cada lançamento)
    if (!lista || lista.length === 0) return toast.error('Nada para exportar.');
    const sb = supabaseNavegador();
    const { data, error } = await sb
      .from('vw_movimentacoes')
      .select('*')
      .in('operacao_id', lista.map((o) => o.id))
      .order('criado_em', { ascending: false });
    if (error) return toast.error(mensagemErro(error));
    const colunas: Coluna<MovimentacaoLinha>[] = [
      { titulo: 'Data/hora', valor: (m) => dataHora(m.data_hora ?? m.criado_em), largura: 17 },
      { titulo: 'Nº', valor: (m) => m.operacao_id, formato: 'inteiro', largura: 7 },
      { titulo: 'Tipo', valor: (m) => TIPOS[m.tipo].rotulo, largura: 13 },
      { titulo: 'Motivo', valor: (m) => rotuloMotivo(m.motivo), largura: 20 },
      { titulo: 'Loja', valor: (m) => m.loja_nome, largura: 15 },
      { titulo: 'SKU', valor: (m) => m.sku, largura: 12 },
      { titulo: 'Produto', valor: (m) => m.produto_nome, largura: 40 },
      { titulo: 'Qtd.', valor: (m) => m.quantidade, formato: 'inteiro', largura: 7 },
      { titulo: 'Saldo antes', valor: (m) => m.saldo_antes, formato: 'inteiro', largura: 10 },
      { titulo: 'Saldo depois', valor: (m) => m.saldo_apos, formato: 'inteiro', largura: 10 },
      { titulo: 'Plataforma', valor: (m) => rotuloPlataforma(m.plataforma), largura: 13 },
      { titulo: 'Pedido', valor: (m) => m.numero_pedido ?? '', largura: 16 },
      { titulo: 'NF', valor: (m) => m.nf_numero ?? '', largura: 10 },
      { titulo: 'Cliente', valor: (m) => m.cliente_nome ?? '', largura: 20 },
      { titulo: 'Usuário', valor: (m) => m.usuario_nome, largura: 16 },
    ];
    const linhas = (data ?? []) as MovimentacaoLinha[];
    const nome = tipoFixo === 'transferencia' ? 'transferencias' : 'movimentacoes';
    const periodo = `Período: ${de ? fmtData(de) : 'início'} a ${ate ? fmtData(ate) : 'hoje'}`;
    if (formato === 'xlsx') await exportarExcel(nome, [{ nome: 'Movimentações', colunas, linhas }]);
    else await exportarPDF(nome, tipoFixo === 'transferencia' ? 'Transferências entre lojas' : 'Movimentações de estoque', periodo, colunas, linhas);
  }

  const produtoFiltro = produtoId ? produtoPorId(produtoId) : null;

  return (
    <div className="space-y-4">
      <div className="cartao grid grid-cols-2 gap-3 md:grid-cols-7">
        <Campo rotulo="De" className="col-span-1">
          <input type="date" className="campo" value={de} onChange={(e) => setDe(e.target.value)} />
        </Campo>
        <Campo rotulo="Até" className="col-span-1">
          <input type="date" className="campo" value={ate} onChange={(e) => setAte(e.target.value)} />
        </Campo>
        {!tipoFixo && (
          <Campo rotulo="Tipo" className="col-span-1">
            <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoOperacao | '')}>
              <option value="">Todos</option>
              {Object.entries(TIPOS).map(([v, t]) => (
                <option key={v} value={v}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <div className="col-span-1">
          <span className="rotulo">Estoque</span>
          <LojaTag loja={lojaAtual} />
        </div>
        <Campo rotulo="Nº da nota fiscal" className="col-span-1">
          <input className="campo" value={nf} onChange={(e) => setNf(e.target.value)} placeholder="Número" />
        </Campo>
        {!tipoFixo && (
          <>
            <Campo rotulo="Nº do pedido" className="col-span-1">
              <input className="campo" value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Número" />
            </Campo>
            <Campo rotulo="Plataforma" className="col-span-2 md:col-span-1">
              <select className="campo" value={plataforma} onChange={(e) => setPlataforma(e.target.value as Plataforma | '')}>
                <option value="">Todas</option>
                {(Object.keys(PLATAFORMAS) as Plataforma[]).map((p) => (
                  <option key={p} value={p}>
                    {PLATAFORMAS[p].rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          </>
        )}
        <div className="col-span-2 md:col-span-7">
          <span className="rotulo">Produto</span>
          {produtoFiltro ? (
            <div className="flex items-center justify-between rounded-lg border border-dourado/50 bg-painel2 px-3 py-2.5 text-sm">
              <span>
                {produtoFiltro.nome} <span className="text-suave">({produtoFiltro.sku})</span>
              </span>
              <button className="btn-fantasma text-xs" onClick={() => setProdutoId(null)}>
                Limpar
              </button>
            </div>
          ) : (
            <ProdutoBusca aoEscolher={(p) => setProdutoId(p.id)} incluirInativos placeholder="Filtrar por um produto (opcional)" />
          )}
        </div>
      </div>

      {!pode('historico') && (
        <p className="rounded-lg border border-borda bg-painel p-3 text-sm text-suave">
          🔒 Você está vendo apenas os lançamentos feitos por você.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-suave">{lista ? `${lista.length} lançamento(s)` : ''}</span>
        <div className="flex gap-2">
          <button className="btn-secundario" onClick={() => exportar('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button className="btn-secundario" onClick={() => exportar('pdf')}>
            <FileDown className="h-4 w-4" /> PDF
          </button>
        </div>
      </div>

      {!lista ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <Vazio>Nenhum lançamento encontrado com esses filtros.</Vazio>
      ) : (
        <div className="cartao p-0 sm:p-0">
          {lista.map((op) => (
            <LinhaOperacao key={op.id} op={op} aoAbrir={() => setAberta(op.id)} />
          ))}
          {lista.length >= limite && (
            <div className="p-3 text-center">
              <button className="btn-secundario" onClick={() => setLimite(limite + 100)}>
                Carregar mais
              </button>
            </div>
          )}
        </div>
      )}

      <DetalheOperacao id={aberta} aoFechar={() => setAberta(null)} />
    </div>
  );
}
