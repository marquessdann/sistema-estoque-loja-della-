'use client';

import {
  ArrowLeftRight,
  Camera,
  ChartColumn,
  ClipboardCheck,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageMinus,
  PackagePlus,
  Package,
  Receipt,
  ScrollText,
  Settings,
  Truck,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Permissao } from '@/lib/tipos';
import { EscolherEstoque } from './escolher-estoque';
import { Rodape } from './rodape';
import { LojaTag } from './loja';
import { CARGOS, corTexto } from '@/lib/formato';
import { Carregando, Campo, Modal } from './ui';

// "perm": só aparece para quem tem a permissão (o banco também bloqueia)
const MENU: { href: string; rotulo: string; icone: typeof Package; perm?: Permissao }[] = [
  { href: '/', rotulo: 'Painel', icone: LayoutDashboard },
  { href: '/produtos', rotulo: 'Produtos', icone: Package },
  { href: '/entrada', rotulo: 'Entrada', icone: PackagePlus, perm: 'entrada' },
  { href: '/saida', rotulo: 'Saída (pedidos)', icone: PackageMinus, perm: 'saida' },
  { href: '/envios', rotulo: 'Envio com fotos', icone: Camera, perm: 'saida' },
  { href: '/transferencia', rotulo: 'Transferir entre estoques', icone: ArrowLeftRight, perm: 'transferir' },
  { href: '/transferencias', rotulo: 'Histórico de transferências', icone: Truck },
  { href: '/inventario', rotulo: 'Inventário', icone: ClipboardCheck, perm: 'inventario' },
  { href: '/movimentacoes', rotulo: 'Movimentações', icone: History },
  { href: '/notas', rotulo: 'Notas fiscais', icone: Receipt },
  { href: '/relatorios', rotulo: 'Relatórios', icone: ChartColumn, perm: 'relatorios' },
];
// CEO e gerente veem o log; usuários e configurações são só do CEO
const MENU_GESTAO = [{ href: '/log', rotulo: 'Log de atividades', icone: ScrollText }];
const MENU_CEO = [
  { href: '/usuarios', rotulo: 'Usuários', icone: Users },
  { href: '/configuracoes', rotulo: 'Configurações', icone: Settings },
];
const MENU_CELULAR: { href: string; rotulo: string; icone: typeof Package; perm?: Permissao }[] = [
  { href: '/', rotulo: 'Painel', icone: LayoutDashboard },
  { href: '/saida', rotulo: 'Saída', icone: PackageMinus, perm: 'saida' },
  { href: '/envios', rotulo: 'Fotos', icone: Camera, perm: 'saida' },
  { href: '/transferencia', rotulo: 'Transferir', icone: ArrowLeftRight, perm: 'transferir' },
  { href: '/movimentacoes', rotulo: 'Histórico', icone: History },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { carregando, erro, usuario, ehAdmin, ehCeo, pode, lojaAtual } = useDados();
  const [trocarEstoque, setTrocarEstoque] = useState(false);
  const caminho = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);
  const [trocarSenha, setTrocarSenha] = useState(false);

  const ativo = (href: string) => (href === '/' ? caminho === '/' : caminho.startsWith(href));
  const permitidos = MENU.filter((m) => !m.perm || pode(m.perm));
  const itens = [...permitidos, ...(ehAdmin ? MENU_GESTAO : []), ...(ehCeo ? MENU_CEO : [])];

  async function sair() {
    await supabaseNavegador().auth.signOut();
    window.location.href = '/login';
  }

  if (erro && !usuario) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <Image src="/logo.png" alt="DELLA" width={160} height={145} />
        <p className="max-w-md text-rose-300">{erro}</p>
        <button className="btn-principal" onClick={sair}>
          Voltar ao login
        </button>
      </div>
    );
  }
  if (carregando || !usuario) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Carregando texto="Carregando o estoque..." />
      </div>
    );
  }

  // sem estoque escolhido: primeiro escolhe o estoque (com a senha dele)
  if (!lojaAtual) return <EscolherEstoque />;

  const navegacao = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
      {itens.map(({ href, rotulo, icone: Icone }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setMenuAberto(false)}
          className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
            ativo(href) ? 'bg-dourado text-preto' : 'text-neutral-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          <Icone className="h-5 w-5 shrink-0" />
          {rotulo}
        </Link>
      ))}
    </nav>
  );

  const rodapeUsuario = (
    <div className="border-t border-borda p-3">
      <div className="mb-2 px-2">
        <div className="truncate text-sm font-semibold">{usuario.nome}</div>
        <div className="text-xs text-suave">{CARGOS[usuario.cargo]?.rotulo}</div>
      </div>
      <div className="flex gap-1">
        <button className="btn-fantasma flex-1 justify-start text-xs" onClick={() => setTrocarSenha(true)}>
          <KeyRound className="h-4 w-4" /> Senha
        </button>
        <button className="btn-fantasma flex-1 justify-start text-xs" onClick={sair}>
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Menu lateral (computador) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-borda bg-painel lg:flex">
        <Link href="/" className="flex flex-col items-center gap-1 border-b border-borda px-4 py-4">
          <Image src="/logo.png" alt="DELLA Distribuidora de Produtos" width={120} height={109} priority />
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-dourado">Controle de estoque</span>
        </Link>
        <div className="px-3 py-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-suave">Você está no estoque</div>
          <div className="mt-1">
            <LojaTag loja={lojaAtual} tamanho="lg" />
          </div>
        </div>
        {navegacao}
        {rodapeUsuario}
      </aside>

      {/* Barra superior (celular) */}
      <header className="sticky top-0 z-30 grid grid-cols-[44px_1fr_44px] items-center border-b border-borda bg-preto/95 px-3 py-2 backdrop-blur lg:hidden">
        <span />
        <Link href="/" className="flex justify-center" aria-label="DELLA — início">
          <Image src="/logo.png" alt="DELLA Distribuidora de Produtos" width={84} height={76} priority />
        </Link>
        <button className="btn-fantasma justify-self-end" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* Menu completo (celular) */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMenuAberto(false)} />
          <div className="absolute right-0 top-0 flex h-full w-72 flex-col border-l border-borda bg-painel">
            <div className="flex justify-center border-b border-borda py-4">
              <Image src="/logo.png" alt="DELLA" width={100} height={91} />
            </div>
            {navegacao}
            {rodapeUsuario}
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
        <div className="mx-auto max-w-6xl">
          {/* Faixa do estoque atual: sempre visível, para ninguém lançar no estoque errado */}
          <div
            className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 font-titulo text-sm font-bold uppercase tracking-wide"
            style={{ backgroundColor: lojaAtual.cor, color: corTexto(lojaAtual.cor) }}
          >
            <span>Estoque: {lojaAtual.nome}</span>
            <button
              onClick={() => setTrocarEstoque(true)}
              className="min-h-[38px] rounded-lg border border-current px-3 py-1.5 text-xs font-semibold normal-case opacity-90 hover:opacity-100"
            >
              Trocar de estoque
            </button>
          </div>
          {children}
        </div>
        <Rodape className="mt-6" />
      </main>
      {trocarEstoque && <EscolherEstoque aoCancelar={() => setTrocarEstoque(false)} />}

      {/* Barra inferior com botões grandes (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-borda bg-painel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {MENU_CELULAR.filter((m) => !m.perm || pode(m.perm)).map(({ href, rotulo, icone: Icone }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${ativo(href) ? 'text-dourado' : 'text-neutral-400'}`}
          >
            <Icone className="h-6 w-6" />
            {rotulo}
          </Link>
        ))}
        <button onClick={() => setMenuAberto(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-neutral-400">
          <Menu className="h-6 w-6" />
          Mais
        </button>
      </nav>

      <TrocarSenha aberto={trocarSenha} aoFechar={() => setTrocarSenha(false)} />
    </div>
  );
}

function TrocarSenha({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 6) return toast.error('A senha precisa ter pelo menos 6 caracteres.');
    if (senha !== confirma) return toast.error('As senhas não conferem.');
    setOcupado(true);
    const { error } = await supabaseNavegador().auth.updateUser({ password: senha });
    setOcupado(false);
    if (error) return toast.error(mensagemErro(error));
    toast.success('Senha alterada com sucesso!');
    setSenha('');
    setConfirma('');
    aoFechar();
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Alterar minha senha">
      <form onSubmit={salvar} className="space-y-3">
        <Campo rotulo="Nova senha" dica="Mínimo de 6 caracteres">
          <input type="password" className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Repita a nova senha">
          <input type="password" className="campo" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" />
        </Campo>
        <button className="btn-principal w-full" disabled={ocupado}>
          Salvar nova senha
        </button>
      </form>
    </Modal>
  );
}
