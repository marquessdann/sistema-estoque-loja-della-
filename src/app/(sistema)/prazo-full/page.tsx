'use client';

import { AlarmClock, Bell, CheckCircle2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { COR_NIVEL, Contagem, useAgora } from '@/components/prazo-full';
import { Campo, Carregando, Confirmar, Modal, Titulo, Vazio } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { agoraLocal, dataHora } from '@/lib/formato';
import { AVISOS_CRITICOS, fimDoLote, fraseDoLote, nivel } from '@/lib/prazo-full';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { LoteFull } from '@/lib/tipos';

const ROTULO_NIVEL = {
  ok: 'No prazo',
  atencao: 'Atenção',
  critico: 'Crítico',
  vencido: 'Vencido',
  encerrado: 'Encerrado',
};

// "2026-10-16T10:00:00-03:00" -> "2026-10-16T10:00" (campo data e hora, no horário do aparelho)
const paraCampo = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function PrazoFull() {
  const { ehCeo, versao } = useDados();
  const [lotes, setLotes] = useState<LoteFull[] | null>(null);
  const [editando, setEditando] = useState<Partial<LoteFull> | null>(null);
  const [excluir, setExcluir] = useState<LoteFull | null>(null);
  const [previa, setPrevia] = useState<LoteFull | null>(null);
  const agora = useAgora();

  const buscar = useCallback(async () => {
    const { data, error } = await supabaseNavegador().from('lotes_full').select('*').order('inicio', { ascending: false });
    if (error) toast.error(mensagemErro(error));
    setLotes((data ?? []) as LoteFull[]);
  }, []);
  useEffect(() => {
    buscar();
  }, [buscar, versao]);

  async function rpc(nome: string, params: object, ok: string) {
    const { error } = await supabaseNavegador().rpc(nome, params);
    if (error) return (toast.error(mensagemErro(error)), false);
    toast.success(ok);
    buscar();
    return true;
  }

  const ativos = (lotes ?? []).filter((l) => !l.encerrado_em).sort((a, b) => fimDoLote(a).getTime() - fimDoLote(b).getTime());
  const encerrados = (lotes ?? []).filter((l) => l.encerrado_em);

  return (
    <div className="space-y-4">
      <Titulo
        sub={`Cada envio para o FULL tem ${60} dias para vender antes de pagar armazenagem. Todos recebem aviso toda segunda-feira, a cada 15 dias e faltando ${AVISOS_CRITICOS.join(', ')} dia(s).`}
        acoes={
          ehCeo && (
            <button className="btn-principal" onClick={() => setEditando({ nome: '', inicio: undefined, dias: 60 })}>
              <Plus className="h-4 w-4" /> Novo lote
            </button>
          )
        }
      >
        Prazo FULL
      </Titulo>

      {!lotes ? (
        <Carregando />
      ) : ativos.length === 0 ? (
        <Vazio>Nenhum lote em andamento no FULL.</Vazio>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ativos.map((l) => {
            const n = nivel(l, agora);
            return (
              <div key={l.id} className={`rounded-2xl border p-4 ${COR_NIVEL[n]}`}>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-titulo text-lg font-bold text-white">{l.nome}</div>
                    <div className="text-xs">
                      Início {dataHora(l.inicio)} · vence {dataHora(fimDoLote(l).toISOString())} · {l.dias} dias
                    </div>
                  </div>
                  <span className="rounded-full border border-current px-2 py-0.5 text-[11px] font-bold uppercase">
                    {ROTULO_NIVEL[n]}
                  </span>
                </div>
                <p className="my-3 text-sm text-white">{fraseDoLote(l, agora)}</p>
                <Contagem lote={l} agora={agora} grande />
                {l.observacao && <p className="mt-3 text-xs text-neutral-300">{l.observacao}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn-fantasma text-xs" onClick={() => setPrevia(l)}>
                    <Bell className="h-4 w-4" /> Ver como fica o aviso
                  </button>
                  {ehCeo && (
                    <>
                      <button className="btn-fantasma text-xs" onClick={() => setEditando(l)}>
                        <Pencil className="h-4 w-4" /> Editar
                      </button>
                      <button
                        className="btn-fantasma text-xs"
                        onClick={() =>
                          rpc('salvar_lote_full', { p: { id: l.id, encerrar: true } }, 'Lote encerrado: não avisa mais.')
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" /> Encerrar (vendeu / retirou)
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {encerrados.length > 0 && (
        <div className="cartao overflow-x-auto p-0 sm:p-0">
          <div className="px-4 pt-4 text-sm font-semibold text-suave">Lotes encerrados</div>
          <table className="tabela">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Início</th>
                <th>Vencimento</th>
                <th>Encerrado em</th>
                {ehCeo && <th />}
              </tr>
            </thead>
            <tbody>
              {encerrados.map((l) => (
                <tr key={l.id}>
                  <td className="font-semibold">{l.nome}</td>
                  <td className="whitespace-nowrap">{dataHora(l.inicio)}</td>
                  <td className="whitespace-nowrap">{dataHora(fimDoLote(l).toISOString())}</td>
                  <td className="whitespace-nowrap">{dataHora(l.encerrado_em)}</td>
                  {ehCeo && (
                    <td className="whitespace-nowrap text-right">
                      <button
                        className="btn-fantasma text-xs"
                        onClick={() => rpc('salvar_lote_full', { p: { id: l.id, encerrar: false } }, 'Lote reaberto.')}
                      >
                        <RotateCcw className="h-4 w-4" /> Reabrir
                      </button>
                      <button className="btn-fantasma text-xs text-rose-300" onClick={() => setExcluir(l)}>
                        <Trash2 className="h-4 w-4" /> Excluir
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormLote
          lote={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={async (p) =>
            (await rpc('salvar_lote_full', { p }, editando.id ? 'Lote alterado.' : 'Lote criado.')) && setEditando(null)
          }
          aoExcluir={editando.id ? () => (setExcluir(editando as LoteFull), setEditando(null)) : undefined}
        />
      )}

      <Confirmar
        aberto={!!excluir}
        titulo="Excluir lote"
        perigo
        textoConfirmar="Excluir"
        aoCancelar={() => setExcluir(null)}
        aoConfirmar={async () => (await rpc('excluir_lote_full', { p_id: excluir!.id }, 'Lote excluído.')) && setExcluir(null)}
      >
        Excluir o lote <b>{excluir?.nome}</b>? Use só se foi criado por engano. Se a mercadoria foi vendida ou retirada, prefira
        &quot;Encerrar&quot;.
      </Confirmar>

      <Modal
        aberto={!!previa}
        aoFechar={() => setPrevia(null)}
        titulo={
          <span className="flex items-center gap-2 text-dourado">
            <AlarmClock className="h-5 w-5" /> Prazo do Mercado Livre FULL
          </span>
        }
      >
        {previa && (
          <div className={`rounded-xl border p-3 ${COR_NIVEL[nivel(previa, agora) === 'ok' ? 'atencao' : nivel(previa, agora)]}`}>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide">Prévia do aviso · {previa.nome}</div>
            <p className="mb-3 text-sm text-white">{fraseDoLote(previa, agora)}</p>
            <Contagem lote={previa} agora={agora} />
          </div>
        )}
        <p className="mt-3 text-xs text-suave">
          É assim que o aviso aparece em qualquer tela do sistema, para todos os usuários.
        </p>
        <div className="mt-4 flex justify-end">
          <button className="btn-principal" onClick={() => setPrevia(null)}>
            Ok, vi
          </button>
        </div>
      </Modal>
    </div>
  );
}

function FormLote({
  lote,
  aoFechar,
  aoSalvar,
  aoExcluir,
}: {
  lote: Partial<LoteFull>;
  aoFechar: () => void;
  aoSalvar: (p: object) => Promise<unknown>;
  aoExcluir?: () => void;
}) {
  const [nome, setNome] = useState(lote.nome ?? '');
  const [inicio, setInicio] = useState(lote.inicio ? paraCampo(lote.inicio) : agoraLocal());
  const [dias, setDias] = useState(String(lote.dias ?? 60));
  const [obs, setObs] = useState(lote.observacao ?? '');
  const [ocupado, setOcupado] = useState(false);

  const fim = inicio && Number(dias) > 0 ? new Date(new Date(inicio).getTime() + Number(dias) * 86_400_000) : null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return toast.error('Dê um nome ao lote (ex.: Envio 16/10).');
    if (!inicio) return toast.error('Informe a data e a hora de início.');
    setOcupado(true);
    await aoSalvar({
      id: lote.id,
      nome,
      inicio: new Date(inicio).toISOString(),
      dias: Number(dias),
      observacao: obs,
    });
    setOcupado(false);
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={lote.id ? 'Editar lote do FULL' : 'Novo lote do FULL'}>
      <form onSubmit={salvar} className="space-y-3">
        <Campo rotulo="Nome do lote" obrigatorio>
          <input
            className="campo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Envio 16/10"
            maxLength={80}
          />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Começa a contar em" obrigatorio dica="Dia e hora que a mercadoria entrou no FULL.">
            <input type="datetime-local" className="campo" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Campo>
          <Campo rotulo="Prazo (dias)" obrigatorio>
            <input type="number" min={1} max={365} className="campo" value={dias} onChange={(e) => setDias(e.target.value)} />
          </Campo>
        </div>
        {fim && <p className="text-sm text-dourado">Vence em {dataHora(fim.toISOString())}.</p>}
        <Campo rotulo="Observação">
          <input
            className="campo"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: 63 kits caneladas, 16 PF, 25 navalhas"
          />
        </Campo>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
          <div>
            {aoExcluir && (
              <button type="button" className="btn-fantasma text-rose-300" onClick={aoExcluir}>
                <Trash2 className="h-4 w-4" /> Excluir
              </button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" className="btn-secundario" onClick={aoFechar}>
              Cancelar
            </button>
            <button className="btn-principal" disabled={ocupado}>
              Salvar
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
