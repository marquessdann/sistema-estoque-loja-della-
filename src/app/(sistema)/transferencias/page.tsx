'use client';

import { ArrowLeftRight, ArrowRight, FileDown, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LojaTag } from '@/components/loja';
import { StatusBadge } from '@/components/status-transferencia';
import { Campo, Carregando, Titulo, Vazio } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { exportarExcel, exportarPDF, type Coluna } from '@/lib/exportar';
import { dataHora, fimDoDia, hojeISO, inicioDoDia, numero, STATUS_TRANSF } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Transferencia } from '@/lib/tipos';

export default function Transferencias() {
  const { versao, pode, lojaAtual } = useDados();
  const [de, setDe] = useState(hojeISO(-30));
  const [ate, setAte] = useState(hojeISO());
  // transferências que saíram ou entraram neste estoque
  const lojaId = lojaAtual?.id ?? '';
  const [lista, setLista] = useState<Transferencia[] | null>(null);
  const [limite, setLimite] = useState(100);

  useEffect(() => {
    let q = supabaseNavegador().from('vw_transferencias').select('*').order('criado_em', { ascending: false }).limit(limite);
    if (de) q = q.gte('criado_em', inicioDoDia(de));
    if (ate) q = q.lte('criado_em', fimDoDia(ate));
    if (lojaId) q = q.or(`loja_origem_id.eq.${lojaId},loja_destino_id.eq.${lojaId}`);
    q.then(({ data, error }) => {
      if (error) toast.error(mensagemErro(error));
      setLista((data ?? []) as Transferencia[]);
    });
  }, [de, ate, lojaId, versao, limite]);

  const colunas: Coluna<Transferencia>[] = [
    { titulo: 'Nº', valor: (t) => t.id, formato: 'inteiro', largura: 7 },
    { titulo: 'Data/hora', valor: (t) => dataHora(t.criado_em), largura: 17 },
    { titulo: 'Origem', valor: (t) => t.origem_nome, largura: 15 },
    { titulo: 'Destino', valor: (t) => t.destino_nome, largura: 15 },
    { titulo: 'Produtos', valor: (t) => t.qtd_produtos, formato: 'inteiro', largura: 9 },
    { titulo: 'Unidades', valor: (t) => t.total_unidades, formato: 'inteiro', largura: 9 },
    { titulo: 'Feita por', valor: (t) => t.usuario_nome, largura: 18 },
    { titulo: 'Situação', valor: (t) => STATUS_TRANSF[t.status].rotulo, largura: 11 },
  ];
  function exportar(f: 'xlsx' | 'pdf') {
    if (!lista?.length) return toast.error('Nada para exportar.');
    if (f === 'xlsx') exportarExcel('transferencias', [{ nome: 'Transferências', colunas, linhas: lista }]);
    else exportarPDF('transferencias', 'Transferências entre lojas', `${de || 'início'} a ${ate || 'hoje'}`, colunas, lista);
  }

  return (
    <div className="space-y-4">
      <Titulo
        sub="Transferências que saíram ou entraram neste estoque, com quem fez e quando."
        acoes={
          pode('transferir') && (
            <Link href="/transferencia" className="btn-azul">
              <ArrowLeftRight className="h-4 w-4" /> Nova transferência
            </Link>
          )
        }
      >
        Histórico de transferências
      </Titulo>

      <div className="cartao grid grid-cols-2 gap-3 md:grid-cols-4">
        <Campo rotulo="De">
          <input type="date" className="campo" value={de} onChange={(e) => setDe(e.target.value)} />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" className="campo" value={ate} onChange={(e) => setAte(e.target.value)} />
        </Campo>
        <div className="col-span-2 md:col-span-1">
          <span className="rotulo">Estoque</span>
          <LojaTag loja={lojaAtual} />
        </div>
        <div className="col-span-2 flex items-end gap-2 md:col-span-1">
          <button className="btn-secundario flex-1" onClick={() => exportar('xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </button>
          <button className="btn-secundario flex-1" onClick={() => exportar('pdf')}>
            <FileDown className="h-4 w-4" /> PDF
          </button>
        </div>
      </div>

      {!lista ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <Vazio>Nenhuma transferência no período.</Vazio>
      ) : (
        <div className="cartao p-0 sm:p-0">
          {lista.map((t) => (
            <Link
              key={t.id}
              href={`/transferencias/${t.id}`}
              className="flex flex-col gap-1.5 border-b border-borda/60 px-3 py-3 transition last:border-0 hover:bg-white/[0.03] sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex items-center gap-2 sm:w-56 sm:shrink-0">
                <span className="text-sm font-semibold text-dourado">nº {t.id}</span>
                <StatusBadge status={t.status} />
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${t.loja_origem_id === lojaAtual?.id ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                  {t.loja_origem_id === lojaAtual?.id ? 'Saiu daqui' : 'Entrou aqui'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1 text-sm">
                  <LojaTag loja={{ nome: t.origem_nome, cor: t.origem_cor }} tamanho="sm" />
                  <ArrowRight className="h-3 w-3 text-suave" />
                  <LojaTag loja={{ nome: t.destino_nome, cor: t.destino_cor }} tamanho="sm" />
                  <span className="ml-1 text-neutral-300">
                    {t.qtd_produtos} produto(s), {numero(t.total_unidades)} un.
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-suave">
                  {dataHora(t.criado_em)} · {t.usuario_nome}
                  {t.observacao && ` · ${t.observacao}`}
                </div>
              </div>
            </Link>
          ))}
          {lista.length >= limite && (
            <div className="p-3 text-center">
              <button className="btn-secundario" onClick={() => setLimite(limite + 100)}>
                Carregar mais
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
