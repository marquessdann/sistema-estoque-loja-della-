'use client';

import { FileSpreadsheet, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Campo, Carregando, SemPermissao, Titulo, Vazio } from '@/components/ui';
import { buscarTudo, useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { exportarExcel, type Coluna } from '@/lib/exportar';
import { CARGOS, dataHora, fimDoDia, hojeISO, inicioDoDia } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Cargo, RegistroLog, Usuario } from '@/lib/tipos';

const rotuloCargo = (c: string | null) => (c && c in CARGOS ? CARGOS[c as Cargo].rotulo : '');

// Log de atividades: SÓ o CEO e o gerente veem. Mostra qual usuário fez cada mudança
// (lançamentos de estoque, cadastros, usuários, lojas e logins). O banco de dados
// também só devolve estas linhas para o CEO e o gerente.
export default function Log() {
  const { ehAdmin, versao } = useDados();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [quem, setQuem] = useState('');
  const [tipo, setTipo] = useState<'' | 'estoque' | 'cadastro' | 'login'>('');
  const [de, setDe] = useState(hojeISO(-7));
  const [ate, setAte] = useState(hojeISO());
  const [lista, setLista] = useState<RegistroLog[] | null>(null);

  useEffect(() => {
    supabaseNavegador()
      .from('usuarios')
      .select('*')
      .order('nome')
      .then(({ data }) => setUsuarios((data ?? []) as Usuario[]));
  }, []);

  useEffect(() => {
    if (!ehAdmin) return;
    setLista(null);
    buscarTudo<RegistroLog>((ini, fim) => {
      let q = supabaseNavegador().from('vw_log').select('*').order('quando', { ascending: false });
      if (de) q = q.gte('quando', inicioDoDia(de));
      if (ate) q = q.lte('quando', fimDoDia(ate));
      if (quem) q = q.eq('usuario_id', quem);
      if (tipo === 'estoque') q = q.eq('origem', 'operacao');
      if (tipo === 'cadastro') q = q.eq('origem', 'auditoria').not('acao', 'ilike', 'Entrou*').not('acao', 'ilike', 'Errou*');
      if (tipo === 'login') q = q.or('acao.ilike.Entrou*,acao.ilike.Errou*');
      return q.range(ini, fim);
    }, 5000)
      .then(setLista)
      .catch((e) => {
        toast.error(mensagemErro(e));
        setLista([]);
      });
  }, [ehAdmin, de, ate, quem, tipo, versao]);

  if (!ehAdmin) return <SemPermissao texto="O log de atividades é exclusivo do CEO e do gerente." />;

  const colunas: Coluna<RegistroLog>[] = [
    { titulo: 'Quando', valor: (r) => dataHora(r.quando), largura: 17 },
    { titulo: 'Usuário', valor: (r) => r.usuario_nome, largura: 20 },
    { titulo: 'Cargo', valor: (r) => rotuloCargo(r.perfil), largura: 13 },
    { titulo: 'O que fez', valor: (r) => r.acao, largura: 24 },
    { titulo: 'Detalhe', valor: (r) => r.detalhe, largura: 70 },
  ];

  return (
    <div className="space-y-4">
      <Titulo sub="Quem fez cada mudança no sistema: entradas, saídas, transferências, ajustes, estornos, cadastros e acessos. Só o CEO e o gerente veem esta tela.">
        Log de atividades
      </Titulo>

      <div className="cartao grid grid-cols-2 gap-3 md:grid-cols-5">
        <Campo rotulo="Usuário" className="col-span-2 md:col-span-1">
          <select className="campo" value={quem} onChange={(e) => setQuem(e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} ({rotuloCargo(u.cargo)})
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Tipo" className="col-span-2 md:col-span-1">
          <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="">Tudo</option>
            <option value="estoque">Movimentações de estoque</option>
            <option value="cadastro">Cadastros e configurações</option>
            <option value="login">Acessos (login e entrada nos estoques)</option>
          </select>
        </Campo>
        <Campo rotulo="De">
          <input type="date" className="campo" value={de} onChange={(e) => setDe(e.target.value)} />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" className="campo" value={ate} onChange={(e) => setAte(e.target.value)} />
        </Campo>
        <div className="col-span-2 flex items-end md:col-span-1">
          <button
            className="btn-secundario w-full"
            onClick={() => (lista?.length ? exportarExcel('log-atividades', [{ nome: 'Log', colunas, linhas: lista }]) : toast.error('Nada para exportar.'))}
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
        </div>
      </div>

      {!lista ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <Vazio>Nenhuma atividade com esses filtros.</Vazio>
      ) : (
        <div className="cartao p-0 sm:p-0">
          {lista.map((r) => (
            <div key={`${r.origem}-${r.referencia}`} className="flex gap-3 border-b border-borda/60 px-4 py-3 last:border-0">
              <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-dourado" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <b>{r.usuario_nome}</b>
                  {r.perfil && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${CARGOS[r.perfil as Cargo]?.cor ?? ''}`}>
                      {rotuloCargo(r.perfil)}
                    </span>
                  )}
                  <span className="text-neutral-300">{r.acao}</span>
                  {r.origem === 'operacao' && (
                    <Link href={`/movimentacoes?op=${r.referencia}`} className="inline-flex min-h-[36px] items-center px-1 text-xs text-dourado hover:underline">
                      nº {r.referencia}
                    </Link>
                  )}
                </div>
                {r.detalhe && <div className="mt-0.5 break-words text-xs text-suave">{r.detalhe}</div>}
                <div className="text-xs text-neutral-500">{dataHora(r.quando)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
