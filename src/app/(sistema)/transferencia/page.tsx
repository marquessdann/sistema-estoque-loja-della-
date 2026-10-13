'use client';

import { ArrowLeftRight, ArrowRight, History, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { erroDoItem, ListaItens, type ItemLancamento } from '@/components/lista-itens';
import { LojaTag, SeletorLoja } from '@/components/loja';
import { anexarNaTransferencia, errosDaNota, NotaFiscalCampos, prepararNota } from '@/components/nota-fiscal';
import { ProdutoBusca } from '@/components/produto-busca';
import { Campo, Confirmar, Expansivel, SemPermissao, Titulo } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { corTexto, disponivelNaLoja, novaChave, numero } from '@/lib/formato';
import { kitsDaObservacao, semAnotacaoDeKit } from '@/lib/kits-agrupar';
import { supabaseNavegador } from '@/lib/supabase/client';
import { NOTA_VAZIA, type NotaForm, type Produto, type Transferencia as TransferenciaTipo, type TransferenciaItem } from '@/lib/tipos';

export default function Transferencia() {
  const { produtos, produtoPorId, loja, pode, ehCeo, lojaAtual, outrasLojas, recarregar } = useDados();
  const chave = useRef(novaChave());
  const [ultima, setUltima] = useState<number | null>(null);
  // a mercadoria SEMPRE sai do estoque em que a pessoa está
  const origemId = lojaAtual?.id ?? null;
  const [destinoId, setDestinoId] = useState<number | null>(null);
  const [itens, setItens] = useState<ItemLancamento[]>([]);
  const [nota, setNota] = useState<NotaForm>(NOTA_VAZIA);
  const [anexo, setAnexo] = useState<File | null>(null);
  const [obs, setObs] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [conferiu, setConferiu] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const inicializado = useRef(false);
  // edição (só o CEO): /transferencia?editar=ID
  const [editando, setEditando] = useState<TransferenciaTipo | null>(null);
  const [devolvidoKit, setDevolvidoKit] = useState<Record<number, number>>({});
  const [motivoEdicao, setMotivoEdicao] = useState('');

  // destino padrão: a outra loja (com 2 lojas não há o que escolher)
  useEffect(() => {
    if (!destinoId || destinoId === origemId) setDestinoId(outrasLojas[0]?.id ?? null);
  }, [outrasLojas, origemId, destinoId]);

  // /transferencia?destino=2&produto=5&qtd=3 (vem do Painel ou da tela do produto)
  useEffect(() => {
    if (inicializado.current || produtos.length === 0) return;
    inicializado.current = true;
    const q = new URLSearchParams(window.location.search);
    const p = q.get('produto') ? produtoPorId(Number(q.get('produto'))) : undefined;
    if (q.get('destino') && Number(q.get('destino')) !== origemId) setDestinoId(Number(q.get('destino')));
    if (p) setItens([{ produto_id: p.id, quantidade: q.get('qtd') ? Number(q.get('qtd')) : 1 }]);
    if (q.get('editar')) carregarEdicao(Number(q.get('editar')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos]);

  // reabre a transferência: os kits voltam a aparecer como kits, o resto como produto
  async function carregarEdicao(id: number) {
    const sb = supabaseNavegador();
    const [a, b] = await Promise.all([
      sb.from('vw_transferencias').select('*').eq('id', id).maybeSingle(),
      sb.from('vw_transferencia_itens').select('*').eq('transferencia_id', id),
    ]);
    const t = a.data as TransferenciaTipo | null;
    if (!t) return toast.error('Transferência não encontrada.');
    if (t.status === 'estornada') return toast.error('Esta transferência já foi estornada ou editada.');
    const resto: Record<number, number> = {};
    for (const i of (b.data ?? []) as TransferenciaItem[]) resto[i.produto_id] = i.quantidade;
    const kits = kitsDaObservacao(t.observacao, produtos);
    const doKit: Record<number, number> = {};
    for (const { kit, qtd } of kits) {
      doKit[kit.id] = qtd;
      for (const c of kit.kit) resto[c.produto_id] = (resto[c.produto_id] ?? 0) - c.quantidade * qtd;
    }
    setDevolvidoKit({ ...doKit, ...Object.fromEntries(Object.entries(resto).filter(([, q]) => q > 0)) });
    setItens([
      ...kits.map(({ kit, qtd }) => ({ produto_id: kit.id, quantidade: qtd })),
      ...Object.entries(resto)
        .filter(([, q]) => q > 0)
        .map(([pid, q]) => ({ produto_id: Number(pid), quantidade: q })),
    ]);
    setDestinoId(t.loja_destino_id);
    setObs(semAnotacaoDeKit(t.observacao));
    setEditando(t);
  }

  const origem = loja(origemId);
  const destino = loja(destinoId);

  function adicionar(p: Produto) {
    setItens((atual) =>
      atual.some((i) => i.produto_id === p.id)
        ? atual.map((i) => (i.produto_id === p.id ? { ...i, quantidade: (Number(i.quantidade) || 0) + 1 } : i))
        : [...atual, { produto_id: p.id, quantidade: 1 }],
    );
  }

  const saldoOrigem = (id: number) => {
    const p = produtoPorId(id);
    return p && origemId ? disponivelNaLoja(p, origemId) : 0;
  };

  const problemas: string[] = [];
  if (!origemId || !destinoId) problemas.push('Escolha a loja de origem e a de destino.');
  if (origemId && origemId === destinoId) problemas.push('Origem e destino precisam ser lojas diferentes.');
  if (itens.length === 0) problemas.push('Adicione pelo menos um produto.');
  if (origemId && itens.some((i) => erroDoItem(i, saldoOrigem(i.produto_id))))
    problemas.push('Há quantidades vazias ou maiores que o estoque disponível na loja de origem.');
  if (Object.keys(errosDaNota(nota)).length) problemas.push('Corrija os dados da nota fiscal.');
  if (editando && !motivoEdicao.trim()) problemas.push('Informe o motivo da edição.');

  async function gravar() {
    setOcupado(true);
    try {
      if (editando) {
        const { data, error } = await supabaseNavegador().rpc('editar_transferencia', {
          p: {
            transferencia_id: editando.id,
            itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: Number(i.quantidade) })),
            observacao: obs,
            motivo: motivoEdicao,
          },
        });
        if (error) throw error;
        toast.success(`Transferência nº ${editando.id} corrigida: agora é a nº ${data}.`);
        await recarregar();
        window.location.href = `/transferencias/${data}`;
        return;
      }
      const { data, error } = await supabaseNavegador().rpc('registrar_transferencia', {
        p: {
          origem_id: origemId,
          destino_id: destinoId,
          itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: Number(i.quantidade) })),
          nota: prepararNota(nota),
          observacao: obs,
          chave: chave.current,
        },
      });
      if (error) throw error;
      chave.current = novaChave();
      await anexarNaTransferencia(Number(data), anexo);
      toast.success(`Transferência nº ${data} concluída: estoque atualizado nas duas lojas.`);
      setUltima(Number(data));
      setItens([]);
      setNota(NOTA_VAZIA);
      setAnexo(null);
      setObs('');
      setConfirmar(false);
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  if (!pode('transferir')) return <SemPermissao texto="Você não tem permissão para fazer transferências." />;
  if (editando && !ehCeo) return <SemPermissao texto="Só o CEO pode editar transferências." />;

  return (
    <div className="space-y-4">
      {origem && destino && (
        <div className="sticky top-0 z-20 -mx-4 mb-2 grid grid-cols-[1fr_auto_1fr] items-center text-center text-xs font-bold uppercase tracking-wide sm:mx-0 sm:overflow-hidden sm:rounded-lg sm:text-sm">
          <div className="px-2 py-2" style={{ backgroundColor: origem.cor, color: corTexto(origem.cor) }}>
            Sai de {origem.nome}
          </div>
          <div className="bg-painel px-2 py-2">
            <ArrowRight className="h-4 w-4" />
          </div>
          <div className="px-2 py-2" style={{ backgroundColor: destino.cor, color: corTexto(destino.cor) }}>
            Entra em {destino.nome}
          </div>
        </div>
      )}
      <Titulo
        sub="Mercadoria indo de um estoque para o outro (DELLA ESTOQUE ⇄ DELLA FULL ML). Sai de um e entra no outro na mesma hora. Pedido de cliente é na tela Saída."
        acoes={
          <Link href="/transferencias" className="btn-secundario">
            <History className="h-4 w-4" /> Histórico
          </Link>
        }
      >
        {editando ? `Editar transferência nº ${editando.id}` : 'Transferir entre estoques'}
      </Titulo>

      {editando && (
        <div className="space-y-3 rounded-xl border border-dourado/50 bg-dourado/10 p-3 text-sm" data-editando={editando.id}>
          <p className="flex items-start gap-2">
            <Pencil className="mt-0.5 h-4 w-4 shrink-0 text-dourado" />
            <span>
              Corrija os produtos e as quantidades. Ao salvar, a transferência nº {editando.id} fica no histórico como
              <b> editada</b> e é gravada uma nova com os dados certos. A nota fiscal
              {editando.nf_numero ? ` (NF ${editando.nf_numero})` : ''} e o anexo continuam os mesmos.
            </span>
          </p>
          <Campo rotulo="Motivo da edição" obrigatorio>
            <input
              className="campo"
              name="motivo_edicao"
              value={motivoEdicao}
              onChange={(e) => setMotivoEdicao(e.target.value)}
              placeholder="Ex.: quantidade de kits digitada errada"
            />
          </Campo>
        </div>
      )}


      {ultima && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          ✓ Transferência nº {ultima} concluída.{' '}
          <Link href={`/transferencias/${ultima}`} className="text-dourado underline">
            Ver detalhes
          </Link>
        </div>
      )}

      <div className="cartao space-y-3">
        <div>
          <span className="rotulo">SAI DE (o estoque em que você está):</span>
          <LojaTag loja={origem} tamanho="lg" />
        </div>
        {outrasLojas.length > 1 ? (
          <SeletorLoja lojas={outrasLojas} valor={destinoId} aoMudar={setDestinoId} rotulo="ENTRA EM (loja de destino):" />
        ) : (
          <div>
            <span className="rotulo">ENTRA EM (loja de destino):</span>
            <LojaTag loja={destino} tamanho="lg" />
          </div>
        )}
        <p className="text-xs text-suave">
          Para mover mercadoria no sentido contrário, entre no outro estoque (botão &quot;Trocar de estoque&quot; no topo).
        </p>
      </div>

      <div className="cartao space-y-3">
        <h2 className="font-titulo font-bold">Produtos</h2>
        <ProdutoBusca aoEscolher={adicionar} />
        {origem && destino ? (
          <ListaItens
            itens={itens}
            aoMudar={setItens}
            modo="transferencia"
            lojaOrigem={origem}
            lojaDestino={destino}
            devolvido={editando ? (id) => devolvidoKit[id] ?? 0 : undefined}
          />
        ) : (
          itens.length > 0 && <p className="text-sm text-orange-300">Escolha origem e destino acima.</p>
        )}
      </div>

      {!editando && (
      <Expansivel titulo={<span>Nota fiscal de transferência <span className="text-xs font-normal text-suave">(opcional)</span></span>}>
        <NotaFiscalCampos nota={nota} aoMudar={setNota} anexo={anexo} aoMudarAnexo={setAnexo} />
      </Expansivel>
      )}

      <div className="cartao">
        <Campo rotulo="Observação (opcional)">
          <input className="campo" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: envio Full nº, nº da coleta..." />
        </Campo>
      </div>

      {problemas.length > 0 && itens.length > 0 && (
        <ul className="list-inside list-disc text-sm text-orange-300">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <button
        className="btn-principal h-14 w-full text-base"
        disabled={problemas.length > 0}
        onClick={() => {
          setConferiu(false);
          setConfirmar(true);
        }}
      >
        <ArrowLeftRight className="h-5 w-5" /> {editando ? 'Salvar a correção' : `Transferir para ${destino?.nome}`}
      </button>

      <Confirmar
        aberto={confirmar}
        titulo={`Mover mercadoria para ${destino?.nome ?? ''}?`}
        textoConfirmar="Sim, mover agora"
        ocupado={ocupado}
        bloquearConfirmar={!conferiu}
        aoCancelar={() => setConfirmar(false)}
        aoConfirmar={gravar}
      >
        <div className="flex flex-wrap items-center gap-2">
          <LojaTag loja={origem} tamanho="lg" />
          <ArrowRight className="h-5 w-5 text-dourado" />
          <LojaTag loja={destino} tamanho="lg" />
        </div>
        <p className="text-base">
          Você tem certeza que deseja mover{' '}
          <b>{numero(itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0))} unidade(s)</b> de <b>{origem?.nome}</b> para{' '}
          <b>{destino?.nome}</b>?
        </p>
        <ul className="max-h-48 overflow-y-auto rounded-lg bg-painel2 p-2 text-xs">
          {itens.map((i) => (
            <li key={i.produto_id} className="flex justify-between gap-2 py-0.5">
              <span className="truncate">{produtoPorId(i.produto_id)?.nome}</span>
              <b className="tabular">{i.quantidade}</b>
            </li>
          ))}
        </ul>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-dourado/50 bg-dourado/10 p-3">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-dourado" checked={conferiu} onChange={(e) => setConferiu(e.target.checked)} />
          <span>
            Conferi: a mercadoria vai <b>sair de {origem?.nome}</b> e <b>entrar em {destino?.nome}</b>.
          </span>
        </label>
      </Confirmar>
    </div>
  );
}
