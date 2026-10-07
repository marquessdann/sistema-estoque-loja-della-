import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServidor } from '@/lib/supabase/server';

// API de usuários: só o ADMINISTRADOR pode criar ou alterar usuários.
// Roda no servidor porque precisa da chave secreta (service_role).

const LIMITE_USUARIOS = 3;

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
  const { nome, email, senha, perfil } = await req.json();
  if (!nome?.trim() || !email?.trim()) return erro('Informe nome e e-mail.');
  if (!senha || String(senha).length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');

  const admin = supabaseAdmin();
  const { count } = await admin.from('usuarios').select('id', { count: 'exact', head: true }).eq('ativo', true);
  if ((count ?? 0) >= LIMITE_USUARIOS) {
    return erro(`Limite de ${LIMITE_USUARIOS} usuários atingido. Desative um usuário antes de cadastrar outro.`, 409);
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password: String(senha),
    email_confirm: true,
    user_metadata: { nome: String(nome).trim() },
  });
  if (error) {
    if (/already been registered|already exists/i.test(error.message)) return erro('Já existe um usuário com este e-mail.');
    if (/Database error/i.test(error.message)) return erro('Não foi possível criar: limite de 3 usuários atingido.');
    return erro(error.message);
  }
  // o banco cria o usuário como "operador"; se pediu admin, ajusta
  if (perfil === 'admin') {
    await admin.from('usuarios').update({ perfil: 'admin' }).eq('id', data.user.id);
  }
  await auditar(eu, 'criou usuário', data.user.id, { nome, email, perfil: perfil === 'admin' ? 'admin' : 'operador' });
  return NextResponse.json({ ok: true });
}

// Alterar usuário (nome, perfil, ativo, senha)
export async function PATCH(req: Request) {
  const eu = await exigirAdmin();
  if (!eu) return erro('Apenas o administrador pode alterar usuários.', 403);
  const { id, nome, perfil, ativo, senha } = await req.json();
  if (!id) return erro('Usuário não informado.');

  const admin = supabaseAdmin();
  const mudancas: Record<string, unknown> = {};
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
