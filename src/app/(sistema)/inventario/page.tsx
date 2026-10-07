'use client';

import { ClipboardCheck, FileDown, FileSpreadsheet, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LojaTag } from '@/components/loja';
import { Campo, CampoQuantidade, Confirmar, SemPermissao, Titulo, Vazio } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { exportarExcel, exportarPDF, type Coluna } from '@/lib/exportar';
import { buscarProdutos, estoqueNaLoja, novaChave } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Produto } from '@/lib/tipos';

const MOTIVOS = ['Inventário geral', 'Inventário parcial', 'Saldo inicial', 'Correção de lançamento', 'Outro'];

export default function Inventario() {
  const { lojaAtual, produtos, loja, categorias, categoriaNome, pode } = useDados();
  const chave = useRef(novaChave());
  // saldo que aparecia na tela quando cada produto foi contado (se mudar no meio, o sistema avisa)
  const [saldoVisto, setSaldoVisto] = useState<Record<number, number>>({});
  // sempre o estoque em que a pessoa entrou
  const lojaId = lojaAtual?.id ?? null;
  const [contagem, setContagem] = useState<Record<number, number | ''>>({});
  const [termo, setTermo] = useState('');
  const [categoria, setCategoria] = useState<number | ''>('');
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [motivoOutro, setMotivoOutro] = useState('');
  const [obs, setObs] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const lojaEscolhida = loja(lojaId);
  const ativos = useMemo(() => produtos.filter((p) => p.ativo && !p.eh_kit), [produtos]);
  const visiveis = useMemo(() => {
    let l = ativos;
    if (categoria) l = l.filter((p) => p.categoria_id === categoria);
    return buscarProdutos(l, termo);
  }, [ativos, termo, categoria]);

  const saldo = (p: Produto) => (lojaId ? estoqueNaLoja(p, lojaId).saldo : 0);
  const contados = ativos.filter((p) => contagem[p.id] !== undefined && contagem[p.id] !== '');
  const diferencas = contados
    .map((p) => ({ p, sistema: saldo(p), contado: Number(contagem[p.id]) }))
    .filter((d) => d.contado !== d.sistema);
  const motivoFinal = motivo === 'Outro' ? motivoOutro.trim() : motivo;


  async function gravar() {
    setOcupado(true);
    const { data, error } = await supabaseNavegador().rpc('registrar_ajuste', {
      p: {
        loja_id: lojaId,
        itens: contados.map((p) => ({
          produto_id: p.id,
          quantidade_contada: Number(contagem[p.id]),
          saldo_esperado: saldoVisto[p.id] ?? saldo(p),
        })),
        motivo: motivoFinal,
        observacao: obs,
        chave: chave.current,
      },
    });
    setOcupado(false);
    setConfirmar(false);
    if (error) return toast.error(mensagemErro(error), { duration: 10000 });
    chave.current = novaChave();
    setSaldoVisto({});
    if (data === null) toast.success('Contagem conferida: nenhuma diferença, nada foi alterado.');
    else toast.success(`Ajuste de inventário nº ${data} registrado!`);
    setContagem({});
    setObs('');
  }

  async function folhaDeContagem(formato: 'xlsx' | 'pdf') {
    if (!lojaEscolhida) return toast.error('Escolha a loja primeiro.');
    const colunas: Coluna<Produto>[] = [
      { titulo: 'SKU', valor: (p) => p.sku, largura: 14 },
      { titulo: 'Produto', valor: (p) => p.nome, largura: 50 },
      { titulo: 'Categoria', valor: (p) => categoriaNome(p.categoria_id), largura: 16 },
      { titulo: 'Sistema', valor: (p) => saldo(p), formato: 'inteiro', largura: 10 },
      { titulo: 'Contado', valor: () => '', largura: 12 },
    ];
    if (formato === 'xlsx') await exportarExcel('folha-contagem', [{ nome: 'Contagem', colunas, linhas: visiveis }]);
    else await exportarPDF('folha-contagem', `Folha de contagem — ${lojaEscolhida.nome}`, 'Anote a quantidade contada de cada produto', colunas, visiveis);
  }

  if (!pode('inventario')) return <SemPermissao texto="Você não tem permissão para fazer inventário." />;

  return (
    <div className="space-y-4">
      <Titulo sub="Conte o que existe de verdade na prateleira e digite. O sistema lança só as diferenças.">Inventário (ajuste de estoque)</Titulo>


      {lojaEscolhida && (
        <>
          <div className="cartao space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" />
                <input className="campo pl-10" placeholder="Filtrar por nome, SKU ou código de barras" value={termo} onChange={(e) => setTermo(e.target.value)} />
              </div>
              <select className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Todas as categorias</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="self-center text-sm text-suave">Folha para contar no papel:</span>
              <button className="btn-secundario min-h-0 py-1.5 text-xs" onClick={() => folhaDeContagem('pdf')}>
                <FileDown className="h-3.5 w-3.5" /> PDF
              </button>
              <button className="btn-secundario min-h-0 py-1.5 text-xs" onClick={() => folhaDeContagem('xlsx')}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </button>
            </div>
          </div>

          {visiveis.length === 0 ? (
            <Vazio>Nenhum produto encontrado.</Vazio>
          ) : (
            <div className="cartao overflow-x-auto p-0 sm:p-0">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="text-right">Sistema</th>
                    <th className="w-40 text-center">Contado</th>
                    <th className="text-right">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => {
                    const c = contagem[p.id];
                    const dif = c === undefined || c === '' ? null : Number(c) - saldo(p);
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="font-medium">{p.nome}</div>
                          <div className="text-xs text-suave">SKU {p.sku}</div>
                        </td>
                        <td className="tabular text-right">{saldo(p)}</td>
                        <td>
                          <CampoQuantidade
                            valor={c ?? ''}
                            aoMudar={(v) => {
                              setContagem((atual) => ({ ...atual, [p.id]: v }));
                              setSaldoVisto((atual) => (p.id in atual ? atual : { ...atual, [p.id]: saldo(p) }));
                            }}
                          />
                        </td>
                        <td
                          className={`tabular text-right font-semibold ${
                            dif === null ? 'text-neutral-600' : dif === 0 ? 'text-emerald-400' : dif > 0 ? 'text-sky-300' : 'text-rose-400'
                          }`}
                        >
                          {dif === null ? '—' : dif === 0 ? 'OK' : dif > 0 ? `+${dif}` : dif}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="cartao grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Motivo do ajuste" obrigatorio>
              <select className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                {MOTIVOS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Campo>
            {motivo === 'Outro' ? (
              <Campo rotulo="Descreva o motivo" obrigatorio>
                <input className="campo" value={motivoOutro} onChange={(e) => setMotivoOutro(e.target.value)} />
              </Campo>
            ) : (
              <Campo rotulo="Observação (opcional)">
                <input className="campo" value={obs} onChange={(e) => setObs(e.target.value)} />
              </Campo>
            )}
          </div>

          <div className="text-sm text-suave">
            {contados.length} produto(s) contado(s) · <b className="text-white">{diferencas.length}</b> com diferença
          </div>
          <button
            className="btn-principal h-14 w-full text-base"
            disabled={contados.length === 0 || !motivoFinal}
            onClick={() => setConfirmar(true)}
          >
            <ClipboardCheck className="h-5 w-5" /> Conferir e gravar ajuste
          </button>
        </>
      )}

      <Confirmar
        aberto={confirmar}
        titulo="Gravar ajuste de inventário?"
        textoConfirmar={diferencas.length ? 'Sim, ajustar saldos' : 'OK'}
        ocupado={ocupado}
        aoCancelar={() => setConfirmar(false)}
        aoConfirmar={gravar}
      >
        <p className="flex flex-wrap items-center gap-2">
          Loja <LojaTag loja={lojaEscolhida} tamanho="lg" /> — motivo: <b>{motivoFinal}</b>
        </p>
        {diferencas.length === 0 ? (
          <p className="text-emerald-400">Todos os produtos contados batem com o sistema. Nada será alterado.</p>
        ) : (
          <>
            <p>Os saldos abaixo serão corrigidos para a quantidade contada:</p>
            <ul className="max-h-60 overflow-y-auto rounded-lg bg-painel2 p-2 text-xs">
              {diferencas.map((d) => (
                <li key={d.p.id} className="flex justify-between gap-2 py-0.5">
                  <span className="truncate">{d.p.nome}</span>
                  <span className="tabular">
                    {d.sistema} → <b>{d.contado}</b>{' '}
                    <span className={d.contado > d.sistema ? 'text-sky-300' : 'text-rose-400'}>
                      ({d.contado > d.sistema ? '+' : ''}
                      {d.contado - d.sistema})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Confirmar>
    </div>
  );
}
