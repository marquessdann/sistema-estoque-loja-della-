// Transforma erros técnicos em mensagens claras em português.
export function mensagemErro(e: unknown): string {
  const msg =
    typeof e === 'string'
      ? e
      : e && typeof e === 'object' && 'message' in e
        ? String((e as { message: unknown }).message)
        : 'Erro desconhecido.';

  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg))
    return 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
  if (/JWT expired|invalid JWT|not authenticated/i.test(msg))
    return 'Sua sessão expirou. Saia e entre novamente.';
  if (/permission denied|row-level security/i.test(msg))
    return 'Você não tem permissão para fazer isso.';
  if (/duplicate key.*sku/i.test(msg)) return 'Já existe um produto com este SKU.';
  if (/duplicate key/i.test(msg)) return 'Este registro já existe.';
  if (/violates foreign key/i.test(msg))
    return 'Não é possível excluir: este registro está sendo usado em outro lugar.';
  if (/produto_loja_saldo_check|saldo_apos_check/i.test(msg))
    return 'Operação bloqueada: o saldo ficaria negativo.';
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  return msg;
}
