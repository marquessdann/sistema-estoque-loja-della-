import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseServidor } from '@/lib/supabase/server';

// API de usuários: só o CEO pode criar ou alterar usuários.
// Roda no servidor porque precisa da chave secreta (service_role).
// Não existem caixinhas de permissão: cada pessoa tem um CARGO fixo
// (gerente ou funcionário; o CEO é único e não pode ser trocado por aqui).

const LIMITE_USUARIOS = 3;
const CARGOS_EDITAVEIS = ['gerente', 'funcionario'] as const;
const cargoValido = (c: unknown): c is (typeof CARGOS_EDITAVEIS)[number] =>
  typeof c === 'string' && (CARGOS_EDITAVEIS as readonly string[]).includes(c);

async function exigirCeo() {
  const sb = await supabaseServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('usuarios').select('id, nome, cargo, ativo').eq('id', user.id).maybeSingle();
  return data?.ativo && data.cargo === 'ceo' ? data : null;
}

// Registra na auditoria quem fez a alteração
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
  const eu = await exigirCeo();
  if (!eu) return erro('Apenas o CEO pode cadastrar usuários.', 403);
  const { nome, email, senha, cargo } = await req.json();
  if (cargo !== undefined && !cargoValido(cargo)) return erro('Cargo inválido: escolha Gerente ou Funcionário.');
  if (!nome?.trim() || !email?.trim()) return erro('Informe nome e e-mail.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return erro('E-mail inválido.');
  if (!senha || String(senha).length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');

  const admin = supabaseAdmin();
  const { count } = await admin.from('usuarios').select('id', { count: 'exact', head: true }).eq('ativo', true);
  if ((count ?? 0) >= LIMITE_USUARIOS) {
    return erro(`Limite de ${LIMITE_USUARIOS} usuários atingido. Desative um usuário antes de cadastrar outro.`, 409);
  }

  // convite: o banco só aceita login novo que tenha convite do CEO
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
  // o banco cria o usuário como "funcionário"; aplica o cargo escolhido
  const cargoFinal = cargoValido(cargo) ? cargo : 'funcionario';
  if (cargoFinal !== 'funcionario') await admin.from('usuarios').update({ cargo: cargoFinal }).eq('id', data.user.id);
  await auditar(eu, 'criou usuário', data.user.id, { nome, email, cargo: cargoFinal });
  return NextResponse.json({ ok: true });
}

// Alterar usuário (nome, cargo, ativo, senha)
export async function PATCH(req: Request) {
  const eu = await exigirCeo();
  if (!eu) return erro('Apenas o CEO pode alterar usuários.', 403);
  const { id, nome, cargo, ativo, senha } = await req.json();
  if (!id) return erro('Usuário não informado.');

  const admin = supabaseAdmin();
  const mudancas: Record<string, unknown> = {};
  if (cargo !== undefined) {
    if (id === eu.id) return erro('O CEO não pode mudar o próprio cargo.');
    if (!cargoValido(cargo)) return erro('Cargo inválido: escolha Gerente ou Funcionário.');
    mudancas.cargo = cargo;
  }
  if (typeof nome === 'string' && nome.trim()) mudancas.nome = nome.trim();
  if (typeof ativo === 'boolean') {
    if (!ativo && id === eu.id) return erro('Você não pode desativar o seu próprio usuário.');
    mudancas.ativo = ativo;
  }
  if (Object.keys(mudancas).length) {
    // as regras do banco (limite de 3, sempre 1 CEO) são verificadas aqui
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
