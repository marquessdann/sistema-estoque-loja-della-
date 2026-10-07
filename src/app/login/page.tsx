'use client';

import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Rodape } from '@/components/rodape';
import { useState } from 'react';
import { toast } from 'sonner';
import { Campo } from '@/components/ui';
import { mensagemErro } from '@/lib/erros';
import { paraEmail } from '@/lib/login';
import { supabaseNavegador } from '@/lib/supabase/client';

export default function PaginaLogin() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [modoRecuperar, setModoRecuperar] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    const sb = supabaseNavegador();
    const { error } = await sb.auth.signInWithPassword({ email: paraEmail(email), password: senha });
    if (error) {
      setOcupado(false);
      return toast.error(/invalid login credentials/i.test(error.message) ? 'Usuário ou senha incorretos.' : mensagemErro(error));
    }
    const { error: erroLogin } = await sb.rpc('registrar_login');
    if (erroLogin) {
      await sb.auth.signOut();
      setOcupado(false);
      return toast.error('Seu usuário está desativado. Fale com o CEO.');
    }
    // a cada login a pessoa escolhe de novo o estoque (com a senha do estoque)
    await sb.rpc('sair_loja');
    window.location.href = '/';
  }

  async function recuperar(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return toast.error('Digite seu e-mail.');
    if (!email.includes('@'))
      return toast.error('Quem entra por usuário (sem e-mail) pede uma nova senha ao CEO, na tela Usuários.');
    setOcupado(true);
    const { error } = await supabaseNavegador().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setOcupado(false);
    if (error) return toast.error(mensagemErro(error));
    toast.success('Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.');
    setModoRecuperar(false);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_#0d3b8240,_transparent_60%)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/logo.png" alt="DELLA Distribuidora de Produtos" width={240} height={218} priority />
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-dourado">Controle de estoque</p>
        </div>
        <form onSubmit={modoRecuperar ? recuperar : entrar} className="cartao space-y-4">
          <Campo rotulo={modoRecuperar ? 'E-mail' : 'Usuário'}>
            <input
              type="text"
              name="usuario"
              className="campo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={modoRecuperar ? 'seu@email.com' : 'Ex.: daniel'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              required
              autoFocus
            />
          </Campo>
          {!modoRecuperar && (
            <Campo rotulo="Senha">
              <input
                type="password"
                className="campo"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Campo>
          )}
          <button className="btn-principal w-full text-base" disabled={ocupado}>
            {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
            {modoRecuperar ? 'Enviar link de nova senha' : 'Entrar'}
          </button>
          <button
            type="button"
            className="w-full text-center text-sm text-suave hover:text-dourado"
            onClick={() => setModoRecuperar(!modoRecuperar)}
          >
            {modoRecuperar ? 'Voltar para o login' : 'Esqueci minha senha'}
          </button>
        </form>
      </div>
      <Rodape />
    </main>
  );
}
