'use client';

import { DatabaseBackup, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LojaTag } from '@/components/loja';
import { Campo, Carregando, Titulo, Vazio } from '@/components/ui';
import { buscarTudo, useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { exportarExcel, type Aba } from '@/lib/exportar';
import { dataHora } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Fornecedor, Loja } from '@/lib/tipos';
import { cnpjValido, formatarCNPJ } from '@/lib/validacao';

export default function Configuracoes() {
  const { ehAdmin } = useDados();
  if (!ehAdmin) return <Vazio>Apenas o administrador pode acessar esta tela.</Vazio>;
  return (
    <div className="space-y-5">
      <Titulo sub="Lojas, cadastros auxiliares, cópia de segurança e auditoria.">Configurações</Titulo>
      <Backup />
      <Lojas />
      <div className="grid gap-5 lg:grid-cols-2">
        <CadastroSimples tabela="categorias" titulo="Categorias" />
        <CadastroSimples tabela="marcas" titulo="Marcas" />
      </div>
      <Fornecedores />
      <Auditoria />
    </div>
  );
}

// ---------------------------------------------------------------
function Backup() {
  const [ocupado, setOcupado] = useState(false);

  async function exportarTudo() {
    setOcupado(true);
    try {
      const sb = supabaseNavegador();
      const tabelas: [string, string, string][] = [
        ['Produtos', 'produtos', 'id'],
        ['Saldos por loja', 'produto_loja', 'produto_id'],
        ['Lojas', 'lojas', 'id'],
        ['Operações', 'vw_operacoes', 'id'],
        ['Movimentações', 'vw_movimentacoes', 'id'],
        ['Notas fiscais', 'vw_notas', 'id'],
        ['Fornecedores', 'fornecedores', 'id'],
        ['Categorias', 'categorias', 'id'],
        ['Marcas', 'marcas', 'id'],
        ['Usuários', 'usuarios', 'criado_em'],
        ['Auditoria', 'auditoria', 'id'],
      ];
      const abas: Aba<Record<string, unknown>>[] = [];
      for (const [nome, tabela, ordem] of tabelas) {
        const linhas = await buscarTudo<Record<string, unknown>>((de, ate) =>
          sb.from(tabela).select('*').order(ordem).range(de, ate),
        );
        const chaves = linhas.length ? Object.keys(linhas[0]) : ['(vazio)'];
        abas.push({
          nome,
          colunas: chaves.map((k) => ({
            titulo: k,
            largura: Math.min(40, Math.max(10, k.length + 2)),
            valor: (l) => {
              const v = l[k];
              return v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : (v as string | number);
            },
          })),
          linhas,
        });
      }
      await exportarExcel('della-backup-completo', abas);
      toast.success('Cópia de todos os dados baixada!');
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="cartao flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-titulo font-bold">Exportar todos os dados</h2>
        <p className="text-sm text-suave">
          Baixa uma planilha Excel com todas as tabelas (produtos, saldos, movimentações, notas, usuários e auditoria). Guarde em
          local seguro. Além disso, o banco tem cópia automática diária (veja o guia de instalação).
        </p>
      </div>
      <button className="btn-principal" onClick={exportarTudo} disabled={ocupado}>
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />} Exportar tudo
      </button>
    </div>
  );
}

// ---------------------------------------------------------------
function Lojas() {
  const { lojas, recarregar } = useDados();
  const [edicao, setEdicao] = useState<Record<number, Pick<Loja, 'nome' | 'cor'>>>({});

  useEffect(() => {
    setEdicao(Object.fromEntries(lojas.map((l) => [l.id, { nome: l.nome, cor: l.cor }])));
  }, [lojas]);

  async function salvar(id: number) {
    const v = edicao[id];
    if (!v.nome.trim()) return toast.error('Informe o nome da loja.');
    const { error } = await supabaseNavegador().from('lojas').update({ nome: v.nome.trim().toUpperCase(), cor: v.cor }).eq('id', id);
    if (error) return toast.error(mensagemErro(error));
    await recarregar();
    toast.success('Loja atualizada!');
  }

  return (
    <div className="cartao space-y-3">
      <h2 className="font-titulo font-bold">Lojas (estoques)</h2>
      <p className="text-sm text-suave">Cada loja tem uma cor de etiqueta, para ninguém lançar na loja errada.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {lojas.map((l) => {
          const v = edicao[l.id] ?? { nome: l.nome, cor: l.cor };
          return (
            <div key={l.id} className="space-y-2 rounded-lg border border-borda bg-painel2 p-3">
              <LojaTag loja={v} tamanho="lg" />
              <div className="flex gap-2">
                <input
                  className="campo"
                  value={v.nome}
                  onChange={(e) => setEdicao({ ...edicao, [l.id]: { ...v, nome: e.target.value } })}
                />
                <input
                  type="color"
                  className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-borda bg-painel2"
                  value={v.cor}
                  onChange={(e) => setEdicao({ ...edicao, [l.id]: { ...v, cor: e.target.value.toUpperCase() } })}
                  title="Cor da etiqueta"
                />
              </div>
              <button className="btn-secundario w-full" onClick={() => salvar(l.id)}>
                Salvar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
function CadastroSimples({ tabela, titulo }: { tabela: 'categorias' | 'marcas'; titulo: string }) {
  const { categorias, marcas, recarregar } = useDados();
  const lista = tabela === 'categorias' ? categorias : marcas;
  const [novo, setNovo] = useState('');

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.trim()) return;
    const { error } = await supabaseNavegador().from(tabela).insert({ nome: novo.trim() });
    if (error) return toast.error(mensagemErro(error));
    setNovo('');
    await recarregar();
  }
  async function renomear(id: number, atual: string) {
    const nome = window.prompt('Novo nome:', atual);
    if (!nome?.trim() || nome === atual) return;
    const { error } = await supabaseNavegador().from(tabela).update({ nome: nome.trim() }).eq('id', id);
    if (error) return toast.error(mensagemErro(error));
    await recarregar();
  }
  async function excluir(id: number, nome: string) {
    if (!window.confirm(`Excluir "${nome}"?`)) return;
    const { error } = await supabaseNavegador().from(tabela).delete().eq('id', id);
    if (error) return toast.error(mensagemErro(error));
    await recarregar();
  }

  return (
    <div className="cartao space-y-3">
      <h2 className="font-titulo font-bold">{titulo}</h2>
      <form onSubmit={adicionar} className="flex gap-2">
        <input className="campo" placeholder={`Nova ${titulo === 'Marcas' ? 'marca' : 'categoria'}`} value={novo} onChange={(e) => setNovo(e.target.value)} />
        <button className="btn-secundario shrink-0">
          <Plus className="h-4 w-4" />
        </button>
      </form>
      <ul className="max-h-64 divide-y divide-borda overflow-y-auto">
        {lista.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-1.5 text-sm">
            {c.nome}
            <span className="flex">
              <button className="btn-fantasma" onClick={() => renomear(c.id, c.nome)} aria-label="Renomear">
                <Pencil className="h-4 w-4" />
              </button>
              <button className="btn-fantasma text-rose-400" onClick={() => excluir(c.id, c.nome)} aria-label="Excluir">
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          </li>
        ))}
        {lista.length === 0 && <li className="py-2 text-sm text-suave">Nenhuma cadastrada.</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------
function Fornecedores() {
  const [lista, setLista] = useState<Fornecedor[] | null>(null);
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');

  const carregar = useCallback(async () => {
    const { data } = await supabaseNavegador().from('fornecedores').select('*').order('nome');
    setLista((data ?? []) as Fornecedor[]);
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return toast.error('Informe o nome.');
    const limpo = cnpj.toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (limpo && !cnpjValido(limpo)) return toast.error('CNPJ inválido.');
    const { error } = await supabaseNavegador().from('fornecedores').insert({ nome: nome.trim(), cnpj: limpo || null });
    if (error) return toast.error(mensagemErro(error));
    setNome('');
    setCnpj('');
    carregar();
  }
  async function excluir(f: Fornecedor) {
    if (!window.confirm(`Excluir o fornecedor "${f.nome}"?`)) return;
    const { error } = await supabaseNavegador().from('fornecedores').delete().eq('id', f.id);
    if (error) return toast.error(mensagemErro(error));
    carregar();
  }

  return (
    <div className="cartao space-y-3">
      <h2 className="font-titulo font-bold">Fornecedores</h2>
      <p className="text-sm text-suave">São cadastrados automaticamente ao lançar notas fiscais. Aqui você pode incluir ou excluir.</p>
      <form onSubmit={adicionar} className="grid gap-2 sm:grid-cols-[1fr_220px_auto]">
        <Campo rotulo="Nome">
          <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="CNPJ (opcional)">
          <input className="campo" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
        </Campo>
        <button className="btn-secundario self-end">
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </form>
      {!lista ? (
        <Carregando />
      ) : (
        <ul className="max-h-72 divide-y divide-borda overflow-y-auto">
          {lista.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>
                {f.nome} {f.cnpj && <span className="text-xs text-suave">· {formatarCNPJ(f.cnpj)}</span>}
              </span>
              <button className="btn-fantasma text-rose-400" onClick={() => excluir(f)} aria-label="Excluir">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {lista.length === 0 && <li className="py-2 text-sm text-suave">Nenhum fornecedor ainda.</li>}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
interface RegistroAuditoria {
  id: number;
  usuario_nome: string | null;
  acao: string;
  tabela: string | null;
  registro_id: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  criado_em: string;
}

const NOMES_TABELA: Record<string, string> = {
  produtos: 'produto',
  usuarios: 'usuário',
  lojas: 'loja',
  categorias: 'categoria',
  marcas: 'marca',
  fornecedores: 'fornecedor',
  notas_fiscais: 'nota fiscal',
  produto_loja: 'estoque mínimo',
  login: '',
};

function resumoAuditoria(r: RegistroAuditoria) {
  const d = r.depois ?? r.antes ?? {};
  const nome = (d.nome ?? d.numero ?? '') as string;
  if (r.acao === 'alterou' && r.antes && r.depois) {
    const campos = Object.keys(r.depois).filter(
      (k) => !['atualizado_em', 'atualizado_por'].includes(k) && JSON.stringify(r.antes![k]) !== JSON.stringify(r.depois![k]),
    );
    return `${nome} (${campos.join(', ')})`;
  }
  return nome;
}

function Auditoria() {
  const [lista, setLista] = useState<RegistroAuditoria[] | null>(null);
  const [limite, setLimite] = useState(100);

  useEffect(() => {
    supabaseNavegador()
      .from('auditoria')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(limite)
      .then(({ data }) => setLista((data ?? []) as RegistroAuditoria[]));
  }, [limite]);

  return (
    <div className="cartao space-y-3 p-0 sm:p-0">
      <div className="px-4 pt-4">
        <h2 className="font-titulo font-bold">Auditoria</h2>
        <p className="text-sm text-suave">
          Quem fez o quê: logins e alterações de cadastros. As movimentações de estoque ficam em Movimentações, sempre com o
          nome de quem lançou.
        </p>
      </div>
      {!lista ? (
        <Carregando />
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="tabela">
            <thead className="sticky top-0 bg-painel">
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>Ação</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs">{dataHora(r.criado_em)}</td>
                  <td className="whitespace-nowrap">{r.usuario_nome ?? 'Sistema'}</td>
                  <td className="whitespace-nowrap">
                    {r.acao} {r.tabela && NOMES_TABELA[r.tabela] !== undefined ? NOMES_TABELA[r.tabela] : r.tabela}
                  </td>
                  <td className="text-xs text-suave">{resumoAuditoria(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length >= limite && (
            <div className="p-3 text-center">
              <button className="btn-secundario" onClick={() => setLimite(limite + 100)}>
                Carregar mais
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
