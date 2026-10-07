'use client';

import { ArrowLeftRight, FileSpreadsheet, ImageOff, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LojaTag } from '@/components/loja';
import { Titulo, Vazio } from '@/components/ui';
import { urlFoto, useDados } from '@/lib/dados';
import { abaixoDoMinimo, buscarProdutos, estoqueNaLoja, moeda, saldoTotal } from '@/lib/formato';
import type { Produto } from '@/lib/tipos';

const POR_PAGINA = 40;
type Ordem = 'nome' | 'menor' | 'maior' | 'recentes' | 'sku';

export default function ListaProdutos() {
  const { produtos, lojas, categorias, categoriaNome, marcaNome, pode } = useDados();
  const [termo, setTermo] = useState('');
  const [situacao, setSituacao] = useState<'ativos' | 'inativos' | 'todos'>('ativos');
  const [categoria, setCategoria] = useState<number | ''>('');
  const [filtroEstoque, setFiltroEstoque] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('nome');
  const [limite, setLimite] = useState(POR_PAGINA);

  useEffect(() => {
    const b = new URLSearchParams(window.location.search).get('baixo');
    if (b) setFiltroEstoque(`baixo-${b}`);
  }, []);
  // ao mudar filtros, volta para a primeira "página"
  useEffect(() => setLimite(POR_PAGINA), [termo, situacao, categoria, filtroEstoque, ordem]);

  const ids = lojas.map((l) => l.id);
  const filtrados = useMemo(() => {
    let l = produtos;
    if (situacao === 'ativos') l = l.filter((p) => p.ativo);
    if (situacao === 'inativos') l = l.filter((p) => !p.ativo);
    if (categoria) l = l.filter((p) => p.categoria_id === categoria);
    if (filtroEstoque.startsWith('baixo-')) {
      const lojaId = Number(filtroEstoque.split('-')[1]);
      l = l.filter((p) => abaixoDoMinimo(p, lojaId));
    } else if (filtroEstoque.startsWith('sem-')) {
      const lojaId = Number(filtroEstoque.split('-')[1]);
      l = l.filter((p) => estoqueNaLoja(p, lojaId).saldo === 0);
    } else if (filtroEstoque === 'zerado') {
      l = l.filter((p) => saldoTotal(p, ids) === 0);
    }
    l = buscarProdutos(l, termo);
    const ordenar: Record<Ordem, (a: Produto, b: Produto) => number> = {
      nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
      sku: (a, b) => a.sku.localeCompare(b.sku, 'pt-BR'),
      menor: (a, b) => saldoTotal(a, ids) - saldoTotal(b, ids),
      maior: (a, b) => saldoTotal(b, ids) - saldoTotal(a, ids),
      recentes: (a, b) => b.criado_em.localeCompare(a.criado_em),
    };
    return [...l].sort(ordenar[ordem]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, termo, situacao, categoria, filtroEstoque, ordem, lojas]);

  const visiveis = filtrados.slice(0, limite);

  return (
    <div>
      <Titulo
        sub={`${filtrados.length} de ${produtos.length} produto(s)`}
        acoes={
          <>
            <Link href="/produtos/importar" className="btn-secundario">
              <FileSpreadsheet className="h-4 w-4" /> {pode('produtos') ? 'Importar / Exportar' : 'Exportar'}
            </Link>
            {pode('produtos') && (
              <Link href="/produtos/novo" className="btn-principal">
                <Plus className="h-4 w-4" /> Novo produto
              </Link>
            )}
          </>
        }
      >
        Produtos
      </Titulo>

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" />
          <input
            className="campo h-12 pl-10 text-lg"
            placeholder="Buscar por nome, SKU ou código de barras..."
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <select className="campo" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} aria-label="Situação">
            <option value="ativos">Somente ativos</option>
            <option value="inativos">Somente inativos</option>
            <option value="todos">Ativos e inativos</option>
          </select>
          <select className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value ? Number(e.target.value) : '')} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <select className="campo" value={filtroEstoque} onChange={(e) => setFiltroEstoque(e.target.value)} aria-label="Estoque">
            <option value="">Qualquer estoque</option>
            {lojas.map((l) => (
              <option key={`b${l.id}`} value={`baixo-${l.id}`}>
                Abaixo do mínimo em {l.nome}
              </option>
            ))}
            {lojas.map((l) => (
              <option key={`s${l.id}`} value={`sem-${l.id}`}>
                Sem estoque em {l.nome}
              </option>
            ))}
            <option value="zerado">Sem estoque em nenhuma loja</option>
          </select>
          <select className="campo" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
            <option value="nome">Ordenar: nome (A-Z)</option>
            <option value="sku">Ordenar: SKU</option>
            <option value="menor">Ordenar: menor estoque</option>
            <option value="maior">Ordenar: maior estoque</option>
            <option value="recentes">Ordenar: cadastrados por último</option>
          </select>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <Vazio>
          Nenhum produto encontrado.{' '}
          {pode('produtos') && (
            <Link href="/produtos/novo" className="text-dourado underline">
              Cadastrar um novo
            </Link>
          )}
        </Vazio>
      ) : (
        <div className="space-y-2">
          {visiveis.map((p) => {
            const foto = urlFoto(p.foto_path);
            return (
              <div
                key={p.id}
                className={`flex flex-col gap-3 rounded-xl border border-borda bg-painel p-3 sm:flex-row sm:items-center ${!p.ativo ? 'opacity-60' : ''}`}
              >
                <Link href={`/produtos/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-painel2">
                    {foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={foto} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <ImageOff className="h-5 w-5 text-neutral-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium leading-snug hover:text-dourado">
                      {p.nome} {!p.ativo && <span className="text-xs text-rose-400">(inativo)</span>}
                    </div>
                    <div className="text-xs text-suave">
                      SKU {p.sku}
                      {p.ean && ` · EAN ${p.ean}`}
                      {p.categoria_id && ` · ${categoriaNome(p.categoria_id)}`}
                      {p.marca_id && ` · ${marcaNome(p.marca_id)}`}
                    </div>
                    <div className="text-xs text-suave">
                      Venda {moeda(p.preco_venda)} · Total {saldoTotal(p, lojas.map((l) => l.id))} {p.unidade}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-2 sm:gap-3">
                  {lojas.map((l) => {
                    const e = estoqueNaLoja(p, l.id);
                    const baixoAqui = abaixoDoMinimo(p, l.id);
                    return (
                      <div
                        key={l.id}
                        className={`flex min-w-[96px] flex-1 flex-col items-center rounded-lg border px-2 py-1.5 sm:flex-none ${
                          baixoAqui ? 'border-rose-500/50 bg-rose-500/10' : 'border-borda bg-painel2'
                        }`}
                      >
                        <LojaTag loja={l} tamanho="sm" />
                        <span className={`font-titulo text-xl font-bold tabular ${baixoAqui ? 'text-rose-400' : ''}`}>{e.saldo}</span>
                        <span className="text-[10px] text-suave">
                          mín. {e.estoque_minimo}
                        </span>
                      </div>
                    );
                  })}
                  {p.ativo && pode('transferir') && (
                    <Link
                      href={`/transferencia?produto=${p.id}`}
                      className="btn-azul min-h-[60px] px-3"
                      title="Transferir entre lojas"
                      aria-label={`Transferir ${p.nome}`}
                    >
                      <ArrowLeftRight className="h-5 w-5" />
                      <span className="hidden md:inline">Transferir</span>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          {filtrados.length > limite && (
            <div className="pt-2 text-center">
              <button className="btn-secundario" onClick={() => setLimite(limite + POR_PAGINA)}>
                Mostrar mais ({filtrados.length - limite} restantes)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
