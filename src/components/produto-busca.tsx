'use client';

import { ScanBarcode, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useDados } from '@/lib/dados';
import { buscarProdutos, normalizar } from '@/lib/formato';
import type { Produto } from '@/lib/tipos';

// Campo de busca de produto por nome, SKU ou código de barras.
// Com leitor de código de barras: bipou + Enter = produto adicionado.
export function ProdutoBusca({
  aoEscolher,
  placeholder = 'Buscar produto por nome, SKU ou código de barras...',
  autoFocus,
  incluirInativos = false,
}: {
  aoEscolher: (p: Produto) => void;
  placeholder?: string;
  autoFocus?: boolean;
  incluirInativos?: boolean;
}) {
  const { produtos } = useDados();
  const [termo, setTermo] = useState('');
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  const resultados = useMemo(() => {
    const base = incluirInativos ? produtos : produtos.filter((p) => p.ativo);
    return termo.trim() ? buscarProdutos(base, termo).slice(0, 8) : [];
  }, [produtos, termo, incluirInativos]);

  function escolher(p: Produto) {
    aoEscolher(p);
    setTermo('');
    setAberto(false);
    setDestaque(0);
    ref.current?.focus();
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDestaque((d) => Math.min(d + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDestaque((d) => Math.max(d - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const t = normalizar(termo);
      const exato = produtos.find((p) => p.ativo && (p.ean === termo.trim() || normalizar(p.sku) === t));
      if (exato) return escolher(exato);
      if (resultados[destaque]) escolher(resultados[destaque]);
    } else if (e.key === 'Escape') {
      setAberto(false);
    }
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" />
      <input
        ref={ref}
        autoFocus={autoFocus}
        className="campo pl-10 pr-10"
        placeholder={placeholder}
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
          setDestaque(0);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={teclado}
      />
      <ScanBarcode className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-600" />
      {aberto && termo.trim() && (
        <div className="absolute z-30 mt-1 max-h-96 w-full overflow-y-auto rounded-xl border border-borda bg-painel2 shadow-2xl">
          {resultados.length === 0 ? (
            <div className="p-4 text-sm text-suave">Nenhum produto encontrado.</div>
          ) : (
            resultados.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(p)}
                className={`flex w-full flex-col gap-1 border-b border-borda/50 px-4 py-3 text-left last:border-0 ${
                  i === destaque ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <span className="font-medium">
                  {p.nome} {!p.ativo && <span className="text-xs text-rose-400">(inativo)</span>}
                </span>
                <span className="text-xs text-suave">SKU {p.sku}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
