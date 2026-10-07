'use client';

import { FileDown, FileSpreadsheet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LojaTag } from '@/components/loja';
import { ProdutoBusca } from '@/components/produto-busca';
import { Campo, Carregando, TipoBadge, Titulo, Vazio } from '@/components/ui';
import { buscarTudo, useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { exportarExcel, exportarPDF, type Coluna } from '@/lib/exportar';
import {
  abaixoDoMinimo,
  data as fmtData,
  dataHora,
  estoqueNaLoja,
  fimDoDia,
  hojeISO,
  inicioDoDia,
  moeda,
  numero,
  rotuloMotivo,
  sugestaoTransferencia,
  TIPOS,
} from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { MovimentacaoLinha, Produto, TipoOperacao } from '@/lib/tipos';

type Aba = 'movimentacoes' | 'posicao' | 'baixo';

export default function Relatorios() {
  const [aba, setAba] = useState<Aba>('movimentacoes');
  return (
    <div className="space-y-4">
      <Titulo sub="Filtre, confira na tela e exporte em Excel ou PDF.">Relatórios</Titulo>
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-borda bg-painel p-1">
        {(
          [
            ['movimentacoes', 'Movimentações'],
            ['posicao', 'Posição de estoque'],
            ['baixo', 'Estoque baixo'],
          ] as [Aba, string][]
        ).map(([v, r]) => (
          <button
            key={v}
            onClick={() => setAba(v)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold ${aba === v ? 'bg-dourado text-preto' : 'text-neutral-300 hover:bg-white/5'}`}
          >
            {r}
          </button>
        ))}
      </div>
      {aba === 'movimentacoes' && <RelMovimentacoes />}
      {aba === 'posicao' && <RelPosicao />}
      {aba === 'baixo' && <RelBaixo />}
    </div>
  );
}

function BotoesExportar({ aoExportar }: { aoExportar: (f: 'xlsx' | 'pdf') => void }) {
  return (
    <div className="flex gap-2">
      <button className="btn-secundario" onClick={() => aoExportar('xlsx')}>
        <FileSpreadsheet className="h-4 w-4" /> Excel
      </button>
      <button className="btn-secundario" onClick={() => aoExportar('pdf')}>
        <FileDown className="h-4 w-4" /> PDF
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
function RelMovimentacoes() {
  const { lojas, produtoPorId, loja } = useDados();
  const [de, setDe] = useState(hojeISO(-30));
  const [ate, setAte] = useState(hojeISO());
  const [lojaId, setLojaId] = useState<number | ''>('');
  const [tipo, setTipo] = useState<TipoOperacao | ''>('');
  const [produtoId, setProdutoId] = useState<number | null>(null);
  const [linhas, setLinhas] = useState<MovimentacaoLinha[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function gerar() {
    setCarregando(true);
    try {
      const dados = await buscarTudo<MovimentacaoLinha>((inicio, fim) => {
        let q = supabaseNavegador().from('vw_movimentacoes').select('*').order('criado_em', { ascending: false }).order('id');
        if (de) q = q.gte('criado_em', inicioDoDia(de));
        if (ate) q = q.lte('criado_em', fimDoDia(ate));
        if (lojaId) q = q.eq('loja_id', lojaId);
        if (tipo) q = q.eq('tipo', tipo);
        if (produtoId) q = q.eq('produto_id', produtoId);
        return q.range(inicio, fim);
      });
      setLinhas(dados);
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }

  const totais = useMemo(() => {
    const t: Record<string, { entra: number; sai: number }> = {};
    for (const m of linhas ?? []) {
      t[m.tipo] ??= { entra: 0, sai: 0 };
      if (m.quantidade > 0) t[m.tipo].entra += m.quantidade;
      else t[m.tipo].sai += -m.quantidade;
    }
    return t;
  }, [linhas]);

  const colunas: Coluna<MovimentacaoLinha>[] = [
    { titulo: 'Data/hora', valor: (m) => dataHora(m.criado_em), largura: 17 },
    { titulo: 'Nº', valor: (m) => m.operacao_id, formato: 'inteiro', largura: 7 },
    { titulo: 'Tipo', valor: (m) => TIPOS[m.tipo].rotulo, largura: 13 },
    { titulo: 'Motivo', valor: (m) => rotuloMotivo(m.motivo), largura: 22 },
    { titulo: 'Loja', valor: (m) => m.loja_nome, largura: 15 },
    { titulo: 'SKU', valor: (m) => m.sku, largura: 12 },
    { titulo: 'Produto', valor: (m) => m.produto_nome, largura: 40 },
    { titulo: 'Qtd.', valor: (m) => m.quantidade, formato: 'inteiro', largura: 7 },
    { titulo: 'Custo un.', valor: (m) => (m.custo_unitario != null ? Number(m.custo_unitario) : null), formato: 'moeda', largura: 11 },
    { titulo: 'Saldo após', valor: (m) => m.saldo_apos, formato: 'inteiro', largura: 10 },
    { titulo: 'NF', valor: (m) => m.nf_numero ?? '', largura: 10 },
    { titulo: 'Usuário', valor: (m) => m.usuario_nome, largura: 16 },
  ];

  function exportar(f: 'xlsx' | 'pdf') {
    if (!linhas?.length) return toast.error('Gere o relatório primeiro.');
    const filtros = [
      `Período: ${de ? fmtData(de) : 'início'} a ${ate ? fmtData(ate) : 'hoje'}`,
      lojaId ? `Loja: ${loja(lojaId)?.nome}` : 'Todas as lojas',
      tipo ? `Tipo: ${TIPOS[tipo].rotulo}` : '',
      produtoId ? `Produto: ${produtoPorId(produtoId)?.nome}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (f === 'xlsx') exportarExcel('relatorio-movimentacoes', [{ nome: 'Movimentações', colunas, linhas }]);
    else exportarPDF('relatorio-movimentacoes', 'Relatório de movimentações', filtros, colunas, linhas);
  }

  const produtoFiltro = produtoId ? produtoPorId(produtoId) : null;

  return (
    <div className="space-y-4">
      <div className="cartao grid grid-cols-2 gap-3 md:grid-cols-4">
        <Campo rotulo="De">
          <input type="date" className="campo" value={de} onChange={(e) => setDe(e.target.value)} />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" className="campo" value={ate} onChange={(e) => setAte(e.target.value)} />
        </Campo>
        <Campo rotulo="Loja">
          <select className="campo" value={lojaId} onChange={(e) => setLojaId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todas</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Tipo">
          <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoOperacao | '')}>
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([v, t]) => (
              <option key={v} value={v}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <div className="col-span-2 md:col-span-4">
          <span className="rotulo">Produto</span>
          {produtoFiltro ? (
            <div className="flex items-center justify-between rounded-lg border border-dourado/50 bg-painel2 px-3 py-2.5 text-sm">
              {produtoFiltro.nome}
              <button className="btn-fantasma text-xs" onClick={() => setProdutoId(null)}>
                Limpar
              </button>
            </div>
          ) : (
            <ProdutoBusca aoEscolher={(p) => setProdutoId(p.id)} incluirInativos placeholder="Todos os produtos (ou escolha um)" />
          )}
        </div>
        <button className="btn-principal col-span-2 md:col-span-4" onClick={gerar} disabled={carregando}>
          Gerar relatório
        </button>
      </div>

      {carregando && <Carregando />}
      {linhas && !carregando && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2 text-sm">
              {Object.entries(totais).map(([t, v]) => (
                <span key={t} className="flex items-center gap-1 rounded-lg border border-borda bg-painel px-2 py-1">
                  <TipoBadge tipo={t as TipoOperacao} />
                  {v.entra > 0 && <span className="tabular text-emerald-400">+{numero(v.entra)}</span>}
                  {v.sai > 0 && <span className="tabular text-rose-400">-{numero(v.sai)}</span>}
                </span>
              ))}
            </div>
            <BotoesExportar aoExportar={exportar} />
          </div>
          {linhas.length === 0 ? (
            <Vazio>Nenhuma movimentação no período.</Vazio>
          ) : (
            <div className="cartao max-h-[65vh] overflow-auto p-0 sm:p-0">
              <table className="tabela">
                <thead className="sticky top-0 bg-painel">
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Loja</th>
                    <th>Produto</th>
                    <th className="text-right">Qtd.</th>
                    <th className="text-right">Saldo</th>
                    <th>NF</th>
                    <th>Usuário</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap text-xs">{dataHora(m.criado_em)}</td>
                      <td>
                        <TipoBadge tipo={m.tipo} />
                      </td>
                      <td>
                        <LojaTag loja={{ nome: m.loja_nome, cor: m.loja_cor }} tamanho="sm" />
                      </td>
                      <td>
                        {m.produto_nome}
                        <div className="text-xs text-suave">{rotuloMotivo(m.motivo)}</div>
                      </td>
                      <td className={`tabular text-right font-semibold ${m.quantidade > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {m.quantidade > 0 ? '+' : ''}
                        {m.quantidade}
                      </td>
                      <td className="tabular text-right">{m.saldo_apos}</td>
                      <td>{m.nf_numero ?? ''}</td>
                      <td className="whitespace-nowrap text-xs">{m.usuario_nome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
function RelPosicao() {
  const { produtos, lojas, categorias, categoriaNome, marcaNome } = useDados();
  const [categoria, setCategoria] = useState<number | ''>('');
  const [soComSaldo, setSoComSaldo] = useState(false);

  const lista = useMemo(() => {
    let l = produtos.filter((p) => p.ativo);
    if (categoria) l = l.filter((p) => p.categoria_id === categoria);
    if (soComSaldo) l = l.filter((p) => p.estoques.some((e) => e.saldo > 0));
    return l;
  }, [produtos, categoria, soComSaldo]);

  const total = (p: Produto) => p.estoques.reduce((s, e) => s + e.saldo, 0);
  const colunas: Coluna<Produto>[] = [
    { titulo: 'SKU', valor: (p) => p.sku, largura: 12 },
    { titulo: 'Produto', valor: (p) => p.nome, largura: 40 },
    { titulo: 'Categoria', valor: (p) => categoriaNome(p.categoria_id), largura: 14 },
    { titulo: 'Marca', valor: (p) => marcaNome(p.marca_id), largura: 14 },
    ...lojas.map<Coluna<Produto>>((l) => ({ titulo: l.nome, valor: (p) => estoqueNaLoja(p, l.id).saldo, formato: 'inteiro', largura: 15 })),
    { titulo: 'Total', valor: total, formato: 'inteiro', largura: 8 },
    { titulo: 'Custo médio', valor: (p) => p.custo_medio, formato: 'moeda', largura: 12 },
    { titulo: 'Valor (custo)', valor: (p) => total(p) * p.custo_medio, formato: 'moeda', largura: 14 },
    { titulo: 'Valor (venda)', valor: (p) => total(p) * p.preco_venda, formato: 'moeda', largura: 14 },
  ];
  const somaCusto = lista.reduce((s, p) => s + total(p) * p.custo_medio, 0);
  const somaVenda = lista.reduce((s, p) => s + total(p) * p.preco_venda, 0);
  const somaLoja = (id: number) => lista.reduce((s, p) => s + estoqueNaLoja(p, id).saldo, 0);
  const rodape = `Totais — ${lojas.map((l) => `${l.nome}: ${numero(somaLoja(l.id))} un.`).join(' · ')} · Custo: ${moeda(somaCusto)} · Venda: ${moeda(somaVenda)}`;

  function exportar(f: 'xlsx' | 'pdf') {
    if (f === 'xlsx') exportarExcel('posicao-estoque', [{ nome: 'Posição de estoque', colunas, linhas: lista }]);
    else exportarPDF('posicao-estoque', 'Posição de estoque', categoria ? `Categoria: ${categoriaNome(categoria)}` : 'Todas as categorias', colunas, lista, rodape);
  }

  return (
    <div className="space-y-4">
      <div className="cartao flex flex-wrap items-end gap-3">
        <Campo rotulo="Categoria" className="min-w-[200px] flex-1">
          <select className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-dourado" checked={soComSaldo} onChange={(e) => setSoComSaldo(e.target.checked)} />
          Só produtos com saldo
        </label>
        <BotoesExportar aoExportar={exportar} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {lojas.map((l) => (
          <div key={l.id} className="cartao">
            <LojaTag loja={l} tamanho="sm" />
            <div className="mt-1 font-titulo text-2xl font-bold tabular">{numero(somaLoja(l.id))}</div>
          </div>
        ))}
        <div className="cartao">
          <div className="text-xs text-suave">Valor a custo</div>
          <div className="font-titulo text-xl font-bold tabular text-dourado">{moeda(somaCusto)}</div>
        </div>
        <div className="cartao">
          <div className="text-xs text-suave">Valor a preço de venda</div>
          <div className="font-titulo text-xl font-bold tabular">{moeda(somaVenda)}</div>
        </div>
      </div>
      <div className="cartao max-h-[65vh] overflow-auto p-0 sm:p-0">
        <table className="tabela">
          <thead className="sticky top-0 bg-painel">
            <tr>
              <th>Produto</th>
              {lojas.map((l) => (
                <th key={l.id} className="text-right">
                  <LojaTag loja={l} tamanho="sm" />
                </th>
              ))}
              <th className="text-right">Total</th>
              <th className="text-right">Custo médio</th>
              <th className="text-right">Valor (custo)</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.nome}
                  <div className="text-xs text-suave">SKU {p.sku}</div>
                </td>
                {lojas.map((l) => (
                  <td key={l.id} className={`tabular text-right ${abaixoDoMinimo(p, l.id) ? 'font-semibold text-rose-400' : ''}`}>
                    {estoqueNaLoja(p, l.id).saldo}
                  </td>
                ))}
                <td className="tabular text-right font-semibold">{total(p)}</td>
                <td className="tabular text-right">{moeda(p.custo_medio)}</td>
                <td className="tabular text-right">{moeda(total(p) * p.custo_medio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
function RelBaixo() {
  const { produtos, lojas } = useDados();
  const lojaIds = lojas.map((l) => l.id);
  const linhas = useMemo(
    () =>
      lojas.flatMap((l) =>
        produtos
          .filter((p) => p.ativo && abaixoDoMinimo(p, l.id))
          .map((p) => {
            const e = estoqueNaLoja(p, l.id);
            const sug = sugestaoTransferencia(p, l.id, lojaIds);
            return {
              p,
              loja: l,
              saldo: e.saldo,
              minimo: e.estoque_minimo,
              falta: e.estoque_minimo - e.saldo,
              sugestao: sug ? `Transferir ${sug.quantidade} de ${lojas.find((x) => x.id === sug.origemId)?.nome}` : 'Comprar',
            };
          }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [produtos, lojas],
  );
  type L = (typeof linhas)[number];
  const colunas: Coluna<L>[] = [
    { titulo: 'Loja', valor: (l) => l.loja.nome, largura: 15 },
    { titulo: 'SKU', valor: (l) => l.p.sku, largura: 12 },
    { titulo: 'Produto', valor: (l) => l.p.nome, largura: 40 },
    { titulo: 'Saldo', valor: (l) => l.saldo, formato: 'inteiro', largura: 8 },
    { titulo: 'Mínimo', valor: (l) => l.minimo, formato: 'inteiro', largura: 8 },
    { titulo: 'Falta', valor: (l) => l.falta, formato: 'inteiro', largura: 8 },
    { titulo: 'Sugestão', valor: (l) => l.sugestao, largura: 34 },
  ];
  function exportar(f: 'xlsx' | 'pdf') {
    if (f === 'xlsx') exportarExcel('estoque-baixo', [{ nome: 'Estoque baixo', colunas, linhas }]);
    else exportarPDF('estoque-baixo', 'Produtos abaixo do estoque mínimo', `${linhas.length} item(ns)`, colunas, linhas);
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <BotoesExportar aoExportar={exportar} />
      </div>
      {linhas.length === 0 ? (
        <Vazio>Nenhum produto abaixo do mínimo. 🎉</Vazio>
      ) : (
        <div className="cartao overflow-x-auto p-0 sm:p-0">
          <table className="tabela">
            <thead>
              <tr>
                <th>Loja</th>
                <th>Produto</th>
                <th className="text-right">Saldo</th>
                <th className="text-right">Mínimo</th>
                <th className="text-right">Falta</th>
                <th>Sugestão</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={`${l.loja.id}-${l.p.id}`}>
                  <td>
                    <LojaTag loja={l.loja} tamanho="sm" />
                  </td>
                  <td>{l.p.nome}</td>
                  <td className="tabular text-right text-rose-400">{l.saldo}</td>
                  <td className="tabular text-right">{l.minimo}</td>
                  <td className="tabular text-right font-semibold">{l.falta}</td>
                  <td className="text-xs">{l.sugestao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
