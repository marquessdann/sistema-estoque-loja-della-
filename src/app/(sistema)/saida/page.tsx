'use client';

import { PackageMinus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { erroDoItem, ListaItens, type ItemLancamento } from '@/components/lista-itens';
import { FaixaLoja, LojaTag, SeletorLoja } from '@/components/loja';
import { anexarNaOperacao, errosDaNota, NotaFiscalCampos, prepararNota } from '@/components/nota-fiscal';
import { ProdutoBusca } from '@/components/produto-busca';
import { Campo, Confirmar, Expansivel, Titulo } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { estoqueNaLoja, MOTIVOS_SAIDA, numero, rotuloMotivo } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import { NOTA_VAZIA, type NotaForm, type Produto } from '@/lib/tipos';

export default function Saida() {
  const { lojas, produtos, produtoPorId, loja } = useDados();
  const [lojaId, setLojaId] = useState<number | null>(null);
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
    if (q.get('loja')) setLojaId(Number(q.get('loja')));
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
    return p && lojaId ? estoqueNaLoja(p, lojaId).saldo : 0;
  };

  const problemas: string[] = [];
  if (!lojaId) problemas.push('Escolha de qual loja a mercadoria está saindo.');
  if (itens.length === 0) problemas.push('Adicione pelo menos um produto.');
  if (lojaId && itens.some((i) => erroDoItem(i, saldo(i.produto_id))))
    problemas.push('Há quantidades vazias ou maiores que o saldo disponível.');
  if (Object.keys(errosDaNota(nota)).length) problemas.push('Corrija os dados da nota fiscal.');

  async function gravar() {
    setOcupado(true);
    try {
      const { data, error } = await supabaseNavegador().rpc('registrar_saida', {
        p_loja_id: lojaId,
        p_itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: Number(i.quantidade) })),
        p_motivo: motivo,
        p_nota: prepararNota(nota),
        p_observacao: obs,
      });
      if (error) throw error;
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

  return (
    <div className="space-y-4">
      <FaixaLoja loja={lojaEscolhida} texto="Saída de" />
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
        <SeletorLoja lojas={lojas} valor={lojaId} aoMudar={setLojaId} rotulo="De qual loja a mercadoria está saindo?" />
        <Campo rotulo="Motivo" obrigatorio>
          <select className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {MOTIVOS_SAIDA.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </Campo>
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
        <Campo rotulo="Observação (opcional)">
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
