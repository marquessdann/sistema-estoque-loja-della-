'use client';

import { ArrowLeftRight, FileSpreadsheet, ImageOff, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LojaTag } from '@/components/loja';
import { Titulo, Vazio } from '@/components/ui';
import { urlFoto, useDados } from '@/lib/dados';
import { abaixoDoMinimo, buscarProdutos, estoqueNaLoja, moeda } from '@/lib/formato';

export default function ListaProdutos() {
  const { produtos, lojas, categorias, categoriaNome, marcaNome } = useDados();
  const [termo, setTermo] = useState('');
  const [situacao, setSituacao] = useState<'ativos' | 'inativos' | 'todos'>('ativos');
  const [categoria, setCategoria] = useState<number | ''>('');
  const [baixo, setBaixo] = useState<number | ''>('');

  useEffect(() => {
    const b = new URLSearchParams(window.location.search).get('baixo');
    if (b) setBaixo(Number(b));
  }, []);

  const filtrados = useMemo(() => {
    let l = produtos;
    if (situacao === 'ativos') l = l.filter((p) => p.ativo);
    if (situacao === 'inativos') l = l.filter((p) => !p.ativo);
    if (categoria) l = l.filter((p) => p.categoria_id === categoria);
    if (baixo) l = l.filter((p) => abaixoDoMinimo(p, baixo));
    return buscarProdutos(l, termo);
  }, [produtos, termo, situacao, categoria, baixo]);

  return (
    <div>
      <Titulo
        sub={`${filtrados.length} de ${produtos.length} produto(s)`}
        acoes={
          <>
            <Link href="/produtos/importar" className="btn-secundario">
              <FileSpreadsheet className="h-4 w-4" /> Importar / Exportar
            </Link>
            <Link href="/produtos/novo" className="btn-principal">
              <Plus className="h-4 w-4" /> Novo produto
            </Link>
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <select className="campo" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)}>
            <option value="ativos">Somente ativos</option>
            <option value="inativos">Somente inativos</option>
            <option value="todos">Ativos e inativos</option>
          </select>
          <select className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <select
            className="campo col-span-2 sm:col-span-1"
            value={baixo}
            onChange={(e) => setBaixo(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Qualquer saldo</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                Abaixo do mínimo em {l.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <Vazio>
          Nenhum produto encontrado.{' '}
          <Link href="/produtos/novo" className="text-dourado underline">
            Cadastrar um novo
          </Link>
        </Vazio>
      ) : (
        <div className="space-y-2">
          {filtrados.map((p) => {
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
                    <div className="text-xs text-suave">Venda {moeda(p.preco_venda)}</div>
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
                        <span className="text-[10px] text-suave">mín. {e.estoque_minimo}</span>
                      </div>
                    );
                  })}
                  {p.ativo && (
                    <Link
                      href={`/transferencia?produto=${p.id}`}
                      className="btn-azul min-h-[60px] px-3"
                      title="Transferir entre lojas"
                    >
                      <ArrowLeftRight className="h-5 w-5" />
                      <span className="hidden md:inline">Transferir</span>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
