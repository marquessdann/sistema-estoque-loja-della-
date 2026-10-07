import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServidor } from '@/lib/supabase/server';

// API de usuários: só o ADMINISTRADOR pode criar ou alterar usuários.
// Roda no servidor porque precisa da chave secreta (service_role).

const LIMITE_USUARIOS = 3;

// Só estas colunas de permissão podem ser alteradas (lista fechada: nada além disso passa)
const PERMISSOES = [
  'perm_produtos',
  'perm_entrada',
  'perm_saida',
  'perm_transferir',
  'perm_inventario',
  'perm_estornar',
  'perm_relatorios',
  'perm_historico',
] as const;

function lerPermissoes(entrada: unknown) {
  const saida: Record<string, boolean> = {};
  if (entrada && typeof entrada === 'object') {
    for (const k of PERMISSOES) {
      const v = (entrada as Record<string, unknown>)[k];
      if (typeof v === 'boolean') saida[k] = v;
    }
  }
  return saida;
}

async function exigirAdmin() {
  const sb = await supabaseServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('usuarios').select('id, nome, perfil, ativo').eq('id', user.id).maybeSingle();
  return data?.ativo && data.perfil === 'admin' ? data : null;
}

// Registra na auditoria quem (qual administrador) fez a alteração
async function auditar(eu: { id: string; nome: string }, acao: string, registroId: string, depois: object) {
  await supabaseAdmin().from('auditoria').insert({
    usuario_id: eu.id,
    usuario_nome: eu.nome,
    acao,
    tabela: 'usuarios',
    registro_id: registroId,
    depois,
  });
}

const erro = (mensagem: string, status = 400) => NextResponse.json({ erro: mensagem }, { status });

// Criar usuário
export async function POST(req: Request) {
  const eu = await exigirAdmin();
  if (!eu) return erro('Apenas o administrador pode cadastrar usuários.', 403);
  const { nome, email, senha, perfil, permissoes } = await req.json();
  if (!nome?.trim() || !email?.trim()) return erro('Informe nome e e-mail.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return erro('E-mail inválido.');
  if (!senha || String(senha).length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');

  const admin = supabaseAdmin();
  const { count } = await admin.from('usuarios').select('id', { count: 'exact', head: true }).eq('ativo', true);
  if ((count ?? 0) >= LIMITE_USUARIOS) {
    return erro(`Limite de ${LIMITE_USUARIOS} usuários atingido. Desative um usuário antes de cadastrar outro.`, 409);
  }

  // convite: o banco só aceita login novo que tenha convite do administrador
  const emailLimpo = String(email).trim().toLowerCase();
  await admin.from('usuarios_convites').upsert({ email: emailLimpo, criado_em: new Date().toISOString() });
  const { data, error } = await admin.auth.admin.createUser({
    email: emailLimpo,
    password: String(senha),
    email_confirm: true,
    user_metadata: { nome: String(nome).trim() },
  });
  if (error) {
    await admin.from('usuarios_convites').delete().eq('email', emailLimpo);
    if (/already been registered|already exists/i.test(error.message)) return erro('Já existe um usuário com este e-mail.');
    if (/Database error/i.test(error.message))
      return erro('O banco recusou o cadastro (limite de 3 usuários ativos ou e-mail já usado). Confira e tente de novo.');
    return erro(error.message);
  }
  // o banco cria o usuário como "operador"; aplica perfil e permissões escolhidos
  const ajustes = { ...lerPermissoes(permissoes), ...(perfil === 'admin' ? { perfil: 'admin' } : {}) };
  if (Object.keys(ajustes).length) {
    await admin.from('usuarios').update(ajustes).eq('id', data.user.id);
  }
  await auditar(eu, 'criou usuário', data.user.id, { nome, email, perfil: perfil === 'admin' ? 'admin' : 'operador' });
  return NextResponse.json({ ok: true });
}

// Alterar usuário (nome, perfil, ativo, senha)
export async function PATCH(req: Request) {
  const eu = await exigirAdmin();
  if (!eu) return erro('Apenas o administrador pode alterar usuários.', 403);
  const { id, nome, perfil, ativo, senha, permissoes } = await req.json();
  if (!id) return erro('Usuário não informado.');

  const admin = supabaseAdmin();
  const mudancas: Record<string, unknown> = { ...lerPermissoes(permissoes) };
  if (perfil && id === eu.id && perfil !== 'admin') return erro('Você não pode tirar o seu próprio acesso de administrador.');
  if (typeof nome === 'string' && nome.trim()) mudancas.nome = nome.trim();
  if (perfil === 'admin' || perfil === 'operador') mudancas.perfil = perfil;
  if (typeof ativo === 'boolean') {
    if (!ativo && id === eu.id) return erro('Você não pode desativar o seu próprio usuário.');
    mudancas.ativo = ativo;
  }
  if (Object.keys(mudancas).length) {
    // as regras do banco (limite de 3, sempre 1 admin) são verificadas aqui
    const { error } = await admin.from('usuarios').update(mudancas).eq('id', id);
    if (error) return erro(error.message);
  }

  const mudancasLogin: { password?: string; ban_duration?: string; user_metadata?: object } = {};
  if (senha) {
    if (String(senha).length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');
    mudancasLogin.password = String(senha);
  }
  // usuário desativado fica bloqueado no login
  if (typeof ativo === 'boolean') mudancasLogin.ban_duration = ativo ? 'none' : '876000h';
  if (mudancas.nome) mudancasLogin.user_metadata = { nome: mudancas.nome };
  if (Object.keys(mudancasLogin).length) {
    const { error } = await admin.auth.admin.updateUserById(id, mudancasLogin);
    if (error) return erro(error.message);
  }
  await auditar(eu, 'alterou usuário', id, { ...mudancas, ...(senha ? { senha: 'trocada' } : {}) });
  return NextResponse.json({ ok: true });
}
