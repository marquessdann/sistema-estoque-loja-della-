// Login por USUÁRIO (ex.: daniel, vinicius, antonio.gv).
// O Supabase exige e-mail, então por dentro cada usuário vira "usuario@della.local".
// Quem preferir pode continuar entrando com um e-mail de verdade.
export const DOMINIO_LOGIN = 'della.local';
export const SENHA_MINIMA = 6;

export const paraEmail = (usuario: string) => {
  const t = usuario.trim().toLowerCase();
  return t.includes('@') ? t : `${t}@${DOMINIO_LOGIN}`;
};

/** "antonio.gv@della.local" -> "antonio.gv"; e-mail de verdade fica como está */
export const nomeDeLogin = (email: string | null | undefined) =>
  email?.endsWith(`@${DOMINIO_LOGIN}`) ? email.slice(0, -(DOMINIO_LOGIN.length + 1)) : (email ?? '');

export const loginValido = (usuario: string) => /^[a-z0-9][a-z0-9._-]{1,29}$/.test(usuario.trim().toLowerCase());
