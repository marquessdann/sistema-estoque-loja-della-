'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { eanValido, lerNumero, UNIDADES } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import { Campo, CampoQuantidade, Modal } from './ui';

// Cadastro rápido de um produto que ainda não existe, direto da tela de Entrada.
// Grava pelo mesmo caminho do cadastro completo (o banco confere SKU, EAN e permissão)
// e devolve o produto já com a quantidade e o custo desta entrada.
export function ProdutoRapido({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoCriar: (produtoId: number, quantidade: number, custo: number | '') => void;
}) {
  const { categorias, marcas, recarregar } = useDados();
  const [nome, setNome] = useState('');
  const [sku, setSku] = useState('');
  const [ean, setEan] = useState('');
  const [grupo, setGrupo] = useState('');
  const [marca, setMarca] = useState('');
  const [unidade, setUnidade] = useState('UN');
  const [custo, setCusto] = useState('');
  const [venda, setVenda] = useState('');
  const [quantidade, setQuantidade] = useState<number | ''>(1);
  const [ocupado, setOcupado] = useState(false);

  const eanLimpo = ean.replace(/\s/g, '');
  const erroEan = eanLimpo && !eanValido(eanLimpo) ? 'Código inválido: confira os números' : null;
  const erroSku = sku.trim() && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(sku.trim()) ? 'Use só letras, números, ponto, hífen ou barra' : null;
  const erroCusto = custo.trim() && lerNumero(custo) === null ? 'Valor inválido' : null;
  const erroVenda = venda.trim() && lerNumero(venda) === null ? 'Valor inválido' : null;

  function limpar() {
    setNome('');
    setSku('');
    setEan('');
    setCusto('');
    setVenda('');
    setQuantidade(1);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return toast.error('Informe o nome do produto.');
    if (!quantidade || quantidade < 1) return toast.error('Informe a quantidade que está entrando.');
    if (erroEan || erroSku || erroCusto || erroVenda) return toast.error('Confira os campos destacados.');
    setOcupado(true);
    try {
      const { data, error } = await supabaseNavegador().rpc('salvar_produto', {
        p: {
          nome: nome.trim(),
          sku: sku.trim(),
          ean: eanLimpo,
          categoria: grupo.trim(),
          marca: marca.trim(),
          unidade,
          preco_custo: lerNumero(custo) ?? 0,
          preco_venda: lerNumero(venda) ?? 0,
        },
      });
      if (error) throw error;
      await recarregar();
      aoCriar(Number(data), Number(quantidade), custo.trim() ? (lerNumero(custo) ?? '') : '');
      toast.success('Produto cadastrado e adicionado à entrada.');
      limpar();
      aoFechar();
    } catch (err) {
      toast.error(mensagemErro(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Produto novo nesta entrada" largura="max-w-xl">
      <form onSubmit={salvar} className="space-y-3">
        <Campo rotulo="Nome do produto" obrigatorio>
          <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="Ex.: Pinça Ponta Curva Solingen" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="SKU" erro={erroSku} dica="Vazio = gerado automático">
            <input className="campo uppercase" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Automático" />
          </Campo>
          <Campo rotulo="Código de barras (EAN)" erro={erroEan}>
            <input className="campo tabular" inputMode="numeric" value={ean} onChange={(e) => setEan(e.target.value)} placeholder="Bipe ou digite" />
          </Campo>
          <Campo rotulo="Grupo (categoria)" dica="Escolha ou digite um novo">
            <input className="campo" list="rapido-grupos" value={grupo} onChange={(e) => setGrupo(e.target.value)} placeholder="Ex.: Depilação" />
            <datalist id="rapido-grupos">
              {categorias.map((c) => (
                <option key={c.id} value={c.nome} />
              ))}
            </datalist>
          </Campo>
          <Campo rotulo="Marca">
            <input className="campo" list="rapido-marcas" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Ex.: Solingen" />
            <datalist id="rapido-marcas">
              {marcas.map((c) => (
                <option key={c.id} value={c.nome} />
              ))}
            </datalist>
          </Campo>
          <Campo rotulo="Custo unitário (R$)" erro={erroCusto}>
            <input className="campo tabular" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00" />
          </Campo>
          <Campo rotulo="Preço de venda (R$)" erro={erroVenda}>
            <input className="campo tabular" inputMode="decimal" value={venda} onChange={(e) => setVenda(e.target.value)} placeholder="0,00" />
          </Campo>
          <Campo rotulo="Unidade">
            <select className="campo" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Quantidade que está entrando" obrigatorio>
            <CampoQuantidade valor={quantidade} min={1} aoMudar={setQuantidade} />
          </Campo>
        </div>
        <p className="text-xs text-suave">
          NCM, CEST, foto e estoque mínimo você completa depois, na tela do produto (menu Produtos).
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-principal" disabled={ocupado}>
            {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} Cadastrar e adicionar
          </button>
        </div>
      </form>
    </Modal>
  );
}
