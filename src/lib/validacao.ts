// Validações de documentos (as mesmas regras existem no banco de dados).

export const soDigitos = (t: string) => t.replace(/\D/g, '');
const limpar = (t: string) => t.toUpperCase().replace(/[^0-9A-Z]/g, '');

// Chave de acesso da NF-e: 44 posições e dígito verificador (módulo 11)
export function chaveNFeValida(chave: string) {
  const v = limpar(chave);
  if (!/^[0-9]{6}[0-9A-Z]{14}[0-9]{24}$/.test(v)) return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += (v.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  let dv = 11 - (soma % 11);
  if (dv >= 10) dv = 0;
  return Number(v[43]) === dv;
}

// CNPJ numérico ou alfanumérico (novo formato a partir de 2026)
export function cnpjValido(cnpj: string) {
  const v = limpar(cnpj);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(v) || /^(.)\1{13}$/.test(v)) return false;
  const calc = (base: string, pesos: number[]) => {
    const soma = base.split('').reduce((s, c, i) => s + (c.charCodeAt(0) - 48) * pesos[i], 0);
    return soma % 11 < 2 ? 0 : 11 - (soma % 11);
  };
  const d1 = calc(v.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(v.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(v[12]) === d1 && Number(v[13]) === d2;
}

export function formatarCNPJ(cnpj: string | null | undefined) {
  const v = limpar(cnpj ?? '');
  if (v.length !== 14) return cnpj ?? '';
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
}

export function formatarChave(chave: string | null | undefined) {
  const v = limpar(chave ?? '');
  return v.replace(/(.{4})/g, '$1 ').trim();
}
