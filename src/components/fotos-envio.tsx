'use client';

import { Camera } from 'lucide-react';
import { useEffect, useState } from 'react';
import { dataHora } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { ProvaEnvio } from '@/lib/tipos';

export const NOMES_FOTOS = ['Produto ao lado da caixa', 'Produto dentro da caixa', 'Caixa lacrada com etiqueta'];

// Miniaturas das fotos (a pasta é privada: cada foto ganha um link que vale 1 hora)
export function MiniaturasEnvio({ fotos }: { fotos: string[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (fotos.length === 0) return;
    supabaseNavegador()
      .storage.from('envios')
      .createSignedUrls(fotos, 3600)
      .then(({ data }) => {
        const m: Record<string, string> = {};
        (data ?? []).forEach((d) => d.path && d.signedUrl && (m[d.path] = d.signedUrl));
        setUrls(m);
      });
  }, [fotos]);

  return (
    <div className="grid grid-cols-3 gap-2">
      {fotos.map((f, i) => (
        <a
          key={f}
          href={urls[f]}
          target="_blank"
          rel="noreferrer"
          className="group block overflow-hidden rounded-lg border border-borda bg-black"
          title={NOMES_FOTOS[i]}
        >
          {urls[f] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[f]} alt={NOMES_FOTOS[i] ?? 'Foto'} className="aspect-square w-full object-cover group-hover:opacity-80" />
          ) : (
            <div className="aspect-square w-full animate-pulse bg-painel2" />
          )}
          <div className="truncate px-1.5 py-1 text-[11px] text-suave">
            {i + 1}. {NOMES_FOTOS[i] ?? 'Foto'}
          </div>
        </a>
      ))}
    </div>
  );
}

// Fotos de envio ligadas a um pedido (mesmo código lido na etiqueta)
export function FotosDoPedido({ codigo }: { codigo: string }) {
  const [provas, setProvas] = useState<ProvaEnvio[] | null>(null);
  useEffect(() => {
    supabaseNavegador()
      .from('vw_provas_envio')
      .select('*')
      .eq('codigo', codigo)
      .order('criado_em', { ascending: false })
      .then(({ data }) => setProvas((data ?? []) as ProvaEnvio[]));
  }, [codigo]);

  if (!provas || provas.length === 0) return null;
  return (
    <div className="rounded-xl border border-borda bg-painel2 p-3">
      <div className="mb-2 flex items-center gap-2 font-semibold text-dourado">
        <Camera className="h-4 w-4" /> Prova de envio
      </div>
      <div className="space-y-3">
        {provas.map((p) => (
          <div key={p.id}>
            <div className="mb-1 text-xs text-suave">
              {dataHora(p.criado_em)} · {p.usuario_nome}
            </div>
            <MiniaturasEnvio fotos={p.fotos} />
          </div>
        ))}
      </div>
    </div>
  );
}
