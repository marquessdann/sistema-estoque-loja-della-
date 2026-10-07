'use client';

import { ArrowLeft, ArrowRight, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LojaTag } from '@/components/loja';
import { StatusBadge } from '@/components/status-transferencia';
import { Campo, Carregando, Confirmar, Titulo, Vazio } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { dataHora, numero } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Transferencia, TransferenciaItem } from '@/lib/tipos';

export default function DetalheTransferencia() {
  const { id } = useParams<{ id: string }>();
  const { versao, pode, recarregar, lojaAtual } = useDados();
  const [t, setT] = useState<Transferencia | null | undefined>(undefined);
  const [itens, setItens] = useState<TransferenciaItem[]>([]);
  const [estornar, setEstornar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const sb = supabaseNavegador();
    const [a, b] = await Promise.all([
      sb.from('vw_transferencias').select('*').eq('id', Number(id)).maybeSingle(),
      sb.from('vw_transferencia_itens').select('*').eq('transferencia_id', Number(id)).order('produto_nome'),
    ]);
    setT(a.data as Transferencia | null);
    setItens((b.data ?? []) as TransferenciaItem[]);
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  if (t === undefined) return <Carregando />;
  if (t === null) return <Vazio>Transferência não encontrada.</Vazio>;

  async function confirmarEstorno() {
    if (!t) return;
    if (!motivo.trim()) return toast.error('Informe o motivo do estorno.');
    setOcupado(true);
    const { error } = await supabaseNavegador().rpc('estornar_transferencia', { p_id: t.id, p_motivo: motivo.trim() });
    setOcupado(false);
    if (error) return toast.error(mensagemErro(error), { duration: 10000 });
    toast.success('Transferência estornada: as quantidades voltaram para a origem.');
    setEstornar(false);
    setMotivo('');
    await Promise.all([carregar(), recarregar()]);
  }

  return (
    <div className="space-y-4">
      <Link href="/transferencias" className="inline-flex items-center gap-1 text-sm text-suave hover:text-dourado">
        <ArrowLeft className="h-4 w-4" /> Histórico de transferências
      </Link>
      <Titulo sub={t.observacao ?? undefined} acoes={<StatusBadge status={t.status} />}>
        Transferência nº {t.id}
      </Titulo>

      <div className="cartao space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <LojaTag loja={{ nome: t.origem_nome, cor: t.origem_cor }} tamanho="lg" />
          <ArrowRight className="h-5 w-5 text-dourado" />
          <LojaTag loja={{ nome: t.destino_nome, cor: t.destino_cor }} tamanho="lg" />
        </div>
        <p className="text-sm text-suave">
          Feita por <b className="text-white">{t.usuario_nome}</b> em {dataHora(t.criado_em)} · {t.qtd_produtos} produto(s),{' '}
          {numero(t.total_unidades)} unidade(s){t.nf_numero && ` · NF ${t.nf_numero}`}
        </p>
        {t.status === 'estornada' && (
          <p className="text-sm text-rose-300">
            Estornada por {t.estornado_por_nome} em {dataHora(t.estornado_em)} — {t.motivo_estorno}
          </p>
        )}
      </div>

      <div className="cartao p-0 sm:p-0">
        <table className="tabela">
          <thead>
            <tr>
              <th>Produto</th>
              <th className="text-right">Quantidade</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.produto_id}>
                <td>
                  <Link href={`/produtos/${i.produto_id}`} className="font-medium hover:text-dourado">
                    {i.produto_nome}
                  </Link>
                  <div className="text-xs text-suave">SKU {i.sku}</div>
                </td>
                <td className="tabular text-right font-semibold">
                  {i.quantidade} {i.unidade}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {t.status === 'concluida' && pode('estornar') && lojaAtual?.id !== t.loja_destino_id && (
        <p className="text-right text-xs text-suave">Para estornar, entre no estoque {t.destino_nome} (de onde a mercadoria vai sair).</p>
      )}
      {t.status === 'concluida' && pode('estornar') && lojaAtual?.id === t.loja_destino_id && (
        <div className="flex justify-end">
          <button className="btn-secundario text-orange-300" onClick={() => setEstornar(true)}>
            <Undo2 className="h-4 w-4" /> Estornar (desfazer) esta transferência
          </button>
        </div>
      )}

      <Confirmar
        aberto={estornar}
        titulo="Estornar transferência?"
        textoConfirmar="Sim, estornar"
        perigo
        ocupado={ocupado}
        aoCancelar={() => setEstornar(false)}
        aoConfirmar={confirmarEstorno}
      >
        <p>
          As quantidades voltam de <b>{t.destino_nome}</b> para <b>{t.origem_nome}</b>. O registro original continua no histórico.
        </p>
        <Campo rotulo="Motivo do estorno" obrigatorio>
          <input className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </Campo>
      </Confirmar>
    </div>
  );
}
