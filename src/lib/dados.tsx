'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseNavegador } from './supabase/client';
import type { Cadastro, Loja, Permissao, Produto, Usuario } from './tipos';

// "Central de dados" do sistema: carrega usuário, lojas e produtos (com saldos)
// uma vez e mantém tudo atualizado em TEMPO REAL. Assim a busca é instantânea
// e, quando alguém mexe no estoque, todas as telas abertas se atualizam sozinhas.

interface Dados {
  carregando: boolean;
  erro: string | null;
  usuario: Usuario | null;
  ehAdmin: boolean;
  /** o usuário logado pode fazer esta ação? (admin sempre pode) */
  pode: (p: Permissao) => boolean;
  /** lojas ativas */
  lojas: Loja[];
  /** estoque em que o usuário entrou (com a senha do estoque) */
  lojaAtual: Loja | undefined;
  /** as outras lojas (destinos possíveis de transferência) */
  outrasLojas: Loja[];
  produtos: Produto[];
  categorias: Cadastro[];
  marcas: Cadastro[];
  /** muda a cada alteração no estoque: telas de histórico usam para recarregar */
  versao: number;
  recarregar: () => Promise<void>;
  produtoPorId: (id: number) => Produto | undefined;
  loja: (id: number | null | undefined) => Loja | undefined;
  categoriaNome: (id: number | null) => string;
  marcaNome: (id: number | null) => string;
}

const Contexto = createContext<Dados | null>(null);

export const CAMPOS_LOJA = 'id, codigo, nome, cor, ordem, ativa';

const CAMPOS_PRODUTO =
  'id, sku, ean, nome, categoria_id, marca_id, unidade, preco_custo, preco_venda, custo_medio, foto_path, observacoes, ativo, ml_item_id, criado_em, atualizado_em, estoques:produto_loja(loja_id, saldo, estoque_minimo)';

async function carregarTodosProdutos(): Promise<Produto[]> {
  const sb = supabaseNavegador();
  const lista: Produto[] = [];
  const pagina = 1000;
  for (let inicio = 0; ; inicio += pagina) {
    const { data, error } = await sb
      .from('produtos')
      .select(CAMPOS_PRODUTO)
      .order('nome')
      .range(inicio, inicio + pagina - 1);
    if (error) throw error;
    lista.push(
      ...(data as unknown as Produto[]).map((p) => ({
        ...p,
        preco_custo: Number(p.preco_custo),
        preco_venda: Number(p.preco_venda),
        custo_medio: Number(p.custo_medio),
      })),
    );
    if (!data || data.length < pagina) break;
  }
  return lista;
}

export function DadosProvider({ children }: { children: React.ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Cadastro[]>([]);
  const [marcas, setMarcas] = useState<Cadastro[]>([]);
  const [versao, setVersao] = useState(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recarregar = useCallback(async () => {
    const sb = supabaseNavegador();
    try {
      const [{ data: auth }, lojasR, catR, marR, prods] = await Promise.all([
        sb.auth.getUser(),
        sb.from('lojas').select(CAMPOS_LOJA).eq('ativa', true).order('ordem'),
        sb.from('categorias').select('id, nome').order('nome'),
        sb.from('marcas').select('id, nome').order('nome'),
        carregarTodosProdutos(),
      ]);
      if (!auth.user) {
        window.location.href = '/login';
        return;
      }
      const { data: u } = await sb.from('usuarios').select('*').eq('id', auth.user.id).maybeSingle();
      if (!u || !u.ativo) {
        await sb.auth.signOut();
        setErro('Seu usuário está desativado ou não foi encontrado. Fale com o administrador.');
        return;
      }
      if (lojasR.error) throw lojasR.error;
      setUsuario(u as Usuario);
      setLojas(lojasR.data as Loja[]);
      setCategorias((catR.data ?? []) as Cadastro[]);
      setMarcas((marR.data ?? []) as Cadastro[]);
      setProdutos(prods);
      setErro(null);
      setVersao((v) => v + 1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os dados.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    recarregar();
    const sb = supabaseNavegador();
    // Agrupa vários avisos seguidos numa única recarga
    const agendar = () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => recarregar(), 400);
    };
    const canal = sb
      .channel('estoque-tempo-real')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produto_loja' }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operacoes' }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transferencias' }, agendar)
      .subscribe();
    // ao voltar para a aba, garante dados frescos
    const aoFocar = () => document.visibilityState === 'visible' && agendar();
    document.addEventListener('visibilitychange', aoFocar);
    return () => {
      sb.removeChannel(canal);
      document.removeEventListener('visibilitychange', aoFocar);
    };
  }, [recarregar]);

  const valor = useMemo<Dados>(() => {
    const mapaProdutos = new Map(produtos.map((p) => [p.id, p]));
    const mapaCat = new Map(categorias.map((c) => [c.id, c.nome]));
    const mapaMarca = new Map(marcas.map((c) => [c.id, c.nome]));
    const ehAdmin = usuario?.perfil === 'admin';
    const pode = (p: Permissao) => {
      if (!usuario) return false;
      if (ehAdmin) return true;
      return Boolean(usuario[`perm_${p}` as keyof Usuario]);
    };
    return {
      carregando,
      erro,
      usuario,
      ehAdmin,
      pode,
      lojas,
      lojaAtual: lojas.find((l) => l.id === usuario?.loja_atual),
      outrasLojas: lojas.filter((l) => l.id !== usuario?.loja_atual),
      produtos,
      categorias,
      marcas,
      versao,
      recarregar,
      produtoPorId: (id) => mapaProdutos.get(id),
      loja: (id) => lojas.find((l) => l.id === id),
      categoriaNome: (id) => (id ? (mapaCat.get(id) ?? '') : ''),
      marcaNome: (id) => (id ? (mapaMarca.get(id) ?? '') : ''),
    };
  }, [carregando, erro, usuario, lojas, produtos, categorias, marcas, versao, recarregar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDados() {
  const c = useContext(Contexto);
  if (!c) throw new Error('useDados precisa estar dentro de <DadosProvider>');
  return c;
}

// Endereço público da foto de um produto
export function urlFoto(path: string | null | undefined) {
  if (!path) return null;
  return supabaseNavegador().storage.from('produtos').getPublicUrl(path).data.publicUrl;
}

// Busca TODAS as linhas de uma consulta, de 1000 em 1000 (limite do Supabase por pedido).
export async function buscarTudo<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  maximo = 50000,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; de < maximo; de += 1000) {
    const { data, error } = await montar(de, de + 999);
    if (error) throw error;
    const pagina = (data ?? []) as T[];
    todas.push(...pagina);
    if (pagina.length < 1000) break;
  }
  return todas;
}
