'use client';

import { Check } from 'lucide-react';
import { corTexto } from '@/lib/formato';
import type { Loja } from '@/lib/tipos';

// Etiqueta colorida de cada loja — sempre visível para ninguém lançar na loja errada.
export function LojaTag({
  loja,
  tamanho = 'md',
}: {
  loja: Pick<Loja, 'nome' | 'cor'> | null | undefined;
  tamanho?: 'sm' | 'md' | 'lg';
}) {
  if (!loja) return <span className="text-suave">—</span>;
  const classes = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-0.5 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }[tamanho];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md font-bold uppercase tracking-wide ${classes}`}
      style={{ backgroundColor: loja.cor, color: corTexto(loja.cor) }}
    >
      {loja.nome}
    </span>
  );
}

// Escolha de loja com botões grandes e coloridos
export function SeletorLoja({
  lojas,
  valor,
  aoMudar,
  rotulo,
  desabilitada,
}: {
  lojas: Loja[];
  valor: number | null;
  aoMudar: (id: number) => void;
  rotulo: string;
  desabilitada?: number | null;
}) {
  return (
    <div>
      <span className="rotulo">{rotulo}</span>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {lojas.map((l) => {
          const ativo = l.id === valor;
          const bloqueada = desabilitada === l.id;
          return (
            <button
              key={l.id}
              type="button"
              disabled={bloqueada}
              onClick={() => aoMudar(l.id)}
              className={`flex min-h-[56px] items-center justify-between gap-2 rounded-xl border-2 px-4 py-3 text-left font-titulo font-bold transition disabled:cursor-not-allowed disabled:opacity-30 ${
                ativo ? 'shadow-lg' : 'border-borda bg-painel2 text-neutral-300 hover:border-neutral-500'
              }`}
              style={ativo ? { borderColor: l.cor, backgroundColor: l.cor, color: corTexto(l.cor) } : undefined}
            >
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: ativo ? corTexto(l.cor) : l.cor }} />
                {l.nome}
              </span>
              {ativo && <Check className="h-5 w-5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Faixa grande no topo das telas de lançamento mostrando a loja escolhida
export function FaixaLoja({ loja, texto }: { loja: Loja | undefined; texto: string }) {
  if (!loja) return null;
  return (
    <div
      className="sticky top-0 z-20 -mx-4 mb-4 flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-bold uppercase tracking-wide sm:mx-0 sm:rounded-lg"
      style={{ backgroundColor: loja.cor, color: corTexto(loja.cor) }}
    >
      {texto} {loja.nome}
    </div>
  );
}
