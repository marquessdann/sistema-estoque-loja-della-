'use client';

import { Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabaseNavegador } from '@/lib/supabase/client';
import { lerNumero } from '@/lib/formato';
import type { NotaForm } from '@/lib/tipos';
import { chaveNFeValida, cnpjValido, soDigitos } from '@/lib/validacao';
import { Campo } from './ui';

// Campos da nota fiscal (número, série, chave, fornecedor, valor, anexo...)

export function errosDaNota(n: NotaForm): Partial<Record<keyof NotaForm, string>> {
  const e: Partial<Record<keyof NotaForm, string>> = {};
  const algumPreenchido = Object.values(n).some((v) => v.trim() !== '');
  if (!algumPreenchido) return e;
  if (!n.numero.trim()) e.numero = 'Informe o número da nota';
  if (n.chave_acesso.trim()) {
    const limpa = n.chave_acesso.replace(/[^0-9A-Za-z]/g, '');
    if (limpa.length !== 44) e.chave_acesso = `A chave tem 44 dígitos (você digitou ${limpa.length})`;
    else if (!chaveNFeValida(limpa)) e.chave_acesso = 'Chave inválida: confira os dígitos';
  }
  if (n.fornecedor_cnpj.trim() && !cnpjValido(n.fornecedor_cnpj)) e.fornecedor_cnpj = 'CNPJ inválido';
  if (n.valor_total.trim() && lerNumero(n.valor_total) === null) e.valor_total = 'Valor inválido';
  return e;
}

export function NotaFiscalCampos({
  nota,
  aoMudar,
  anexo,
  aoMudarAnexo,
}: {
  nota: NotaForm;
  aoMudar: (n: NotaForm) => void;
  anexo: File | null;
  aoMudarAnexo: (f: File | null) => void;
}) {
  const erros = errosDaNota(nota);
  const set = (campo: keyof NotaForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    aoMudar({ ...nota, [campo]: e.target.value });

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
      <Campo rotulo="Número da nota" obrigatorio erro={erros.numero} className="col-span-1 sm:col-span-2">
        <input className="campo" inputMode="numeric" value={nota.numero} onChange={set('numero')} />
      </Campo>
      <Campo rotulo="Série" className="col-span-1">
        <input className="campo" inputMode="numeric" value={nota.serie} onChange={set('serie')} />
      </Campo>
      <Campo rotulo="Data de emissão" className="col-span-2 sm:col-span-3">
        <input type="date" className="campo" value={nota.data_emissao} onChange={set('data_emissao')} />
      </Campo>
      <Campo
        rotulo="Chave de acesso (44 dígitos)"
        erro={erros.chave_acesso}
        dica={nota.chave_acesso ? `${soDigitos(nota.chave_acesso).length}/44 dígitos` : 'Fica no DANFE, abaixo do código de barras'}
        className="col-span-2 sm:col-span-6"
      >
        <input
          className="campo tabular tracking-wider"
          inputMode="numeric"
          value={nota.chave_acesso}
          onChange={set('chave_acesso')}
          placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
        />
      </Campo>
      <Campo rotulo="Fornecedor (nome)" className="col-span-2 sm:col-span-4">
        <input className="campo" value={nota.fornecedor_nome} onChange={set('fornecedor_nome')} />
      </Campo>
      <Campo rotulo="CNPJ do fornecedor" erro={erros.fornecedor_cnpj} className="col-span-2 sm:col-span-2">
        <input className="campo tabular" value={nota.fornecedor_cnpj} onChange={set('fornecedor_cnpj')} placeholder="00.000.000/0000-00" />
      </Campo>
      <Campo rotulo="Valor total da nota (R$)" erro={erros.valor_total} className="col-span-2 sm:col-span-2">
        <input className="campo tabular" inputMode="decimal" value={nota.valor_total} onChange={set('valor_total')} placeholder="0,00" />
      </Campo>
      <Campo rotulo="CFOP" dica="Opcional" className="col-span-1 sm:col-span-1">
        <input className="campo" inputMode="numeric" value={nota.cfop} onChange={set('cfop')} />
      </Campo>
      <Campo rotulo="Natureza da operação" dica="Opcional" className="col-span-1 sm:col-span-3">
        <input className="campo" value={nota.natureza_operacao} onChange={set('natureza_operacao')} />
      </Campo>
      <div className="col-span-2 sm:col-span-6">
        <span className="rotulo">Anexo da nota (PDF ou XML) — opcional</span>
        {anexo ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-borda bg-painel2 px-3 py-2.5 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <Paperclip className="h-4 w-4 shrink-0 text-dourado" />
              <span className="truncate">{anexo.name}</span>
            </span>
            <button type="button" className="btn-fantasma" onClick={() => aoMudarAnexo(null)} aria-label="Remover anexo">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-borda px-3 py-3 text-sm text-suave hover:border-dourado/60">
            <Paperclip className="h-4 w-4" /> Escolher arquivo PDF ou XML
            <input
              type="file"
              accept=".pdf,.xml,application/pdf,text/xml,application/xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.size > 10 * 1024 * 1024) {
                  alert('Arquivo muito grande (máximo 10 MB).');
                  return;
                }
                aoMudarAnexo(f ?? null);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

// Envia o anexo para o armazenamento e devolve o caminho
export async function enviarAnexoNota(arquivo: File) {
  const sb = supabaseNavegador();
  const nomeSeguro = arquivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_');
  const caminho = `${new Date().getFullYear()}/${crypto.randomUUID()}-${nomeSeguro}`;
  const { error } = await sb.storage.from('notas').upload(caminho, arquivo, { upsert: false });
  if (error) throw new Error('Não foi possível enviar o anexo: ' + error.message);
  return { arquivo_path: caminho, arquivo_nome: arquivo.name };
}

// Monta o objeto da nota para enviar ao banco (ou null se não foi informada)
export function prepararNota(nota: NotaForm) {
  if (!nota.numero.trim()) return null;
  return {
    ...nota,
    chave_acesso: nota.chave_acesso.replace(/[^0-9A-Za-z]/g, ''),
    valor_total: lerNumero(nota.valor_total),
    data_emissao: nota.data_emissao || null,
  };
}

// Depois que o lançamento foi gravado, envia o anexo e liga à nota da operação.
// (Assim, se o lançamento for recusado, nenhum arquivo fica "solto".)
export async function anexarNaOperacao(operacaoId: number, anexo: File | null) {
  if (!anexo) return;
  const sb = supabaseNavegador();
  const { data: op } = await sb.from('operacoes').select('nota_fiscal_id').eq('id', operacaoId).single();
  if (!op?.nota_fiscal_id) return;
  try {
    const r = await enviarAnexoNota(anexo);
    const { error } = await sb.from('notas_fiscais').update(r).eq('id', op.nota_fiscal_id);
    if (error) throw error;
  } catch {
    toast.warning('O lançamento foi gravado, mas o anexo não foi enviado. Anexe de novo pela tela Notas fiscais.');
  }
}

// Igual ao anterior, para transferências
export async function anexarNaTransferencia(transferenciaId: number, anexo: File | null) {
  if (!anexo) return;
  const sb = supabaseNavegador();
  const { data: t } = await sb.from('transferencias').select('nota_fiscal_id').eq('id', transferenciaId).single();
  if (!t?.nota_fiscal_id) return;
  try {
    const r = await enviarAnexoNota(anexo);
    const { error } = await sb.from('notas_fiscais').update(r).eq('id', t.nota_fiscal_id);
    if (error) throw error;
  } catch {
    toast.warning('A transferência foi gravada, mas o anexo não foi enviado. Anexe de novo pela tela Notas fiscais.');
  }
}

// Abre o anexo de uma nota (link temporário e seguro)
export async function abrirAnexoNota(caminho: string) {
  const { data, error } = await supabaseNavegador().storage.from('notas').createSignedUrl(caminho, 120);
  if (error || !data) {
    alert('Não foi possível abrir o anexo.');
    return;
  }
  window.open(data.signedUrl, '_blank', 'noopener');
}
