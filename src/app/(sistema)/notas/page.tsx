'use client';

import { Paperclip, Search, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { abrirAnexoNota, enviarAnexoNota } from '@/components/nota-fiscal';
import { DetalheOperacao, LinhaOperacao } from '@/components/operacoes';
import { Carregando, Modal, Titulo, Vazio } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { data, dataHora, moeda } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { NotaFiscal, OperacaoResumo } from '@/lib/tipos';
import { formatarChave, formatarCNPJ } from '@/lib/validacao';

export default function Notas() {
  const { versao } = useDados();
  const [termo, setTermo] = useState('');
  const [lista, setLista] = useState<NotaFiscal[] | null>(null);
  const [aberta, setAberta] = useState<NotaFiscal | null>(null);

  const buscar = useCallback(async () => {
    let q = supabaseNavegador().from('vw_notas').select('*').order('criado_em', { ascending: false }).limit(200);
    const t = termo.trim().replace(/[%_,()]/g, '');
    if (t) {
      const digitos = t.replace(/\D/g, '');
      const filtros = [`numero.ilike.%${t}%`, `fornecedor_nome.ilike.%${t}%`];
      if (digitos.length >= 6) filtros.push(`chave_acesso.ilike.%${digitos}%`, `fornecedor_cnpj.ilike.%${digitos}%`);
      q = q.or(filtros.join(','));
    }
    const { data: d, error } = await q;
    if (error) toast.error(mensagemErro(error));
    setLista((d ?? []) as NotaFiscal[]);
  }, [termo]);

  useEffect(() => {
    const t = setTimeout(buscar, 250);
    return () => clearTimeout(t);
  }, [buscar, versao]);

  return (
    <div className="space-y-4">
      <Titulo sub="Notas fiscais informadas nas entradas, saídas e transferências.">Notas fiscais</Titulo>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" />
        <input
          className="campo h-12 pl-10"
          placeholder="Buscar por número, fornecedor, CNPJ ou chave de acesso..."
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
        />
      </div>

      {!lista ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <Vazio>Nenhuma nota fiscal encontrada.</Vazio>
      ) : (
        <div className="cartao overflow-x-auto p-0 sm:p-0">
          <table className="tabela">
            <thead>
              <tr>
                <th>Número</th>
                <th>Emissão</th>
                <th>Fornecedor</th>
                <th className="text-right">Valor</th>
                <th>Anexo</th>
                <th>Lançada em</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((n) => (
                <tr key={n.id} className="cursor-pointer" onClick={() => setAberta(n)}>
                  <td className="font-semibold text-dourado">
                    {n.numero}
                    {n.serie && <span className="text-xs text-suave"> / {n.serie}</span>}
                  </td>
                  <td className="whitespace-nowrap">{data(n.data_emissao)}</td>
                  <td>{n.fornecedor_nome ?? '—'}</td>
                  <td className="tabular text-right">{n.valor_total != null ? moeda(n.valor_total) : '—'}</td>
                  <td>{n.arquivo_path ? <Paperclip className="h-4 w-4 text-dourado" /> : ''}</td>
                  <td className="whitespace-nowrap text-xs text-suave">
                    {dataHora(n.criado_em)} · {n.criado_por_nome}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetalheNota nota={aberta} aoFechar={() => setAberta(null)} aoAlterar={buscar} />
    </div>
  );
}

function DetalheNota({ nota, aoFechar, aoAlterar }: { nota: NotaFiscal | null; aoFechar: () => void; aoAlterar: () => void }) {
  const [ops, setOps] = useState<OperacaoResumo[]>([]);
  const [opAberta, setOpAberta] = useState<number | null>(null);
  const [anexo, setAnexo] = useState<{ path: string; nome: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!nota) return;
    setAnexo(nota.arquivo_path ? { path: nota.arquivo_path, nome: nota.arquivo_nome ?? 'anexo' } : null);
    supabaseNavegador()
      .from('vw_operacoes')
      .select('*')
      .eq('nota_fiscal_id', nota.id)
      .order('criado_em')
      .then(({ data: d }) => setOps((d ?? []) as OperacaoResumo[]));
  }, [nota]);

  async function anexar(arquivo: File) {
    if (!nota) return;
    setEnviando(true);
    try {
      const r = await enviarAnexoNota(arquivo);
      const { error } = await supabaseNavegador().from('notas_fiscais').update(r).eq('id', nota.id);
      if (error) throw error;
      setAnexo({ path: r.arquivo_path, nome: r.arquivo_nome });
      toast.success('Anexo salvo!');
      aoAlterar();
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal aberto={!!nota} aoFechar={aoFechar} titulo={nota ? `Nota fiscal nº ${nota.numero}` : ''} largura="max-w-2xl">
      {nota && (
        <div className="space-y-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <span>Série: {nota.serie ?? '—'}</span>
            <span>Emissão: {data(nota.data_emissao) || '—'}</span>
            <span className="sm:col-span-2">
              Fornecedor: {nota.fornecedor_nome ?? '—'} {nota.fornecedor_cnpj && `· CNPJ ${formatarCNPJ(nota.fornecedor_cnpj)}`}
            </span>
            <span>Valor total: {nota.valor_total != null ? moeda(nota.valor_total) : '—'}</span>
            <span>CFOP: {nota.cfop ?? '—'}</span>
            {nota.natureza_operacao && <span className="sm:col-span-2">Natureza: {nota.natureza_operacao}</span>}
            {nota.chave_acesso && <span className="tabular sm:col-span-2">Chave: {formatarChave(nota.chave_acesso)}</span>}
          </div>

          <div className="flex flex-wrap gap-2">
            {anexo && (
              <button className="btn-secundario" onClick={() => abrirAnexoNota(anexo.path)}>
                <Paperclip className="h-4 w-4" /> Abrir {anexo.nome}
              </button>
            )}
            <label className={`btn-secundario cursor-pointer ${enviando ? 'opacity-50' : ''}`}>
              <Upload className="h-4 w-4" /> {anexo ? 'Trocar anexo' : 'Anexar PDF/XML'}
              <input
                type="file"
                accept=".pdf,.xml"
                className="hidden"
                disabled={enviando}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) anexar(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div>
            <h3 className="mb-2 font-semibold">Lançamentos desta nota</h3>
            <div className="rounded-xl border border-borda">
              {ops.length === 0 ? (
                <p className="p-3 text-suave">Nenhum lançamento.</p>
              ) : (
                ops.map((op) => <LinhaOperacao key={op.id} op={op} aoAbrir={() => setOpAberta(op.id)} />)
              )}
            </div>
          </div>
        </div>
      )}
      <DetalheOperacao id={opAberta} aoFechar={() => setOpAberta(null)} />
    </Modal>
  );
}
