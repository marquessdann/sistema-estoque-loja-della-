'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Campo } from '@/components/ui';
import { mensagemErro } from '@/lib/erros';
import { supabaseNavegador } from '@/lib/supabase/client';

// Página aberta pelo link "esqueci minha senha" recebido por e-mail.
export default function RedefinirSenha() {
  const [pronto, setPronto] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const sb = supabaseNavegador();
    const codigo = new URLSearchParams(window.location.search).get('code');
    (async () => {
      if (codigo) {
        const { error } = await sb.auth.exchangeCodeForSession(codigo);
        if (error) return setFalhou(true);
      }
      const { data } = await sb.auth.getSession();
      if (data.session) setPronto(true);
      else setFalhou(true);
    })();
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 6) return toast.error('A senha precisa ter pelo menos 6 caracteres.');
    if (senha !== confirma) return toast.error('As senhas não conferem.');
    setOcupado(true);
    const { error } = await supabaseNavegador().auth.updateUser({ password: senha });
    setOcupado(false);
    if (error) return toast.error(mensagemErro(error));
    toast.success('Senha criada! Entrando...');
    window.location.href = '/';
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Image src="/logo.png" alt="DELLA" width={160} height={145} priority />
        </div>
        <div className="cartao">
          <h1 className="mb-4 font-titulo text-xl font-bold">Criar nova senha</h1>
          {falhou ? (
            <p className="text-sm text-rose-300">
              Este link expirou ou já foi usado. Volte ao <a className="text-dourado underline" href="/login">login</a> e
              peça um novo link (abra o link no mesmo navegador em que pediu), ou peça ao administrador para trocar sua senha.
            </p>
          ) : !pronto ? (
            <p className="text-sm text-suave">Validando o link...</p>
          ) : (
            <form onSubmit={salvar} className="space-y-3">
              <Campo rotulo="Nova senha" dica="Mínimo de 6 caracteres">
                <input type="password" className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
              </Campo>
              <Campo rotulo="Repita a nova senha">
                <input type="password" className="campo" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" />
              </Campo>
              <button className="btn-principal w-full" disabled={ocupado}>
                Salvar e entrar
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
