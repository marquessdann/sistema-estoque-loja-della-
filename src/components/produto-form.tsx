'use client';

import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { urlFoto, useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { estoqueNaLoja, lerNumero, UNIDADES } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Produto } from '@/lib/tipos';
import { LojaTag } from './loja';
import { Campo } from './ui';

// Formulário único de cadastro/edição de produto.
export function ProdutoForm({ produto, base }: { produto?: Produto; base?: Produto }) {
  const { lojas, categorias, marcas, categoriaNome, marcaNome, recarregar } = useDados();
  const router = useRouter();
  const origem = produto ?? base; // "base" = produto sendo duplicado

  const [nome, setNome] = useState(base ? `${base.nome} (cópia)` : (produto?.nome ?? ''));
  const [sku, setSku] = useState(produto?.sku ?? '');
  const [ean, setEan] = useState(produto?.ean ?? '');
  const [categoria, setCategoria] = useState(origem ? categoriaNome(origem.categoria_id) : '');
  const [marca, setMarca] = useState(origem ? marcaNome(origem.marca_id) : '');
  const [unidade, setUnidade] = useState(origem?.unidade ?? 'UN');
  const [custo, setCusto] = useState(origem ? String(origem.preco_custo).replace('.', ',') : '');
  const [venda, setVenda] = useState(origem ? String(origem.preco_venda).replace('.', ',') : '');
  const [obs, setObs] = useState(origem?.observacoes ?? '');
  const [mlb, setMlb] = useState(produto?.ml_item_id ?? '');
  const [minimos, setMinimos] = useState<Record<number, string>>(
    Object.fromEntries(lojas.map((l) => [l.id, origem ? String(estoqueNaLoja(origem, l.id).estoque_minimo) : '0'])),
  );
  const [fotoPath, setFotoPath] = useState<string | null>(produto?.foto_path ?? base?.foto_path ?? null);
  const [fotoNova, setFotoNova] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tentou, setTentou] = useState(false);

  const urlLocal = useMemo(() => (fotoNova ? URL.createObjectURL(fotoNova) : null), [fotoNova]);
  useEffect(() => () => void (urlLocal && URL.revokeObjectURL(urlLocal)), [urlLocal]);
  const previa = urlLocal ?? urlFoto(fotoPath);
  const erroNome = tentou && !nome.trim() ? 'Informe o nome do produto' : null;
  const erroCusto = custo.trim() && lerNumero(custo) === null ? 'Valor inválido' : null;
  const erroVenda = venda.trim() && lerNumero(venda) === null ? 'Valor inválido' : null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (!nome.trim() || erroCusto || erroVenda) return toast.error('Confira os campos destacados.');
    setOcupado(true);
    try {
      const sb = supabaseNavegador();
      let caminhoFoto = fotoPath;
      if (fotoNova) {
        const ext = (fotoNova.name.split('.').pop() || 'jpg').toLowerCase();
        caminhoFoto = `${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from('produtos').upload(caminhoFoto, fotoNova, { upsert: true });
        if (error) throw new Error('Não foi possível enviar a foto: ' + error.message);
      }
      const { data, error } = await sb.rpc('salvar_produto', {
        p: {
          id: produto?.id ?? null,
          nome: nome.trim(),
          sku: sku.trim(),
          ean: ean.trim(),
          categoria: categoria.trim(),
          marca: marca.trim(),
          unidade,
          preco_custo: lerNumero(custo) ?? 0,
          preco_venda: lerNumero(venda) ?? 0,
          foto_path: caminhoFoto,
          observacoes: obs,
          ml_item_id: mlb,
          minimos: Object.fromEntries(Object.entries(minimos).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))])),
        },
      });
      if (error) throw error;
      await recarregar();
      toast.success(produto ? 'Produto atualizado!' : 'Produto cadastrado!');
      if (!produto) router.push(`/produtos/${data}`);
      else setFotoNova(null);
    } catch (err) {
      toast.error(mensagemErro(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={salvar} className="cartao space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nome do produto" obrigatorio erro={erroNome} className="col-span-2">
            <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus={!produto} placeholder="Ex.: Pinça Ponta Fina Edel Solingen" />
          </Campo>
          <Campo rotulo="SKU (código interno)" dica={produto ? undefined : 'Deixe vazio para gerar automático'}>
            <input className="campo uppercase" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Automático" />
          </Campo>
          <Campo rotulo="Código de barras (EAN)">
            <input className="campo tabular" inputMode="numeric" value={ean} onChange={(e) => setEan(e.target.value)} placeholder="Bipe ou digite" />
          </Campo>
          <Campo rotulo="Categoria" dica="Escolha ou digite uma nova">
            <input className="campo" list="lista-categorias" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
            <datalist id="lista-categorias">
              {categorias.map((c) => (
                <option key={c.id} value={c.nome} />
              ))}
            </datalist>
          </Campo>
          <Campo rotulo="Marca" dica="Escolha ou digite uma nova">
            <input className="campo" list="lista-marcas" value={marca} onChange={(e) => setMarca(e.target.value)} />
            <datalist id="lista-marcas">
              {marcas.map((c) => (
                <option key={c.id} value={c.nome} />
              ))}
            </datalist>
          </Campo>
        </div>

        <div>
          <span className="rotulo">Foto (opcional)</span>
          <label className="relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-borda bg-painel2 hover:border-dourado/60">
            {previa ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previa} alt="Foto do produto" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-xs text-suave">
                <ImagePlus className="h-6 w-6" /> Adicionar foto
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.size > 5 * 1024 * 1024) return toast.error('Foto muito grande (máximo 5 MB).');
                if (f) setFotoNova(f);
              }}
            />
          </label>
          {previa && (
            <button
              type="button"
              className="btn-fantasma mt-1 w-full text-xs text-rose-400"
              onClick={() => {
                setFotoNova(null);
                setFotoPath(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover foto
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Campo rotulo="Unidade">
          <select className="campo" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
            {[...new Set([...UNIDADES, unidade])].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Preço de custo (R$)" erro={erroCusto}>
          <input className="campo tabular" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00" />
        </Campo>
        <Campo rotulo="Preço de venda (R$)" erro={erroVenda} className="col-span-2 sm:col-span-1">
          <input className="campo tabular" inputMode="decimal" value={venda} onChange={(e) => setVenda(e.target.value)} placeholder="0,00" />
        </Campo>
      </div>

      <div>
        <span className="rotulo">Estoque mínimo por loja</span>
        <p className="mb-2 text-xs text-neutral-500">Quando o saldo ficar abaixo deste número, o sistema mostra um alerta.</p>
        <div className="grid grid-cols-2 gap-3">
          {lojas.map((l) => (
            <div key={l.id} className="rounded-lg border border-borda bg-painel2 p-3">
              <LojaTag loja={l} tamanho="sm" />
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="campo mt-2 tabular"
                value={minimos[l.id] ?? '0'}
                onChange={(e) => setMinimos({ ...minimos, [l.id]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>

      <Campo rotulo="Observações">
        <textarea className="campo min-h-[80px]" value={obs} onChange={(e) => setObs(e.target.value)} />
      </Campo>

      <Campo rotulo="Código do anúncio no Mercado Livre (MLB)" dica="Opcional — reservado para integração futura">
        <input className="campo" value={mlb} onChange={(e) => setMlb(e.target.value)} placeholder="MLB0000000000" />
      </Campo>

      {produto && (
        <p className="text-xs text-neutral-500">
          Custo médio atual: R$ {produto.custo_medio.toFixed(2).replace('.', ',')} (calculado automaticamente pelas entradas
          com nota). Os saldos só mudam por movimentações: entrada, saída, transferência ou inventário.
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secundario" onClick={() => router.back()}>
          Cancelar
        </button>
        <button className="btn-principal sm:min-w-[200px]" disabled={ocupado}>
          {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
          {produto ? 'Salvar alterações' : 'Cadastrar produto'}
        </button>
      </div>
    </form>
  );
}
