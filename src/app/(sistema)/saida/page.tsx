'use client';

import { PackageMinus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { erroDoItem, ListaItens, type ItemLancamento } from '@/components/lista-itens';
import { LojaTag } from '@/components/loja';
import { anexarNaOperacao, errosDaNota, NotaFiscalCampos, prepararNota } from '@/components/nota-fiscal';
import { ProdutoBusca } from '@/components/produto-busca';
import { Campo, Confirmar, Expansivel, SemPermissao, Titulo } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { disponivelNaLoja, hojeISO, MOTIVOS_SAIDA, novaChave, numero, rotuloMotivo } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import { NOTA_VAZIA, type NotaForm, type Produto } from '@/lib/tipos';

export default function Saida() {
  const { lojaAtual, produtos, produtoPorId, loja, pode } = useDados();
  const [dataRef, setDataRef] = useState(hojeISO());
  const chave = useRef(novaChave());
  // sempre o estoque em que a pessoa entrou
  const lojaId = lojaAtual?.id ?? null;
  const [motivo, setMotivo] = useState('venda');
  const [itens, setItens] = useState<ItemLancamento[]>([]);
  const [nota, setNota] = useState<NotaForm>(NOTA_VAZIA);
  const [anexo, setAnexo] = useState<File | null>(null);
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

  const lojaEscolhida = loja(lojaId);

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

  const problemas: string[] = [];
  if (!lojaId) problemas.push('Escolha de qual loja a mercadoria está saindo.');
  if (itens.length === 0) problemas.push('Adicione pelo menos um produto.');
  if (lojaId && itens.some((i) => erroDoItem(i, saldo(i.produto_id))))
    problemas.push('Há quantidades vazias ou maiores que o estoque disponível.');
  if (motivo === 'outro' && !obs.trim()) problemas.push('Para o motivo "Outro", descreva na observação.');
  if (!dataRef || dataRef > hojeISO()) problemas.push('Informe uma data válida (não pode ser no futuro).');
  if (Object.keys(errosDaNota(nota)).length) problemas.push('Corrija os dados da nota fiscal.');

  async function gravar() {
    setOcupado(true);
    try {
      const { data, error } = await supabaseNavegador().rpc('registrar_saida', {
        p: {
          loja_id: lojaId,
          itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: Number(i.quantidade) })),
          motivo,
          nota: prepararNota(nota),
          observacao: obs,
          data: dataRef,
          chave: chave.current,
        },
      });
      if (error) throw error;
      chave.current = novaChave();
      await anexarNaOperacao(Number(data), anexo);
      toast.success(`Saída nº ${data} registrada!`);
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

  if (!pode('saida')) return <SemPermissao texto="Você não tem permissão para registrar saídas." />;

  return (
    <div className="space-y-4">
      <Titulo sub="Mercadoria saindo: venda, perda, avaria ou uso interno.">Saída de mercadoria</Titulo>

      {ultima && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          ✓ Saída nº {ultima} gravada.{' '}
          <Link href={`/movimentacoes?op=${ultima}`} className="text-dourado underline">
            Ver detalhes
          </Link>
        </div>
      )}

      <div className="cartao space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Campo rotulo="Motivo" obrigatorio>
            <select className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS_SAIDA.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Data da saída">
            <input type="date" className="campo" value={dataRef} max={hojeISO()} onChange={(e) => setDataRef(e.target.value)} />
          </Campo>
        </div>
      </div>

      <div className="cartao space-y-3">
        <h2 className="font-titulo font-bold">Produtos</h2>
        <ProdutoBusca aoEscolher={adicionar} />
        {lojaEscolhida ? (
          <ListaItens itens={itens} aoMudar={setItens} modo="saida" lojaOrigem={lojaEscolhida} />
        ) : (
          itens.length > 0 && <p className="text-sm text-orange-300">Escolha a loja acima para ver o saldo disponível.</p>
        )}
      </div>

      <Expansivel titulo={<span>Nota fiscal <span className="text-xs font-normal text-suave">(opcional)</span></span>}>
        <NotaFiscalCampos nota={nota} aoMudar={setNota} anexo={anexo} aoMudarAnexo={setAnexo} />
      </Expansivel>

      <div className="cartao">
        <Campo rotulo={motivo === 'outro' ? 'Observação (obrigatória para "Outro")' : 'Observação (opcional)'}>
          <input className="campo" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: pedido nº, nome do cliente..." />
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
        <PackageMinus className="h-5 w-5" /> Registrar saída
      </button>

      <Confirmar
        aberto={confirmar}
        titulo="Confirmar saída?"
        textoConfirmar="Sim, dar saída"
        ocupado={ocupado}
        aoCancelar={() => setConfirmar(false)}
        aoConfirmar={gravar}
      >
        <p className="flex flex-wrap items-center gap-2">
          Saída de <LojaTag loja={lojaEscolhida} tamanho="lg" /> — {rotuloMotivo(motivo)}
        </p>
        <p>
          <b>{itens.length}</b> produto(s), <b>{numero(itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0))}</b> unidade(s).
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
