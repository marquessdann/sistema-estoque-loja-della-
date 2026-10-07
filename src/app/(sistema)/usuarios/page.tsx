'use client';

import { Loader2, Plus, UserCog } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Campo, Carregando, Modal, Titulo, Vazio } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { dataHora } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Perfil, Usuario } from '@/lib/tipos';

const LIMITE = 3;

async function chamarApi(metodo: 'POST' | 'PATCH', corpo: object) {
  const r = await fetch('/api/usuarios', {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.erro ?? 'Erro ao salvar.');
}

export default function Usuarios() {
  const { ehAdmin, usuario: eu, recarregar } = useDados();
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [editando, setEditando] = useState<Usuario | 'novo' | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabaseNavegador().from('usuarios').select('*').order('criado_em');
    setLista((data ?? []) as Usuario[]);
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!ehAdmin) return <Vazio>Apenas o administrador pode acessar esta tela.</Vazio>;

  const ativos = lista?.filter((u) => u.ativo).length ?? 0;
  const cheio = ativos >= LIMITE;

  return (
    <div className="space-y-4">
      <Titulo
        sub={`${ativos} de ${LIMITE} usuários ativos (limite do sistema).`}
        acoes={
          <button
            className="btn-principal"
            onClick={() => (cheio ? toast.error(`Limite de ${LIMITE} usuários atingido. Desative um usuário antes de cadastrar outro.`) : setEditando('novo'))}
          >
            <Plus className="h-4 w-4" /> Novo usuário
          </button>
        }
      >
        Usuários
      </Titulo>

      {cheio && (
        <div className="rounded-xl border border-orange-400/40 bg-orange-400/10 p-3 text-sm text-orange-200">
          O sistema já tem {LIMITE} usuários ativos. Para cadastrar outra pessoa, desative um usuário primeiro.
        </div>
      )}

      {!lista ? (
        <Carregando />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {lista.map((u) => (
            <div key={u.id} className={`cartao space-y-2 ${!u.ativo ? 'opacity-50' : ''}`}>
              <div className="font-titulo text-lg font-bold">{u.nome}</div>
              <div className="break-all text-sm text-suave">{u.email}</div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className={`rounded px-2 py-0.5 font-semibold ${u.perfil === 'admin' ? 'bg-dourado text-preto' : 'bg-marinho text-white'}`}>
                  {u.perfil === 'admin' ? 'Administrador' : 'Operador'}
                </span>
                {!u.ativo && <span className="rounded bg-rose-500/20 px-2 py-0.5 text-rose-300">Desativado</span>}
                {u.id === eu?.id && <span className="rounded bg-white/10 px-2 py-0.5">Você</span>}
              </div>
              <div className="text-xs text-neutral-500">Desde {dataHora(u.criado_em)}</div>
              <button className="btn-secundario w-full" onClick={() => setEditando(u)}>
                <UserCog className="h-4 w-4" /> Editar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="cartao text-sm text-suave">
        <b className="text-white">Perfis:</b> o <b>Administrador</b> faz tudo, inclusive gerenciar usuários e configurações. O{' '}
        <b>Operador</b> cadastra produtos e faz movimentações (entrada, saída, transferência, inventário e estorno).
      </div>

      {editando && (
        <FormUsuario
          usuario={editando === 'novo' ? null : editando}
          souEu={editando !== 'novo' && editando.id === eu?.id}
          aoFechar={() => setEditando(null)}
          aoSalvar={async () => {
            setEditando(null);
            await carregar();
            await recarregar();
          }}
        />
      )}
    </div>
  );
}

function FormUsuario({
  usuario,
  souEu,
  aoFechar,
  aoSalvar,
}: {
  usuario: Usuario | null;
  souEu: boolean;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [perfil, setPerfil] = useState<Perfil>(usuario?.perfil ?? 'operador');
  const [senha, setSenha] = useState('');
  const [ativo, setAtivo] = useState(usuario?.ativo ?? true);
  const [ocupado, setOcupado] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario && senha.length < 8) return toast.error('Crie uma senha com pelo menos 8 caracteres.');
    if (usuario && usuario.ativo && !ativo && !window.confirm(`Desativar ${usuario.nome}? A pessoa não vai mais conseguir entrar.`)) return;
    setOcupado(true);
    try {
      if (usuario) await chamarApi('PATCH', { id: usuario.id, nome, perfil, ativo, senha: senha || undefined });
      else await chamarApi('POST', { nome, email, senha, perfil });
      toast.success(usuario ? 'Usuário atualizado!' : 'Usuário criado! Passe o e-mail e a senha para a pessoa.');
      aoSalvar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={usuario ? `Editar ${usuario.nome}` : 'Novo usuário'}>
      <form onSubmit={salvar} className="space-y-3">
        <Campo rotulo="Nome" obrigatorio>
          <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Campo>
        <Campo rotulo="E-mail (usado no login)" obrigatorio>
          <input type="email" className="campo" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!usuario} required />
        </Campo>
        <Campo rotulo="Perfil">
          <select className="campo" value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)} disabled={souEu}>
            <option value="operador">Operador (produtos e movimentações)</option>
            <option value="admin">Administrador (tudo)</option>
          </select>
        </Campo>
        <Campo rotulo={usuario ? 'Nova senha (deixe vazio para manter)' : 'Senha inicial'} dica="Mínimo de 8 caracteres" obrigatorio={!usuario}>
          <input type="text" className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
        </Campo>
        {usuario && !souEu && (
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-dourado" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Usuário ativo (pode entrar no sistema)
          </label>
        )}
        <button className="btn-principal w-full" disabled={ocupado}>
          {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
          {usuario ? 'Salvar' : 'Criar usuário'}
        </button>
      </form>
    </Modal>
  );
}
