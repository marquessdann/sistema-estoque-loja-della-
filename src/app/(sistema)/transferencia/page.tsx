'use client';

import { ArrowDown, ArrowLeftRight, ArrowRight, History } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { erroDoItem, ListaItens, type ItemLancamento } from '@/components/lista-itens';
import { LojaTag, SeletorLoja } from '@/components/loja';
import { anexarNaOperacao, errosDaNota, NotaFiscalCampos, prepararNota } from '@/components/nota-fiscal';
import { ProdutoBusca } from '@/components/produto-busca';
import { Campo, Confirmar, Expansivel, Titulo } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { corTexto, estoqueNaLoja, numero } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import { NOTA_VAZIA, type NotaForm, type Produto } from '@/lib/tipos';

export default function Transferencia() {
  const { lojas, produtos, produtoPorId, loja } = useDados();
  const [origemId, setOrigemId] = useState<number | null>(null);
  const [destinoId, setDestinoId] = useState<number | null>(null);
  const [itens, setItens] = useState<ItemLancamento[]>([]);
  const [nota, setNota] = useState<NotaForm>(NOTA_VAZIA);
  const [anexo, setAnexo] = useState<File | null>(null);
  const [obs, setObs] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [ultima, setUltima] = useState<number | null>(null);
  const inicializado = useRef(false);

  // /transferencia?origem=1&destino=2&produto=5&qtd=3 (vem do Painel ou da tela do produto)
  useEffect(() => {
    if (inicializado.current || produtos.length === 0 || lojas.length === 0) return;
    inicializado.current = true;
    const q = new URLSearchParams(window.location.search);
    const p = q.get('produto') ? produtoPorId(Number(q.get('produto'))) : undefined;
    let origem = q.get('origem') ? Number(q.get('origem')) : null;
    let destino = q.get('destino') ? Number(q.get('destino')) : null;
    // sem origem informada: sugere a loja que tem mais saldo do produto
    if (p && !origem && lojas.length === 2) {
      const [a, b] = lojas;
      origem = estoqueNaLoja(p, a.id).saldo >= estoqueNaLoja(p, b.id).saldo ? a.id : b.id;
    }
    if (origem && !destino && lojas.length === 2) destino = lojas.find((l) => l.id !== origem)!.id;
    setOrigemId(origem);
    setDestinoId(destino);
    if (p) setItens([{ produto_id: p.id, quantidade: q.get('qtd') ? Number(q.get('qtd')) : 1 }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, lojas]);

  const origem = loja(origemId);
  const destino = loja(destinoId);

  function escolherOrigem(id: number) {
    setOrigemId(id);
    if (destinoId === id || (!destinoId && lojas.length === 2)) setDestinoId(lojas.find((l) => l.id !== id)?.id ?? null);
  }
  function escolherDestino(id: number) {
    setDestinoId(id);
    if (origemId === id || (!origemId && lojas.length === 2)) setOrigemId(lojas.find((l) => l.id !== id)?.id ?? null);
  }
  function inverter() {
    setOrigemId(destinoId);
    setDestinoId(origemId);
  }

  function adicionar(p: Produto) {
    setItens((atual) =>
      atual.some((i) => i.produto_id === p.id)
        ? atual.map((i) => (i.produto_id === p.id ? { ...i, quantidade: (Number(i.quantidade) || 0) + 1 } : i))
        : [...atual, { produto_id: p.id, quantidade: 1 }],
    );
  }

  const saldoOrigem = (id: number) => {
    const p = produtoPorId(id);
    return p && origemId ? estoqueNaLoja(p, origemId).saldo : 0;
  };

  const problemas: string[] = [];
  if (!origemId || !destinoId) problemas.push('Escolha a loja de origem e a de destino.');
  if (origemId && origemId === destinoId) problemas.push('Origem e destino precisam ser lojas diferentes.');
  if (itens.length === 0) problemas.push('Adicione pelo menos um produto.');
  if (origemId && itens.some((i) => erroDoItem(i, saldoOrigem(i.produto_id))))
    problemas.push('Há quantidades vazias ou maiores que o saldo da loja de origem.');
  if (Object.keys(errosDaNota(nota)).length) problemas.push('Corrija os dados da nota fiscal.');

  async function gravar() {
    setOcupado(true);
    try {
      const { data, error } = await supabaseNavegador().rpc('registrar_transferencia', {
        p_origem_id: origemId,
        p_destino_id: destinoId,
        p_itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: Number(i.quantidade) })),
        p_nota: prepararNota(nota),
        p_observacao: obs,
      });
      if (error) throw error;
      await anexarNaOperacao(Number(data), anexo);
      toast.success(`Transferência nº ${data} concluída!`);
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
        sub="Leve produtos de uma loja para a outra. Sai de uma e entra na outra ao mesmo tempo."
        acoes={
          <Link href="/transferencias" className="btn-secundario">
            <History className="h-4 w-4" /> Histórico
          </Link>
        }
      >
        Transferir entre lojas
      </Titulo>

      {ultima && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          ✓ Transferência nº {ultima} concluída.{' '}
          <Link href={`/transferencias?op=${ultima}`} className="text-dourado underline">
            Ver detalhes
          </Link>
        </div>
      )}

      <div className="cartao space-y-3">
        <SeletorLoja lojas={lojas} valor={origemId} aoMudar={escolherOrigem} rotulo="DE (sai da loja):" />
        <div className="flex justify-center">
          <button type="button" onClick={inverter} className="btn-secundario rounded-full" title="Inverter origem e destino">
            <ArrowDown className="h-4 w-4" /> <ArrowLeftRight className="h-4 w-4" /> Inverter
          </button>
        </div>
        <SeletorLoja lojas={lojas} valor={destinoId} aoMudar={escolherDestino} rotulo="PARA (entra na loja):" />
      </div>

      <div className="cartao space-y-3">
        <h2 className="font-titulo font-bold">Produtos</h2>
        <ProdutoBusca aoEscolher={adicionar} />
        {origem && destino ? (
          <ListaItens itens={itens} aoMudar={setItens} modo="transferencia" lojaOrigem={origem} lojaDestino={destino} />
        ) : (
          itens.length > 0 && <p className="text-sm text-orange-300">Escolha origem e destino acima.</p>
        )}
      </div>

      <Expansivel titulo={<span>Nota fiscal de transferência <span className="text-xs font-normal text-suave">(opcional)</span></span>}>
        <NotaFiscalCampos nota={nota} aoMudar={setNota} anexo={anexo} aoMudarAnexo={setAnexo} />
      </Expansivel>

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

      <button className="btn-principal h-14 w-full text-base" disabled={problemas.length > 0} onClick={() => setConfirmar(true)}>
        <ArrowLeftRight className="h-5 w-5" /> Transferir
      </button>

      <Confirmar
        aberto={confirmar}
        titulo="Confirmar transferência?"
        textoConfirmar="Sim, transferir"
        ocupado={ocupado}
        aoCancelar={() => setConfirmar(false)}
        aoConfirmar={gravar}
      >
        <div className="flex flex-wrap items-center gap-2">
          <LojaTag loja={origem} tamanho="lg" />
          <ArrowRight className="h-5 w-5 text-dourado" />
          <LojaTag loja={destino} tamanho="lg" />
        </div>
        <p>
          <b>{itens.length}</b> produto(s), <b>{numero(itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0))}</b> unidade(s).
        </p>
        <ul className="max-h-48 overflow-y-auto rounded-lg bg-painel2 p-2 text-xs">
          {itens.map((i) => (
            <li key={i.produto_id} className="flex justify-between gap-2 py-0.5">
              <span className="truncate">{produtoPorId(i.produto_id)?.nome}</span>
              <b className="tabular">{i.quantidade}</b>
            </li>
          ))}
        </ul>
      </Confirmar>
    </div>
  );
}
