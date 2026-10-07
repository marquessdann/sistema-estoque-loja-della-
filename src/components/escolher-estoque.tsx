'use client';

import { Loader2, Lock, Warehouse } from 'lucide-react';
import Image from 'next/image';
import { Rodape } from './rodape';
import { useState } from 'react';
import { toast } from 'sonner';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { corTexto } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Loja } from '@/lib/tipos';

// Tela "Em qual estoque você vai trabalhar?". Pede a senha do estoque.
// Tudo o que a pessoa lançar depois acontece dentro deste estoque (o banco confere).
export function EscolherEstoque({ aoCancelar }: { aoCancelar?: () => void }) {
  const { lojas, usuario, recarregar } = useDados();
  const [escolhida, setEscolhida] = useState<Loja | null>(null);
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!escolhida) return;
    setOcupado(true);
    const { data, error } = await supabaseNavegador().rpc('entrar_loja', { p_loja: escolhida.id, p_senha: senha });
    setOcupado(false);
    if (error) return toast.error(mensagemErro(error));
    if (!data) return toast.error(`Senha do estoque ${escolhida.nome} incorreta.`);
    toast.success(`Você está no estoque ${escolhida.nome}.`);
    setSenha('');
    await recarregar();
    aoCancelar?.();
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-preto" data-tela="escolher-estoque">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center gap-6 p-4 py-10">
        <Image src="/logo.png" alt="DELLA Distribuidora de Produtos" width={170} height={154} priority />
        <div className="text-center">
          <h1 className="font-titulo text-2xl font-bold sm:text-3xl">Em qual estoque você vai trabalhar?</h1>
          <p className="mt-1 text-sm text-suave">
            Olá, {usuario?.nome.split(' ')[0]}! Tudo o que você lançar vai acontecer dentro do estoque escolhido.
          </p>
        </div>

        <div className="grid w-full gap-4 sm:grid-cols-2">
          {lojas.map((l) => {
            const ativa = escolhida?.id === l.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setEscolhida(l);
                  setSenha('');
                }}
                className={`flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-2xl border-2 p-6 font-titulo text-xl font-extrabold uppercase tracking-wide transition ${
                  ativa ? 'scale-[1.02] shadow-2xl' : 'border-borda bg-painel hover:border-neutral-500'
                }`}
                style={ativa ? { backgroundColor: l.cor, borderColor: l.cor, color: corTexto(l.cor) } : { color: l.cor }}
              >
                <Warehouse className="h-10 w-10" />
                {l.nome}
                {usuario?.loja_atual === l.id && <span className="text-xs font-semibold normal-case opacity-80">(você está aqui)</span>}
              </button>
            );
          })}
        </div>

        {escolhida && (
          <form onSubmit={entrar} className="cartao w-full max-w-md space-y-3">
            <label className="block">
              <span className="rotulo flex items-center gap-1">
                <Lock className="h-4 w-4" /> Senha do estoque {escolhida.nome}
              </span>
              <input type="password" className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus autoComplete="off" />
            </label>
            <button className="btn-principal w-full text-base" disabled={ocupado || !senha}>
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} Entrar no {escolhida.nome}
            </button>
          </form>
        )}

        {aoCancelar && (
          <button className="text-sm text-suave hover:text-dourado" onClick={aoCancelar}>
            Voltar sem trocar de estoque
          </button>
        )}
        <Rodape />
      </div>
    </div>
  );
}
