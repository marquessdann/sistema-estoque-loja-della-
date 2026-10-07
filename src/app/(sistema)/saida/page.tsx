'use client';

import { ArrowLeftRight, PackageMinus, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { erroDoItem, ListaItens, type ItemLancamento } from '@/components/lista-itens';
import { LojaTag } from '@/components/loja';
import { ProdutoBusca } from '@/components/produto-busca';
import { Campo, Confirmar, SemPermissao, Titulo } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import {
  agoraLocal,
  dataHora as fmtDataHora,
  disponivelNaLoja,
  ehFull,
  MOTIVOS_SAIDA,
  novaChave,
  numero,
  PLATAFORMAS,
  rotuloMotivo,
} from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Plataforma, Produto } from '@/lib/tipos';

// Saída = mercadoria indo para as LOJAS (pedido do Mercado Livre ou do TikTok Shop).
// Mandar mercadoria para o outro estoque é na tela Transferir.
type Modo = 'pedido' | 'outra';

export default function Saida() {
  const { lojaAtual, outrasLojas, produtos, produtoPorId, pode } = useDados();
  const chave = useRef(novaChave());
  const lojaId = lojaAtual?.id ?? null; // sempre o estoque em que a pessoa entrou
  const noFull = ehFull(lojaAtual?.codigo);
  const [modo, setModo] = useState<Modo>('pedido');
  const [plataforma, setPlataforma] = useState<Plataforma | null>(null);
  const [pedido, setPedido] = useState('');
  const [nf, setNf] = useState('');
  const [cliente, setCliente] = useState('');
  const [quando, setQuando] = useState(agoraLocal());
  const [motivo, setMotivo] = useState('perda');
  const [itens, setItens] = useState<ItemLancamento[]>([]);
  const [obs, setObs] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [ultima, setUltima] = useState<number | null>(null);
  const inicializado = useRef(false);

  useEffect(() => {
    if (inicializado.current || produtos.length === 0) return;
    inicializado.current = true;
    const q = new URLSearchParams(window.location.search);
    const p = q.get('produto') ? produtoPorId(Number(q.get('produto'))) : undefined;
    if (p) adicionar(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos]);

  function adicionar(p: Produto) {
    setItens((atual) =>
      atual.some((i) => i.produto_id === p.id)
        ? atual.map((i) => (i.produto_id === p.id ? { ...i, quantidade: (Number(i.quantidade) || 0) + 1 } : i))
        : [...atual, { produto_id: p.id, quantidade: 1 }],
    );
  }

  const saldo = (id: number) => {
    const p = produtoPorId(id);
    return p && lojaId ? disponivelNaLoja(p, lojaId) : 0;
  };

  const plataformaFinal: Plataforma | null = noFull ? 'mercado_livre' : plataforma;
  const unidades = itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);

  const problemas: string[] = [];
  if (modo === 'pedido') {
    if (!plataformaFinal) problemas.push('Escolha a plataforma do pedido (Mercado Livre ou TikTok Shop).');
    if (!pedido.trim()) problemas.push('Informe o número do pedido.');
  } else if (motivo === 'outro' && !obs.trim()) problemas.push('Para o motivo "Outro", descreva na observação.');
  if (itens.length === 0) problemas.push('Adicione pelo menos um produto.');
  if (lojaId && itens.some((i) => erroDoItem(i, saldo(i.produto_id))))
    problemas.push('Há quantidades vazias ou maiores que o estoque disponível.');
  if (!quando || quando > agoraLocal()) problemas.push('Informe a data e a hora (não pode ser no futuro).');

  function limpar() {
    setItens([]);
    setPedido('');
    setNf('');
    setCliente('');
    setObs('');
    setQuando(agoraLocal());
    setConfirmar(false);
  }

  async function gravar() {
    setOcupado(true);
    try {
      const { data, error } = await supabaseNavegador().rpc('registrar_saida', {
        p: {
          loja_id: lojaId,
          itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: Number(i.quantidade) })),
          motivo: modo === 'pedido' ? 'venda' : motivo,
          plataforma: modo === 'pedido' ? plataformaFinal : null,
          numero_pedido: modo === 'pedido' ? pedido : null,
          numero_nf: modo === 'pedido' ? nf : null,
          cliente_nome: modo === 'pedido' ? cliente : null,
          observacao: obs,
          data_hora: new Date(quando).toISOString(), // com o fuso do aparelho
          chave: chave.current,
        },
      });
      if (error) throw error;
      chave.current = novaChave();
      toast.success(modo === 'pedido' ? `Baixa do pedido ${pedido} registrada!` : `Saída nº ${data} registrada!`);
      setUltima(Number(data));
      limpar();
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  if (!pode('saida')) return <SemPermissao texto="Você não tem permissão para dar baixa." />;

  return (
    <div className="space-y-4">
      <Titulo
        sub={
          <>
            Mercadoria saindo de <LojaTag loja={lojaAtual} tamanho="sm" /> para as lojas (pedidos).
          </>
        }
      >
        Saída (baixa)
      </Titulo>

      <Link
        href="/transferencia"
        className="flex items-center gap-3 rounded-xl border border-borda bg-painel2 p-3 text-sm hover:border-dourado"
      >
        <ArrowLeftRight className="h-5 w-5 shrink-0 text-dourado" />
        <span>
          Vai mandar mercadoria para <b>{outrasLojas.map((l) => l.nome).join(' / ') || 'o outro estoque'}</b>? Isso é uma{' '}
          <b className="text-dourado underline">transferência entre estoques</b>, não uma saída.
        </span>
      </Link>

      {ultima && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          ✓ Saída nº {ultima} gravada.{' '}
          <Link href={`/movimentacoes?op=${ultima}`} className="text-dourado underline">
            Ver detalhes
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2" role="tablist">
        {(
          [
            ['pedido', 'Pedido (venda)', 'Mercado Livre / TikTok Shop'],
            ['outra', 'Outra saída', 'Perda, avaria, uso interno...'],
          ] as const
        ).map(([v, rot, sub]) => (
          <button
            key={v}
            role="tab"
            aria-selected={modo === v}
            data-modo={v}
            onClick={() => setModo(v)}
            className={`rounded-xl border p-3 text-left transition ${
              modo === v ? 'border-dourado bg-dourado/10' : 'border-borda bg-painel hover:border-suave'
            }`}
          >
            <b className="block">{rot}</b>
            <span className="text-xs text-suave">{sub}</span>
          </button>
        ))}
      </div>

      {modo === 'pedido' ? (
        <div className="cartao space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold">
              Qual plataforma? <span className="text-rose-400">*</span>
            </p>
            {noFull ? (
              <p className="flex items-center gap-2 text-sm">
                <span className={`rounded-full px-3 py-1 font-bold ${PLATAFORMAS.mercado_livre.cor}`}>Mercado Livre</span>
                <span className="text-suave">O FULL só atende pedidos do Mercado Livre.</span>
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PLATAFORMAS) as Plataforma[]).map((p) => (
                  <button
                    key={p}
                    data-plataforma={p}
                    onClick={() => setPlataforma(p)}
                    className={`flex h-14 items-center justify-center gap-2 rounded-xl border-2 font-bold transition ${
                      plataforma === p ? 'border-dourado ' + PLATAFORMAS[p].cor : 'border-borda bg-painel2 hover:border-suave'
                    }`}
                  >
                    <ShoppingBag className="h-5 w-5" /> {PLATAFORMAS[p].rotulo}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Número do pedido" obrigatorio>
              <input
                className="campo"
                name="numero_pedido"
                value={pedido}
                maxLength={60}
                onChange={(e) => setPedido(e.target.value)}
                placeholder="Ex.: 2000012345678"
              />
            </Campo>
            <Campo rotulo="Número da NF">
              <input
                className="campo"
                name="numero_nf"
                inputMode="numeric"
                value={nf}
                maxLength={20}
                onChange={(e) => setNf(e.target.value)}
                placeholder="Ex.: 1234"
              />
            </Campo>
            <Campo rotulo="Nome do cliente">
              <input
                className="campo"
                name="cliente_nome"
                value={cliente}
                maxLength={120}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Ex.: Maria Souza"
              />
            </Campo>
            <Campo rotulo="Data e hora" obrigatorio>
              <input
                type="datetime-local"
                className="campo"
                name="data_hora"
                value={quando}
                max={agoraLocal()}
                onChange={(e) => setQuando(e.target.value)}
              />
            </Campo>
          </div>
        </div>
      ) : (
        <div className="cartao grid gap-3 sm:grid-cols-[1fr_220px]">
          <Campo rotulo="Motivo" obrigatorio>
            <select className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS_SAIDA.filter((m) => m.valor !== 'venda').map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Data e hora" obrigatorio>
            <input
              type="datetime-local"
              className="campo"
              value={quando}
              max={agoraLocal()}
              onChange={(e) => setQuando(e.target.value)}
            />
          </Campo>
        </div>
      )}

      <div className="cartao space-y-3">
        <h2 className="font-titulo font-bold">Produtos</h2>
        <ProdutoBusca aoEscolher={adicionar} />
        {lojaAtual && <ListaItens itens={itens} aoMudar={setItens} modo="saida" lojaOrigem={lojaAtual} />}
      </div>

      <div className="cartao">
        <Campo rotulo={modo === 'outra' && motivo === 'outro' ? 'Observação (obrigatória para "Outro")' : 'Observação (opcional)'}>
          <input className="campo" value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
      </div>

      {problemas.length > 0 && itens.length > 0 && (
        <ul className="list-inside list-disc text-sm text-orange-300">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <button className="btn-principal h-14 w-full text-base" disabled={problemas.length > 0} onClick={() => setConfirmar(true)}>
        <PackageMinus className="h-5 w-5" /> {modo === 'pedido' ? 'Dar baixa do pedido' : 'Registrar saída'}
      </button>

      <Confirmar
        aberto={confirmar}
        titulo={modo === 'pedido' ? 'Confirmar baixa do pedido?' : 'Confirmar saída?'}
        textoConfirmar="Sim, dar baixa"
        ocupado={ocupado}
        aoCancelar={() => setConfirmar(false)}
        aoConfirmar={gravar}
      >
        <p className="flex flex-wrap items-center gap-2">
          Sai de <LojaTag loja={lojaAtual} tamanho="lg" />
        </p>
        {modo === 'pedido' ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-painel2 p-3 text-sm">
            <dt className="text-suave">Plataforma</dt>
            <dd className="font-semibold">{plataformaFinal ? PLATAFORMAS[plataformaFinal].rotulo : ''}</dd>
            <dt className="text-suave">Pedido</dt>
            <dd className="font-semibold">{pedido}</dd>
            {nf.trim() && (
              <>
                <dt className="text-suave">NF</dt>
                <dd>{nf}</dd>
              </>
            )}
            {cliente.trim() && (
              <>
                <dt className="text-suave">Cliente</dt>
                <dd>{cliente}</dd>
              </>
            )}
            <dt className="text-suave">Quando</dt>
            <dd>{quando && fmtDataHora(new Date(quando).toISOString())}</dd>
          </dl>
        ) : (
          <p>Motivo: {rotuloMotivo(motivo)}</p>
        )}
        <p>
          <b>{itens.length}</b> produto(s), <b>{numero(unidades)}</b> unidade(s).
        </p>
        <ul className="max-h-48 overflow-y-auto rounded-lg bg-painel2 p-2 text-xs">
          {itens.map((i) => (
            <li key={i.produto_id} className="flex justify-between gap-2 py-0.5">
              <span className="truncate">{produtoPorId(i.produto_id)?.nome}</span>
              <b className="tabular text-rose-400">-{i.quantidade}</b>
            </li>
          ))}
        </ul>
      </Confirmar>
    </div>
  );
}
