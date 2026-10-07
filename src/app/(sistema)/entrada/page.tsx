'use client';

import { FileCode2, Link2, Loader2, PackagePlus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { erroDoItem, ListaItens, type ItemLancamento } from '@/components/lista-itens';
import { LojaTag } from '@/components/loja';
import { anexarNaOperacao, errosDaNota, NotaFiscalCampos, prepararNota } from '@/components/nota-fiscal';
import { ProdutoBusca } from '@/components/produto-busca';
import { ProdutoRapido } from '@/components/produto-rapido';
import { Campo, Confirmar, Expansivel, SemPermissao, Titulo } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { agoraLocal, dataHora as fmtDataHora, lerNumero, moeda, MOTIVOS_ENTRADA, novaChave, numero } from '@/lib/formato';
import { lerXmlNFe, type ItemNFe } from '@/lib/nfe';
import { supabaseNavegador } from '@/lib/supabase/client';
import { NOTA_VAZIA, type NotaForm, type Produto } from '@/lib/tipos';

export default function Entrada() {
  const { lojaAtual, produtos, produtoPorId, loja, recarregar, pode } = useDados();
  const [quando, setQuando] = useState(agoraLocal());
  const [pedido, setPedido] = useState('');
  const chave = useRef(novaChave()); // evita lançar 2x se clicar duas vezes
  // sempre o estoque em que a pessoa entrou
  const lojaId = lojaAtual?.id ?? null;
  const [motivo, setMotivo] = useState('compra');
  const [itens, setItens] = useState<ItemLancamento[]>([]);
  const [nota, setNota] = useState<NotaForm>(NOTA_VAZIA);
  const [anexo, setAnexo] = useState<File | null>(null);
  const [obs, setObs] = useState('');
  const [pendentes, setPendentes] = useState<ItemNFe[]>([]);
  const [veioDoXml, setVeioDoXml] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [novoProduto, setNovoProduto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [ultima, setUltima] = useState<number | null>(null);
  const inicializado = useRef(false);

  // atalhos vindos de outras telas: /entrada?loja=1&produto=5
  useEffect(() => {
    if (inicializado.current || produtos.length === 0) return;
    inicializado.current = true;
    const q = new URLSearchParams(window.location.search);
    const p = q.get('produto') ? produtoPorId(Number(q.get('produto'))) : undefined;
    if (p) adicionar(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos]);

  const lojaEscolhida = loja(lojaId);

  function adicionar(p: Produto, quantidade: number | '' = 1, custo?: number) {
    setItens((atual) => {
      const existe = atual.find((i) => i.produto_id === p.id);
      if (existe) {
        toast.info('Produto já está na lista: somei a quantidade.');
        return atual.map((i) =>
          i.produto_id === p.id ? { ...i, quantidade: (Number(i.quantidade) || 0) + (Number(quantidade) || 1) } : i,
        );
      }
      return [...atual, { produto_id: p.id, quantidade, custo: custo ?? (p.custo_medio || p.preco_custo || '') }];
    });
  }

  async function importarXml(arquivo: File) {
    try {
      const dados = await lerXmlNFe(await arquivo.text());
      setNota({
        numero: dados.numero,
        serie: dados.serie,
        chave_acesso: dados.chave_acesso,
        data_emissao: dados.data_emissao,
        fornecedor_nome: dados.fornecedor_nome,
        fornecedor_cnpj: dados.fornecedor_cnpj,
        valor_total: dados.valor_total ? String(dados.valor_total).replace('.', ',') : '',
        cfop: dados.cfop,
        natureza_operacao: dados.natureza_operacao,
      });
      setAnexo(arquivo);
      setMotivo('compra');
      setVeioDoXml(true);
      const naoEncontrados: ItemNFe[] = [];
      let achados = 0;
      for (const item of dados.itens) {
        const p = produtos.find(
          (x) =>
            x.ativo &&
            !x.eh_kit &&
            ((item.ean && x.ean === item.ean) || x.sku === item.codigo.toUpperCase() || x.codigo_fornecedor === item.codigo),
        );
        if (p) {
          adicionar(p, Math.round(item.quantidade), item.valor_unitario);
          achados++;
        } else naoEncontrados.push(item);
      }
      setPendentes(naoEncontrados);
      const fracionado = dados.itens.some((i) => !Number.isInteger(i.quantidade));
      toast.success(
        `Nota ${dados.numero} lida: ${achados} item(ns) encontrado(s)` +
          (naoEncontrados.length ? `, ${naoEncontrados.length} precisam ser vinculados.` : '.'),
      );
      if (fracionado) toast.warning('A nota tem quantidades fracionadas: arredondei. Confira as quantidades.');
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }

  async function cadastrarPendente(item: ItemNFe) {
    const { data, error } = await supabaseNavegador().rpc('salvar_produto', {
      p: {
        nome: item.descricao,
        ean: item.ean ?? '',
        sku: '',
        unidade: item.unidade.slice(0, 5),
        preco_custo: item.valor_unitario,
        observacoes: `Cadastrado pela NF-e (código do fornecedor: ${item.codigo})`,
      },
    });
    if (error) return toast.error(mensagemErro(error));
    await recarregar();
    setItens((atual) => [...atual, { produto_id: Number(data), quantidade: Math.round(item.quantidade), custo: item.valor_unitario }]);
    setPendentes((l) => l.filter((x) => x !== item));
    toast.success('Produto cadastrado e adicionado à entrada.');
  }

  function vincularPendente(item: ItemNFe, p: Produto) {
    adicionar(p, Math.round(item.quantidade), item.valor_unitario);
    setPendentes((l) => l.filter((x) => x !== item));
  }

  const errosNota = errosDaNota(nota);
  const problemas: string[] = [];
  if (!lojaId) problemas.push('Escolha a loja que está recebendo.');
  if (itens.length === 0) problemas.push('Adicione pelo menos um produto.');
  if (itens.some((i) => erroDoItem(i, null))) problemas.push('Informe a quantidade de todos os produtos.');
  if (Object.keys(errosNota).length) problemas.push('Corrija os dados da nota fiscal.');
  if (pendentes.length) problemas.push('Há itens da nota ainda não vinculados a produtos.');
  if (motivo === 'outro' && !obs.trim()) problemas.push('Para o motivo "Outro", descreva na observação.');
  if (!quando || quando > agoraLocal()) problemas.push('Informe a data e a hora (não podem ser no futuro).');

  const totalItens = itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.custo) || 0), 0);
  const valorNota = lerNumero(nota.valor_total);

  async function gravar() {
    setOcupado(true);
    try {
      const notaPronta = prepararNota(nota);
      const { data, error } = await supabaseNavegador().rpc('registrar_entrada', {
        p: {
          loja_id: lojaId,
          itens: itens.map((i) => ({
            produto_id: i.produto_id,
            quantidade: Number(i.quantidade),
            custo_unitario: i.custo === '' || i.custo === undefined ? null : Number(i.custo),
          })),
          motivo,
          nota: notaPronta,
          observacao: obs,
          origem: veioDoXml ? 'xml' : 'manual',
          numero_pedido: pedido,
          data_hora: new Date(quando).toISOString(), // com o fuso do aparelho
          chave: chave.current,
        },
      });
      if (error) throw error;
      chave.current = novaChave();
      await anexarNaOperacao(Number(data), anexo);
      toast.success(`Entrada nº ${data} registrada com sucesso!`);
      setUltima(Number(data));
      setItens([]);
      setNota(NOTA_VAZIA);
      setAnexo(null);
      setObs('');
      setPedido('');
      setQuando(agoraLocal());
      setPendentes([]);
      setVeioDoXml(false);
      setConfirmar(false);
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  }

  if (!pode('entrada')) return <SemPermissao texto="Você não tem permissão para registrar entradas." />;

  return (
    <div className="space-y-4">
      <Titulo sub="Mercadoria chegando: compra com nota fiscal, devolução de cliente, bonificação...">Entrada de mercadoria</Titulo>

      {ultima && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          ✓ Entrada nº {ultima} gravada.{' '}
          <Link href={`/movimentacoes?op=${ultima}`} className="text-dourado underline">
            Ver detalhes
          </Link>
        </div>
      )}

      <div className="cartao space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Número do pedido" dica="Pedido de compra ao fornecedor">
            <input
              className="campo"
              name="numero_pedido"
              value={pedido}
              maxLength={60}
              onChange={(e) => setPedido(e.target.value)}
              placeholder="Ex.: PC-2026-015"
            />
          </Campo>
          <Campo rotulo="Número da NF que entrou">
            <input
              className="campo"
              name="numero_nf"
              inputMode="numeric"
              value={nota.numero}
              maxLength={20}
              onChange={(e) => setNota({ ...nota, numero: e.target.value })}
              placeholder="Ex.: 45678"
            />
          </Campo>
          <Campo rotulo="Data e hora" dica="Quando a mercadoria chegou" obrigatorio>
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
        <div className="grid gap-3">
          <Campo rotulo="Motivo">
            <select className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS_ENTRADA.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>

      <Expansivel
        key={motivo === 'compra' ? 'nf-aberta' : 'nf-fechada'}
        titulo={
          <span>
            Dados completos da nota {nota.numero && <span className="text-dourado">nº {nota.numero}</span>}
            {motivo !== 'compra' && <span className="ml-1 text-xs font-normal text-suave">(opcional)</span>}
          </span>
        }
        inicialAberto={motivo === 'compra' || !!nota.numero}
        extra={
          <label className="btn-azul cursor-pointer">
            <FileCode2 className="h-4 w-4" /> Importar XML da NF-e
            <input
              type="file"
              accept=".xml,text/xml,application/xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importarXml(f);
                e.target.value = '';
              }}
            />
          </label>
        }
      >
        <NotaFiscalCampos nota={nota} aoMudar={setNota} anexo={anexo} aoMudarAnexo={setAnexo} />
      </Expansivel>

      {pendentes.length > 0 && (
        <div className="cartao space-y-3 border-orange-400/50">
          <h2 className="font-titulo font-bold text-orange-300">Itens da nota não encontrados no cadastro ({pendentes.length})</h2>
          <p className="text-sm text-suave">
            Para cada item, vincule a um produto já cadastrado (o código do fornecedor pode ser diferente do seu) ou cadastre como produto novo.
          </p>
          {pendentes.map((item, i) => (
            <ItemPendente key={i} item={item} podeCadastrar={pode('produtos')} aoCadastrar={async () => void (await cadastrarPendente(item))} aoVincular={(p) => vincularPendente(item, p)} />
          ))}
        </div>
      )}

      <div className="cartao space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-titulo font-bold">Produtos que estão entrando</h2>
          {pode('produtos') && (
            <button type="button" className="btn-secundario" onClick={() => setNovoProduto(true)}>
              <Plus className="h-4 w-4" /> Produto novo (ainda não cadastrado)
            </button>
          )}
        </div>
        <p className="text-sm text-suave">
          Busque o produto pelo nome, SKU ou código de barras. Ao escolher, aparecem os campos de <b>quantidade</b> e{' '}
          <b>custo unitário</b>. Produto que ainda não existe: use o botão <b>Produto novo</b>.
        </p>
        <ProdutoBusca aoEscolher={(p) => adicionar(p)} semKits />
        <ListaItens itens={itens} aoMudar={setItens} modo="entrada" lojaDestino={lojaEscolhida} />
        {veioDoXml && (
          <p className="text-xs text-orange-300">
            Confira as quantidades: o fornecedor pode vender em caixa/pacote e você controlar em unidades.
          </p>
        )}
        {valorNota !== null && itens.length > 0 && Math.abs(valorNota - totalItens) > 0.05 && (
          <p className="text-xs text-suave">
            Valor da nota {moeda(valorNota)} × total dos itens {moeda(totalItens)} (a diferença pode ser frete, impostos ou desconto).
          </p>
        )}
      </div>

      <div className="cartao">
        <Campo rotulo={motivo === 'outro' ? 'Observação (obrigatória para "Outro")' : 'Observação (opcional)'}>
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
        <PackagePlus className="h-5 w-5" /> Registrar entrada
      </button>

      <Confirmar
        aberto={confirmar}
        titulo="Confirmar entrada?"
        textoConfirmar="Sim, dar entrada"
        ocupado={ocupado}
        aoCancelar={() => setConfirmar(false)}
        aoConfirmar={gravar}
      >
        <p className="flex flex-wrap items-center gap-2">
          Entrada em <LojaTag loja={lojaEscolhida} tamanho="lg" />
        </p>
        <p>
          <b>{itens.length}</b> produto(s), <b>{numero(itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0))}</b> unidade(s),
          total {moeda(totalItens)}. Quando: {quando && fmtDataHora(new Date(quando).toISOString())}.
        </p>
        {pedido.trim() && <p>Pedido nº {pedido}.</p>}
        {nota.numero ? <p>Nota fiscal nº {nota.numero}{anexo && ' (com anexo)'}.</p> : <p className="text-suave">Sem nota fiscal.</p>}
        <ul className="max-h-48 overflow-y-auto rounded-lg bg-painel2 p-2 text-xs">
          {itens.map((i) => (
            <li key={i.produto_id} className="flex justify-between gap-2 py-0.5">
              <span className="truncate">{produtoPorId(i.produto_id)?.nome}</span>
              <b className="tabular">+{i.quantidade}</b>
            </li>
          ))}
        </ul>
      </Confirmar>
      <ProdutoRapido
        aberto={novoProduto}
        aoFechar={() => setNovoProduto(false)}
        aoCriar={(id, quantidade, custo) => setItens((atual) => [...atual, { produto_id: id, quantidade, custo }])}
      />
      {ocupado && <Loader2 className="fixed bottom-24 right-6 h-6 w-6 animate-spin text-dourado" />}
    </div>
  );
}

function ItemPendente({
  item,
  podeCadastrar,
  aoCadastrar,
  aoVincular,
}: {
  item: ItemNFe;
  podeCadastrar: boolean;
  aoCadastrar: () => Promise<void>;
  aoVincular: (p: Produto) => void;
}) {
  const [vinculando, setVinculando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="rounded-lg border border-borda bg-painel2 p-3">
      <div className="font-medium">{item.descricao}</div>
      <div className="text-xs text-suave">
        Cód. fornecedor {item.codigo} {item.ean && `· EAN ${item.ean}`} · {item.quantidade} {item.unidade} × {moeda(item.valor_unitario)}
      </div>
      {vinculando ? (
        <div className="mt-2">
          <ProdutoBusca aoEscolher={aoVincular} autoFocus semKits placeholder="Buscar o produto correspondente..." />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn-secundario min-h-0 py-1.5 text-xs" onClick={() => setVinculando(true)}>
            <Link2 className="h-3.5 w-3.5" /> Vincular a produto existente
          </button>
          <button
            className="btn-secundario min-h-0 py-1.5 text-xs"
            disabled={ocupado || !podeCadastrar}
            title={podeCadastrar ? undefined : 'Sem permissão para cadastrar produtos: peça ao gerente ou vincule a um existente'}
            onClick={async () => {
              setOcupado(true);
              await aoCadastrar();
              setOcupado(false);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Cadastrar como produto novo
          </button>
        </div>
      )}
    </div>
  );
}
