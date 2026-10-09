'use client';

import { ChevronDown, ChevronRight, FileDown, FileSpreadsheet, Package } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LojaTag } from '@/components/loja';
import { ProdutoBusca } from '@/components/produto-busca';
import { Campo, Carregando, SemPermissao, TipoBadge, Titulo, Vazio } from '@/components/ui';
import { buscarTudo, useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { exportarExcel, exportarPDF, type Coluna } from '@/lib/exportar';
import { agruparPorKit, kitsDasLinhas } from '@/lib/kits-agrupar';
import {
  PLATAFORMAS,
  rotuloPlataforma,
  abaixoDoMinimo,
  buscarProdutos,
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
import type { MovimentacaoLinha, Plataforma, Produto, TipoOperacao } from '@/lib/tipos';
import { PlataformaTag } from '@/components/operacoes';

type Aba = 'vendas' | 'movimentacoes' | 'posicao' | 'baixo';

export default function Relatorios() {
  const [aba, setAba] = useState<Aba>('vendas');
  const { pode } = useDados();
  if (!pode('relatorios')) return <SemPermissao texto="Você não tem permissão para ver relatórios." />;
  return (
    <div className="space-y-4">
      <Titulo sub="Filtre, confira na tela e exporte em Excel ou PDF.">Relatórios</Titulo>
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-borda bg-painel p-1">
        {(
          [
            ['vendas', 'Vendas'],
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
      {aba === 'vendas' && <RelVendas />}
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
// Vendas: quantos kits e quantas unidades de cada produto saíram em pedidos
type LinhaVenda = { id: number; nome: string; sku: string; kit: boolean; pedidos: number; quantidade: number; pecas: number };
type LinhaPeca = { id: number; nome: string; sku: string; avulso: number; emKits: number; total: number };
type Mostrar = 'tudo' | 'kits' | 'produtos';

function RelVendas() {
  const { lojas, loja, produtos, produtoPorId, categorias, categoriaNome } = useDados();
  const [de, setDe] = useState(hojeISO(-30));
  const [ate, setAte] = useState(hojeISO());
  const [lojaId, setLojaId] = useState<number | ''>('');
  const [plataforma, setPlataforma] = useState<Plataforma | ''>('');
  const [categoria, setCategoria] = useState<number | ''>('');
  const [mostrar, setMostrar] = useState<Mostrar>('tudo');
  const [busca, setBusca] = useState('');
  const [linhas, setLinhas] = useState<MovimentacaoLinha[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function gerar() {
    setCarregando(true);
    try {
      const dados = await buscarTudo<MovimentacaoLinha>((inicio, fim) => {
        let q = supabaseNavegador()
          .from('vw_movimentacoes')
          .select('*')
          .eq('tipo', 'saida')
          .eq('motivo', 'venda')
          .is('estornada_por', null)
          .order('id');
        if (de) q = q.gte('data_hora', inicioDoDia(de));
        if (ate) q = q.lte('data_hora', fimDoDia(ate));
        if (lojaId) q = q.eq('loja_id', lojaId);
        if (plataforma) q = q.eq('plataforma', plataforma);
        return q.range(inicio, fim);
      });
      setLinhas(dados);
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }

  const { vendas, pecas, pedidos } = useMemo(() => {
    const kitDaLinha = kitsDasLinhas(linhas ?? [], produtos);
    const v = new Map<number, LinhaVenda & { ops: Set<number>; chaves: Set<string> }>();
    const pc = new Map<number, LinhaPeca>();
    const ops = new Set<number>();
    for (const m of linhas ?? []) {
      ops.add(m.operacao_id);
      const qtd = -m.quantidade;
      const k = kitDaLinha.get(m.id);
      const peca = pc.get(m.produto_id) ?? { id: m.produto_id, nome: m.produto_nome, sku: m.sku, avulso: 0, emKits: 0, total: 0 };
      if (k) peca.emKits += qtd;
      else peca.avulso += qtd;
      peca.total += qtd;
      pc.set(m.produto_id, peca);

      const id = k ? k.kit_id : m.produto_id;
      const item = v.get(id) ?? {
        id,
        nome: k ? k.nome : m.produto_nome,
        sku: k ? k.sku : m.sku,
        kit: !!k,
        pedidos: 0,
        quantidade: 0,
        pecas: 0,
        ops: new Set<number>(),
        chaves: new Set<string>(),
      };
      item.ops.add(m.operacao_id);
      if (k) {
        item.pecas += qtd;
        if (!item.chaves.has(k.chave)) {
          item.chaves.add(k.chave);
          item.quantidade += k.kits;
        }
      } else item.quantidade += qtd;
      item.pedidos = item.ops.size;
      v.set(id, item);
    }
    // filtros de texto, categoria e tipo
    const ids = busca.trim() ? new Set(buscarProdutos(produtos, busca).map((p) => p.id)) : null;
    const passa = (id: number, kit: boolean) =>
      (!ids || ids.has(id)) &&
      (!categoria || produtoPorId(id)?.categoria_id === categoria) &&
      (mostrar === 'tudo' || (mostrar === 'kits') === kit);
    return {
      vendas: [...v.values()].filter((x) => passa(x.id, x.kit)).sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome)),
      pecas: [...pc.values()].filter((x) => passa(x.id, false) || mostrar === 'kits').sort((a, b) => b.total - a.total),
      pedidos: ops.size,
    };
  }, [linhas, produtos, produtoPorId, busca, categoria, mostrar]);

  const kitsVendidos = vendas.filter((x) => x.kit).reduce((s, x) => s + x.quantidade, 0);
  const avulsos = vendas.filter((x) => !x.kit).reduce((s, x) => s + x.quantidade, 0);
  const pecasTotal = pecas.reduce((s, x) => s + x.total, 0);

  const colVendas: Coluna<LinhaVenda>[] = [
    { titulo: 'SKU', valor: (x) => x.sku, largura: 16 },
    { titulo: 'Produto / kit', valor: (x) => x.nome, largura: 42 },
    { titulo: 'Tipo', valor: (x) => (x.kit ? 'Kit' : 'Produto'), largura: 9 },
    { titulo: 'Pedidos', valor: (x) => x.pedidos, formato: 'inteiro', largura: 9 },
    { titulo: 'Vendidos', valor: (x) => x.quantidade, formato: 'inteiro', largura: 10 },
    { titulo: 'Peças dos kits', valor: (x) => (x.kit ? x.pecas : null), formato: 'inteiro', largura: 13 },
  ];
  const colPecas: Coluna<LinhaPeca>[] = [
    { titulo: 'SKU', valor: (x) => x.sku, largura: 16 },
    { titulo: 'Produto', valor: (x) => x.nome, largura: 42 },
    { titulo: 'Vendido avulso', valor: (x) => x.avulso, formato: 'inteiro', largura: 13 },
    { titulo: 'Saiu dentro de kits', valor: (x) => x.emKits, formato: 'inteiro', largura: 16 },
    { titulo: 'Total que saiu', valor: (x) => x.total, formato: 'inteiro', largura: 13 },
  ];

  function exportar(f: 'xlsx' | 'pdf') {
    if (!linhas) return toast.error('Gere o relatório primeiro.');
    const filtros = [
      `Período: ${de ? fmtData(de) : 'início'} a ${ate ? fmtData(ate) : 'hoje'}`,
      lojaId ? `Loja: ${loja(lojaId)?.nome}` : 'Todas as lojas',
      plataforma ? `Plataforma: ${PLATAFORMAS[plataforma].rotulo}` : '',
      categoria ? `Categoria: ${categoriaNome(categoria)}` : '',
      busca.trim() ? `Busca: ${busca.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const rodape = `${pedidos} pedidos · ${kitsVendidos} kits · ${avulsos} unidades avulsas · ${pecasTotal} peças no total`;
    if (f === 'xlsx')
      exportarExcel('relatorio-vendas', [
        { nome: 'Vendas', colunas: colVendas, linhas: vendas },
        { nome: 'Por produto (com kits)', colunas: colPecas, linhas: pecas },
      ]);
    else exportarPDF('relatorio-vendas', 'Relatório de vendas', filtros, colVendas, vendas, rodape);
  }

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
        <Campo rotulo="Plataforma">
          <select className="campo" value={plataforma} onChange={(e) => setPlataforma(e.target.value as Plataforma | '')}>
            <option value="">Todas</option>
            {(Object.keys(PLATAFORMAS) as Plataforma[]).map((p) => (
              <option key={p} value={p}>
                {PLATAFORMAS[p].rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <button className="btn-principal col-span-2 md:col-span-4" onClick={gerar} disabled={carregando}>
          Gerar relatório
        </button>
      </div>

      {carregando && <Carregando />}
      {linhas && !carregando && (
        <>
          <div className="cartao grid grid-cols-2 gap-3 md:grid-cols-4">
            <Campo rotulo="Buscar produto ou kit" className="col-span-2">
              <input className="campo" name="buscar_venda" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, SKU ou código" />
            </Campo>
            <Campo rotulo="Categoria">
              <select className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Todas</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Mostrar">
              <select className="campo" name="mostrar" value={mostrar} onChange={(e) => setMostrar(e.target.value as Mostrar)}>
                <option value="tudo">Kits e produtos</option>
                <option value="kits">Só kits</option>
                <option value="produtos">Só produtos avulsos</option>
              </select>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Resumo rotulo="Pedidos" valor={pedidos} />
            <Resumo rotulo="Kits vendidos" valor={kitsVendidos} destaque />
            <Resumo rotulo="Unidades avulsas" valor={avulsos} />
            <Resumo rotulo="Peças que saíram (total)" valor={pecasTotal} />
          </div>

          <div className="flex justify-end">
            <BotoesExportar aoExportar={exportar} />
          </div>

          {vendas.length === 0 ? (
            <Vazio>Nenhuma venda com esses filtros.</Vazio>
          ) : (
            <div className="cartao max-h-[60vh] overflow-auto p-0 sm:p-0">
              <table className="tabela" data-relatorio="vendas">
                <thead className="sticky top-0 bg-painel">
                  <tr>
                    <th>Produto / kit</th>
                    <th className="text-right">Pedidos</th>
                    <th className="text-right">Vendidos</th>
                  </tr>
                </thead>
                <tbody>
                  {vendas.map((x) => (
                    <tr key={`${x.kit}-${x.id}`} data-sku={x.sku}>
                      <td>
                        <div className="flex items-center gap-1.5 font-medium">
                          {x.kit && <Package className="h-4 w-4 shrink-0 text-dourado" />}
                          {x.nome}
                        </div>
                        <div className="text-xs text-suave">
                          SKU {x.sku}
                          {x.kit && ` · ${x.pecas} peças`}
                        </div>
                      </td>
                      <td className="tabular text-right">{numero(x.pedidos)}</td>
                      <td className="tabular whitespace-nowrap text-right font-semibold" data-vendidos={x.quantidade}>
                        {numero(x.quantidade)} {x.kit ? (x.quantidade > 1 ? 'kits' : 'kit') : 'un.'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pecas.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-titulo font-bold">Quanto saiu de cada produto (avulso + dentro dos kits)</h3>
              <div className="cartao max-h-[60vh] overflow-auto p-0 sm:p-0">
                <table className="tabela" data-relatorio="pecas">
                  <thead className="sticky top-0 bg-painel">
                    <tr>
                      <th>Produto</th>
                      <th className="text-right">Avulso</th>
                      <th className="text-right">Em kits</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pecas.map((x) => (
                      <tr key={x.id} data-sku={x.sku}>
                        <td>
                          {x.nome}
                          <div className="text-xs text-suave">SKU {x.sku}</div>
                        </td>
                        <td className="tabular text-right">{numero(x.avulso)}</td>
                        <td className="tabular text-right">{numero(x.emKits)}</td>
                        <td className="tabular text-right font-semibold">{numero(x.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Resumo({ rotulo, valor, destaque = false }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className="cartao">
      <div className="text-xs text-suave">{rotulo}</div>
      <div className={`font-titulo text-2xl font-bold tabular ${destaque ? 'text-dourado' : ''}`}>{numero(valor)}</div>
    </div>
  );
}

// ------------------------------------------------------------------
function RelMovimentacoes() {
  const { lojas, produtoPorId, loja, produtos } = useDados();
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [de, setDe] = useState(hojeISO(-30));
  const [ate, setAte] = useState(hojeISO());
  const [lojaId, setLojaId] = useState<number | ''>('');
  const [tipo, setTipo] = useState<TipoOperacao | ''>('');
  const [plataforma, setPlataforma] = useState<Plataforma | ''>('');
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
        if (plataforma) q = q.eq('plataforma', plataforma);
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

  // peças que saíram por causa de um kit (agrupadas na tela e anotadas no Excel/PDF)
  const kitDaLinha = useMemo(() => kitsDasLinhas(linhas ?? [], produtos), [linhas, produtos]);
  const agrupadas = useMemo(() => agruparPorKit(linhas ?? [], produtos), [linhas, produtos]);
  const alternar = (chave: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });

  const colunas: Coluna<MovimentacaoLinha>[] = [
    { titulo: 'Data/hora', valor: (m) => dataHora(m.data_hora ?? m.criado_em), largura: 17 },
    { titulo: 'Nº', valor: (m) => m.operacao_id, formato: 'inteiro', largura: 7 },
    { titulo: 'Tipo', valor: (m) => TIPOS[m.tipo].rotulo, largura: 13 },
    { titulo: 'Motivo', valor: (m) => rotuloMotivo(m.motivo), largura: 22 },
    { titulo: 'Loja', valor: (m) => m.loja_nome, largura: 15 },
    { titulo: 'SKU', valor: (m) => m.sku, largura: 12 },
    { titulo: 'Produto', valor: (m) => m.produto_nome, largura: 40 },
    { titulo: 'Kit', valor: (m) => (kitDaLinha.get(m.id) ? `${kitDaLinha.get(m.id)!.nome} (${kitDaLinha.get(m.id)!.kits} kit)` : ''), largura: 28 },
    { titulo: 'Qtd.', valor: (m) => m.quantidade, formato: 'inteiro', largura: 7 },
    { titulo: 'Custo un.', valor: (m) => (m.custo_unitario != null ? Number(m.custo_unitario) : null), formato: 'moeda', largura: 11 },
    { titulo: 'Saldo antes', valor: (m) => m.saldo_antes, formato: 'inteiro', largura: 10 },
    { titulo: 'Saldo depois', valor: (m) => m.saldo_apos, formato: 'inteiro', largura: 10 },
    { titulo: 'Lançado em', valor: (m) => dataHora(m.criado_em), largura: 17 },
    { titulo: 'Plataforma', valor: (m) => rotuloPlataforma(m.plataforma), largura: 13 },
    { titulo: 'Pedido', valor: (m) => m.numero_pedido ?? '', largura: 16 },
    { titulo: 'NF', valor: (m) => m.nf_numero ?? '', largura: 10 },
    { titulo: 'Cliente', valor: (m) => m.cliente_nome ?? '', largura: 20 },
    { titulo: 'Usuário', valor: (m) => m.usuario_nome, largura: 16 },
  ];

  function exportar(f: 'xlsx' | 'pdf') {
    if (!linhas?.length) return toast.error('Gere o relatório primeiro.');
    const filtros = [
      `Período: ${de ? fmtData(de) : 'início'} a ${ate ? fmtData(ate) : 'hoje'}`,
      lojaId ? `Loja: ${loja(lojaId)?.nome}` : 'Todas as lojas',
      tipo ? `Tipo: ${TIPOS[tipo].rotulo}` : '',
      plataforma ? `Plataforma: ${PLATAFORMAS[plataforma].rotulo}` : '',
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
      <div className="cartao grid grid-cols-2 gap-3 md:grid-cols-5">
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
        <Campo rotulo="Plataforma (pedidos)" className="col-span-2 md:col-span-1">
          <select className="campo" value={plataforma} onChange={(e) => setPlataforma(e.target.value as Plataforma | '')}>
            <option value="">Todas</option>
            {(Object.keys(PLATAFORMAS) as Plataforma[]).map((p) => (
              <option key={p} value={p}>
                {PLATAFORMAS[p].rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <div className="col-span-2 md:col-span-5">
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
        <button className="btn-principal col-span-2 md:col-span-5" onClick={gerar} disabled={carregando}>
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
                    <th className="text-right">Antes → depois</th>
                    <th>Pedido / NF</th>
                    <th>Usuário</th>
                  </tr>
                </thead>
                <tbody>
                  {agrupadas.map((g) => {
                    if (g.tipo === 'linha') return <LinhaMov key={g.linha.id} m={g.linha} />;
                    const m = g.linhas[0];
                    const aberto = abertos.has(g.info.chave);
                    const kits = `${m.quantidade > 0 ? '+' : '-'}${g.info.kits} kit${g.info.kits > 1 ? 's' : ''}`;
                    return (
                      <Fragment key={g.info.chave}>
                        <tr className="cursor-pointer hover:bg-white/5" onClick={() => alternar(g.info.chave)} data-kit={g.info.sku}>
                          <td className="whitespace-nowrap text-xs">{dataHora(m.data_hora ?? m.criado_em)}</td>
                          <td>
                            <TipoBadge tipo={m.tipo} />
                          </td>
                          <td>
                            <LojaTag loja={{ nome: m.loja_nome, cor: m.loja_cor }} tamanho="sm" />
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5 font-medium">
                              {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                              <Package className="h-4 w-4 shrink-0 text-dourado" />
                              {g.info.nome}
                            </div>
                            <div className="pl-6 text-xs text-suave">
                              {g.info.pecas} peças: {g.linhas.map((x) => x.produto_nome).join(', ')}
                            </div>
                          </td>
                          <td className={`tabular whitespace-nowrap text-right font-semibold ${m.quantidade > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {kits}
                          </td>
                          <td className="text-right text-xs text-suave">{aberto ? '' : 'ver peças'}</td>
                          <td className="text-xs">
                            <PlataformaTag plataforma={m.plataforma} />
                            {m.numero_pedido && <div>Pedido {m.numero_pedido}</div>}
                            {m.nf_numero && <div className="text-suave">NF {m.nf_numero}</div>}
                            {m.cliente_nome && <div className="text-suave">{m.cliente_nome}</div>}
                          </td>
                          <td className="whitespace-nowrap text-xs">{m.usuario_nome}</td>
                        </tr>
                        {aberto && g.linhas.map((x) => <LinhaMov key={x.id} m={x} peca />)}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// uma linha do relatório; "peca" = peça de um kit (aparece recuada, abaixo do kit)
function LinhaMov({ m, peca = false }: { m: MovimentacaoLinha; peca?: boolean }) {
  return (
    <tr className={peca ? 'bg-white/[0.03]' : undefined}>
      <td className="whitespace-nowrap text-xs">{dataHora(m.data_hora ?? m.criado_em)}</td>
      <td>
        <TipoBadge tipo={m.tipo} />
      </td>
      <td>
        <LojaTag loja={{ nome: m.loja_nome, cor: m.loja_cor }} tamanho="sm" />
      </td>
      <td>
        {peca ? <span className="pl-6 text-neutral-300">↳ {m.produto_nome}</span> : m.produto_nome}
        {!peca && <div className="text-xs text-suave">{rotuloMotivo(m.motivo)}</div>}
      </td>
      <td className={`tabular text-right font-semibold ${m.quantidade > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {m.quantidade > 0 ? '+' : ''}
        {m.quantidade}
      </td>
      <td className="tabular text-right">
        <span className="text-suave">{m.saldo_antes}</span> → {m.saldo_apos}
      </td>
      <td className="text-xs">
        <PlataformaTag plataforma={m.plataforma} />
        {m.numero_pedido && <div>Pedido {m.numero_pedido}</div>}
        {m.nf_numero && <div className="text-suave">NF {m.nf_numero}</div>}
        {m.cliente_nome && <div className="text-suave">{m.cliente_nome}</div>}
      </td>
      <td className="whitespace-nowrap text-xs">{m.usuario_nome}</td>
    </tr>
  );
}

// ------------------------------------------------------------------
function RelPosicao() {
  const { produtos, lojas: todasLojas, categorias, categoriaNome, marcaNome } = useDados();
  const [categoria, setCategoria] = useState<number | ''>('');
  const [soComSaldo, setSoComSaldo] = useState(false);
  const [busca, setBusca] = useState('');
  const [lojaId, setLojaId] = useState<number | ''>('');
  const [mostrar, setMostrar] = useState<Mostrar>('produtos');
  const lojas = lojaId ? todasLojas.filter((l) => l.id === lojaId) : todasLojas;

  const lista = useMemo(() => {
    let l = buscarProdutos(produtos, busca).filter((p) => p.ativo && (mostrar === 'tudo' || (mostrar === 'kits') === p.eh_kit));
    if (categoria) l = l.filter((p) => p.categoria_id === categoria);
    if (soComSaldo) l = l.filter((p) => lojas.some((loja) => estoqueNaLoja(p, loja.id).saldo > 0));
    return l;
  }, [produtos, busca, mostrar, categoria, soComSaldo, lojas]);
  // kit não tem estoque próprio: o número dele é "quantos kits dá para montar" e não entra nas somas
  const fisicos = lista.filter((p) => !p.eh_kit);

  const total = (p: Produto) => lojas.reduce((s, l) => s + estoqueNaLoja(p, l.id).saldo, 0);
  const colunas: Coluna<Produto>[] = [
    { titulo: 'SKU', valor: (p) => p.sku, largura: 12 },
    { titulo: 'Produto', valor: (p) => p.nome, largura: 40 },
    { titulo: 'Tipo', valor: (p) => (p.eh_kit ? 'Kit (kits possíveis)' : 'Produto'), largura: 12 },
    { titulo: 'Categoria', valor: (p) => categoriaNome(p.categoria_id), largura: 14 },
    { titulo: 'Marca', valor: (p) => marcaNome(p.marca_id), largura: 14 },
    ...lojas.map<Coluna<Produto>>((l) => ({ titulo: l.nome, valor: (p) => estoqueNaLoja(p, l.id).saldo, formato: 'inteiro', largura: 15 })),
    { titulo: 'Total', valor: total, formato: 'inteiro', largura: 8 },
    { titulo: 'Custo médio', valor: (p) => p.custo_medio, formato: 'moeda', largura: 12 },
    { titulo: 'Valor (custo)', valor: (p) => total(p) * p.custo_medio, formato: 'moeda', largura: 14 },
    { titulo: 'Valor (venda)', valor: (p) => total(p) * p.preco_venda, formato: 'moeda', largura: 14 },
  ];
  const somaCusto = fisicos.reduce((s, p) => s + total(p) * p.custo_medio, 0);
  const somaVenda = fisicos.reduce((s, p) => s + total(p) * p.preco_venda, 0);
  const somaLoja = (id: number) => fisicos.reduce((s, p) => s + estoqueNaLoja(p, id).saldo, 0);
  const rodape = `Totais — ${lojas.map((l) => `${l.nome}: ${numero(somaLoja(l.id))} un.`).join(' · ')} · Custo: ${moeda(somaCusto)} · Venda: ${moeda(somaVenda)}`;

  function exportar(f: 'xlsx' | 'pdf') {
    if (f === 'xlsx') exportarExcel('posicao-estoque', [{ nome: 'Posição de estoque', colunas, linhas: lista }]);
    else {
      const filtros = [
        categoria ? `Categoria: ${categoriaNome(categoria)}` : 'Todas as categorias',
        lojaId ? `Loja: ${lojas[0]?.nome}` : '',
        busca.trim() ? `Busca: ${busca.trim()}` : '',
        mostrar === 'kits' ? 'Só kits (quantos dá para montar)' : mostrar === 'tudo' ? 'Produtos e kits' : '',
      ]
        .filter(Boolean)
        .join(' · ');
      exportarPDF('posicao-estoque', 'Posição de estoque', filtros, colunas, lista, rodape);
    }
  }

  return (
    <div className="space-y-4">
      <div className="cartao flex flex-wrap items-end gap-3">
        <Campo rotulo="Buscar produto ou kit" className="min-w-[200px] flex-[2]">
          <input className="campo" name="buscar_estoque" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, SKU ou código" />
        </Campo>
        <Campo rotulo="Loja" className="min-w-[160px] flex-1">
          <select className="campo" value={lojaId} onChange={(e) => setLojaId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todas</option>
            {todasLojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Mostrar" className="min-w-[180px] flex-1">
          <select className="campo" name="mostrar_estoque" value={mostrar} onChange={(e) => setMostrar(e.target.value as Mostrar)}>
            <option value="produtos">Produtos</option>
            <option value="kits">Kits (quantos dá para montar)</option>
            <option value="tudo">Produtos e kits</option>
          </select>
        </Campo>
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
              <tr key={p.id} data-sku={p.sku}>
                <td>
                  <div className="flex items-center gap-1.5">
                    {p.eh_kit && <Package className="h-4 w-4 shrink-0 text-dourado" />}
                    {p.nome}
                  </div>
                  <div className="text-xs text-suave">
                    SKU {p.sku}
                    {p.eh_kit && ' · kits que dá para montar'}
                  </div>
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
