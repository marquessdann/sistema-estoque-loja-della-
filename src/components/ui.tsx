'use client';

import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TIPOS } from '@/lib/formato';
import type { TipoOperacao } from '@/lib/tipos';

// Peças visuais básicas reaproveitadas em todas as telas.

export function Titulo({
  children,
  sub,
  acoes,
}: {
  children: React.ReactNode;
  sub?: React.ReactNode;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-titulo text-2xl font-bold tracking-tight text-white sm:text-3xl">{children}</h1>
        {sub && <p className="mt-1 text-sm text-suave">{sub}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Campo({
  rotulo,
  dica,
  erro,
  obrigatorio,
  children,
  className = '',
}: {
  rotulo: string;
  dica?: React.ReactNode;
  erro?: string | null;
  obrigatorio?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="rotulo">
        {rotulo} {obrigatorio && <span className="text-dourado">*</span>}
      </span>
      {children}
      {erro ? (
        <span className="mt-1 block text-xs text-rose-400">{erro}</span>
      ) : dica ? (
        <span className="mt-1 block text-xs text-neutral-500">{dica}</span>
      ) : null}
    </label>
  );
}

export function Carregando({ texto = 'Carregando...' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-suave">
      <Loader2 className="h-5 w-5 animate-spin text-dourado" /> {texto}
    </div>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-borda p-8 text-center text-suave">{children}</div>;
}

export function TipoBadge({ tipo }: { tipo: TipoOperacao }) {
  const t = TIPOS[tipo];
  return (
    <span className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${t.cor}`}>
      {t.rotulo}
    </span>
  );
}

export function Modal({
  aberto,
  aoFechar,
  titulo,
  children,
  largura = 'max-w-lg',
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: React.ReactNode;
  children: React.ReactNode;
  largura?: string;
}) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={aoFechar} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative max-h-[92vh] w-full ${largura} overflow-y-auto rounded-t-2xl border border-borda bg-painel p-5 shadow-2xl sm:rounded-2xl`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-titulo text-lg font-bold">{titulo}</h2>
          <button onClick={aoFechar} className="btn-fantasma -mr-2 -mt-1" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Janela de confirmação antes de ações importantes
export function Confirmar({
  aberto,
  titulo,
  children,
  textoConfirmar = 'Confirmar',
  perigo = false,
  ocupado = false,
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean;
  titulo: string;
  children: React.ReactNode;
  textoConfirmar?: string;
  perigo?: boolean;
  ocupado?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  return (
    <Modal aberto={aberto} aoFechar={ocupado ? () => {} : aoCancelar} titulo={titulo}>
      <div className="space-y-3 text-sm text-neutral-200">{children}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="btn-secundario" onClick={aoCancelar} disabled={ocupado}>
          Voltar
        </button>
        <button className={perigo ? 'btn-perigo' : 'btn-principal'} onClick={aoConfirmar} disabled={ocupado}>
          {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
          {textoConfirmar}
        </button>
      </div>
    </Modal>
  );
}

// Campo de quantidade inteira (aceita só números)
export function CampoQuantidade({
  valor,
  aoMudar,
  max,
  className = '',
  autoFocus,
}: {
  valor: number | '';
  aoMudar: (v: number | '') => void;
  max?: number;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      step={1}
      autoFocus={autoFocus}
      className={`campo tabular text-right ${className}`}
      value={valor}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const t = e.target.value;
        if (t === '') return aoMudar('');
        const n = Math.max(0, Math.floor(Number(t)));
        aoMudar(Number.isFinite(n) ? n : '');
      }}
    />
  );
}

// Seção que abre e fecha (ex.: dados da nota fiscal opcionais)
export function Expansivel({
  titulo,
  inicialAberto = false,
  children,
  extra,
}: {
  titulo: React.ReactNode;
  inicialAberto?: boolean;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(inicialAberto);
  return (
    <div className="cartao">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="flex items-center gap-2 text-left font-semibold" onClick={() => setAberto(!aberto)}>
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded border border-borda text-dourado transition ${aberto ? 'rotate-90' : ''}`}
          >
            ›
          </span>
          {titulo}
        </button>
        {extra}
      </div>
      {aberto && <div className="mt-4">{children}</div>}
    </div>
  );
}
