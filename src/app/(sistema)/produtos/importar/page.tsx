'use client';

import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Confirmar, Titulo } from '@/components/ui';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { exportarCSV, exportarExcel, lerPlanilha, type Coluna } from '@/lib/exportar';
import { estoqueNaLoja, lerNumero, normalizar } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Produto } from '@/lib/tipos';

interface LinhaImport {
  sku: string;
  nome: string;
  ean: string;
  categoria: string;
  marca: string;
  unidade: string;
  preco_custo: number | null;
  preco_venda: number | null;
  observacoes: string;
  minimos: Record<string, number>;
  erros: string[];
}

export default function ImportarProdutos() {
  const { produtos, lojas, categoriaNome, marcaNome, recarregar, pode } = useDados();
  const [linhas, setLinhas] = useState<LinhaImport[] | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // Colunas da planilha (as mesmas na exportação, no modelo e na importação)
  const colunas: Coluna<Produto>[] = [
    { titulo: 'SKU', valor: (p) => p.sku, largura: 14 },
    { titulo: 'Nome', valor: (p) => p.nome, largura: 45 },
    { titulo: 'EAN', valor: (p) => p.ean ?? '', largura: 16 },
    { titulo: 'Categoria', valor: (p) => categoriaNome(p.categoria_id), largura: 16 },
    { titulo: 'Marca', valor: (p) => marcaNome(p.marca_id), largura: 16 },
    { titulo: 'Unidade', valor: (p) => p.unidade, largura: 9 },
    { titulo: 'Preço de custo', valor: (p) => p.preco_custo, formato: 'moeda', largura: 14 },
    { titulo: 'Preço de venda', valor: (p) => p.preco_venda, formato: 'moeda', largura: 14 },
    ...lojas.map<Coluna<Produto>>((l) => ({
      titulo: `Mínimo ${l.nome}`,
      valor: (p) => estoqueNaLoja(p, l.id).estoque_minimo,
      formato: 'inteiro',
      largura: 20,
    })),
    ...lojas.map<Coluna<Produto>>((l) => ({
      titulo: `Saldo ${l.nome} (só leitura)`,
      valor: (p) => estoqueNaLoja(p, l.id).saldo,
      formato: 'inteiro',
      largura: 24,
    })),
    { titulo: 'Custo médio (só leitura)', valor: (p) => p.custo_medio, formato: 'moeda', largura: 20 },
    { titulo: 'Observações', valor: (p) => p.observacoes ?? '', largura: 30 },
    { titulo: 'Ativo', valor: (p) => (p.ativo ? 'SIM' : 'NÃO'), largura: 8 },
  ];

  const exemplo: Produto = {
    id: 0,
    sku: '',
    ean: '7890000000000',
    nome: 'Exemplo: Pinça Ponta Fina (apague esta linha)',
    categoria_id: null,
    marca_id: null,
    unidade: 'UN',
    preco_custo: 10,
    preco_venda: 29.9,
    custo_medio: 0,
    foto_path: null,
    observacoes: 'SKU vazio = gerado automaticamente',
    ativo: true,
    ml_item_id: null,
    criado_em: '',
    atualizado_em: '',
    estoques: lojas.map((l) => ({ loja_id: l.id, saldo: 0, estoque_minimo: 5 })),
  };

  async function lerArquivo(arquivo: File) {
    try {
      const brutas = await lerPlanilha(arquivo);
      if (brutas.length === 0) return toast.error('A planilha está vazia.');
      // procura as colunas pelo nome, sem ligar para acentos/maiúsculas
      const pegar = (l: Record<string, string>, ...nomes: string[]) => {
        for (const k of Object.keys(l)) {
          const nk = normalizar(k);
          if (nomes.some((n) => nk === normalizar(n) || nk.startsWith(normalizar(n) + ' ('))) return (l[k] ?? '').trim();
        }
        return '';
      };
      const skusVistos = new Set<string>();
      const resultado = brutas.map<LinhaImport>((l) => {
        const erros: string[] = [];
        const nome = pegar(l, 'Nome', 'Produto', 'Descrição');
        const sku = pegar(l, 'SKU', 'Código').toUpperCase();
        if (!nome) erros.push('Nome vazio');
        if (sku) {
          if (skusVistos.has(sku)) erros.push('SKU repetido na planilha');
          skusVistos.add(sku);
        }
        const custoTxt = pegar(l, 'Preço de custo', 'Custo');
        const vendaTxt = pegar(l, 'Preço de venda', 'Venda', 'Preço');
        const preco_custo = lerNumero(custoTxt);
        const preco_venda = lerNumero(vendaTxt);
        if (custoTxt && preco_custo === null) erros.push('Custo inválido');
        if (vendaTxt && preco_venda === null) erros.push('Venda inválida');
        const minimos: Record<string, number> = {};
        for (const loja of lojas) {
          const t = pegar(l, `Mínimo ${loja.nome}`, `Minimo ${loja.nome}`);
          if (t !== '') {
            const n = lerNumero(t);
            if (n === null || n < 0) erros.push(`Mínimo ${loja.nome} inválido`);
            else minimos[loja.id] = Math.floor(n);
          }
        }
        return {
          sku,
          nome,
          ean: pegar(l, 'EAN', 'Código de barras').replace(/\D/g, ''),
          categoria: pegar(l, 'Categoria'),
          marca: pegar(l, 'Marca'),
          unidade: pegar(l, 'Unidade').toUpperCase(),
          preco_custo,
          preco_venda,
          observacoes: pegar(l, 'Observações', 'Observacoes', 'Obs'),
          minimos,
          erros,
        };
      });
      setLinhas(resultado);
      setNomeArquivo(arquivo.name);
    } catch (e) {
      toast.error('Não foi possível ler a planilha: ' + mensagemErro(e));
    }
  }

  const comErro = linhas?.filter((l) => l.erros.length) ?? [];
  const existentes = new Set(produtos.map((p) => p.sku));

  async function importar() {
    if (!linhas) return;
    setOcupado(true);
    const payload = linhas.map(({ erros: _e, ...l }) => ({
      ...l,
      // células vazias não apagam o que já está cadastrado
      ...(l.preco_custo === null ? {} : { preco_custo: l.preco_custo }),
      ...(l.preco_venda === null ? {} : { preco_venda: l.preco_venda }),
    }));
    // para produtos existentes, completa campos vazios com os dados atuais
    const completo = payload.map((l) => {
      const atual = produtos.find((p) => (l.sku && p.sku === l.sku) || (!l.sku && l.ean && p.ean === l.ean));
      if (!atual) return l;
      return {
        ...l,
        ean: l.ean || atual.ean || '',
        unidade: l.unidade || atual.unidade,
        categoria: l.categoria || categoriaNome(atual.categoria_id),
        marca: l.marca || marcaNome(atual.marca_id),
        preco_custo: l.preco_custo ?? atual.preco_custo,
        preco_venda: l.preco_venda ?? atual.preco_venda,
        observacoes: l.observacoes || atual.observacoes || '',
        foto_path: atual.foto_path,
        ml_item_id: atual.ml_item_id,
      };
    });
    const { data, error } = await supabaseNavegador().rpc('importar_produtos', { p_linhas: completo });
    setOcupado(false);
    setConfirmar(false);
    if (error) return toast.error(mensagemErro(error));
    await recarregar();
    toast.success(`Importação concluída: ${data.novos} novo(s) e ${data.alterados} atualizado(s).`);
    setLinhas(null);
  }

  return (
    <div className="space-y-5">
      <Titulo sub="Cadastre ou atualize muitos produtos de uma vez usando uma planilha (Excel ou CSV).">
        Importar / Exportar produtos
      </Titulo>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="cartao space-y-3">
          <h2 className="font-titulo font-bold">1. Exportar</h2>
          <p className="text-sm text-suave">Baixe todos os produtos cadastrados (com saldos e mínimos).</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secundario" onClick={() => exportarExcel('produtos', [{ nome: 'Produtos', colunas, linhas: produtos }])}>
              <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
            </button>
            <button className="btn-secundario" onClick={() => exportarCSV('produtos', colunas, produtos)}>
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
          <button
            className="btn-fantasma text-dourado"
            onClick={() => exportarExcel('modelo-importacao-produtos', [{ nome: 'Produtos', colunas, linhas: [exemplo] }])}
          >
            <Download className="h-4 w-4" /> Baixar planilha modelo (vazia)
          </button>
        </div>

        {pode('produtos') ? (
        <div className="cartao space-y-3">
          <h2 className="font-titulo font-bold">2. Importar</h2>
          <ul className="list-inside list-disc text-sm text-suave">
            <li>Produto com SKU (ou EAN) já cadastrado é <b>atualizado</b>; senão, é <b>criado</b>.</li>
            <li>Colunas &quot;só leitura&quot; (saldos) são ignoradas: saldo só muda por movimentação.</li>
            <li>Para lançar o estoque inicial, use a tela <b>Inventário</b>.</li>
          </ul>
          <label className="btn-principal cursor-pointer">
            <Upload className="h-4 w-4" /> Escolher planilha
            <input
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) lerArquivo(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        ) : (
          <div className="cartao text-sm text-suave">🔒 Importar planilha exige permissão para cadastrar produtos.</div>
        )}
      </div>

      {linhas && (
        <div className="cartao space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-titulo font-bold">Prévia: {nomeArquivo}</h2>
              <p className="text-sm text-suave">
                {linhas.length} linha(s) ·{' '}
                {linhas.filter((l) => l.sku && existentes.has(l.sku)).length} atualização(ões) ·{' '}
                {comErro.length ? <span className="text-rose-400">{comErro.length} com erro</span> : 'nenhum erro'}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-secundario" onClick={() => setLinhas(null)}>
                Cancelar
              </button>
              <button className="btn-principal" disabled={comErro.length > 0 || ocupado} onClick={() => setConfirmar(true)}>
                {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} Importar {linhas.length} produto(s)
              </button>
            </div>
          </div>
          {comErro.length > 0 && (
            <p className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-300">
              Corrija as linhas com erro na planilha e envie de novo. Nada foi gravado ainda.
            </p>
          )}
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-borda">
            <table className="tabela">
              <thead className="sticky top-0 bg-painel">
                <tr>
                  <th>Linha</th>
                  <th>Situação</th>
                  <th>SKU</th>
                  <th>Nome</th>
                  <th>EAN</th>
                  <th>Categoria</th>
                  <th className="text-right">Custo</th>
                  <th className="text-right">Venda</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i} className={l.erros.length ? 'bg-rose-500/10' : ''}>
                    <td className="text-suave">{i + 2}</td>
                    <td className="whitespace-nowrap text-xs">
                      {l.erros.length ? (
                        <span className="text-rose-400">{l.erros.join(', ')}</span>
                      ) : l.sku && existentes.has(l.sku) ? (
                        <span className="text-sky-300">Atualizar</span>
                      ) : (
                        <span className="text-emerald-400">Novo</span>
                      )}
                    </td>
                    <td>{l.sku || <span className="text-suave">auto</span>}</td>
                    <td>{l.nome}</td>
                    <td>{l.ean}</td>
                    <td>{l.categoria}</td>
                    <td className="tabular text-right">{l.preco_custo ?? ''}</td>
                    <td className="tabular text-right">{l.preco_venda ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Confirmar
        aberto={confirmar}
        titulo="Confirmar importação?"
        textoConfirmar="Sim, importar"
        ocupado={ocupado}
        aoCancelar={() => setConfirmar(false)}
        aoConfirmar={importar}
      >
        <p>
          Serão gravados <b>{linhas?.length}</b> produto(s). Se alguma linha der problema, <b>nada</b> é gravado e o sistema
          avisa qual linha corrigir.
        </p>
      </Confirmar>
    </div>
  );
}
