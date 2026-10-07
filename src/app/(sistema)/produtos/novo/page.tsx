'use client';

import { useEffect, useState } from 'react';
import { ProdutoForm } from '@/components/produto-form';
import { SemPermissao, Titulo } from '@/components/ui';
import { useDados } from '@/lib/dados';
import type { Produto } from '@/lib/tipos';

export default function NovoProduto() {
  const { produtoPorId, pode } = useDados();
  const [base, setBase] = useState<Produto | undefined>();
  const [pronto, setPronto] = useState(false);

  // /produtos/novo?duplicar=12 abre o formulário já preenchido com outro produto
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('duplicar');
    if (id) setBase(produtoPorId(Number(id)));
    setPronto(true);
  }, [produtoPorId]);

  if (!pode('produtos')) return <SemPermissao texto="Você não tem permissão para cadastrar produtos." />;
  if (!pronto) return null;
  return (
    <div className="mx-auto max-w-3xl">
      <Titulo sub={base ? `Copiando os dados de "${base.nome}". Confira e ajuste.` : 'Só o nome é obrigatório. O resto você pode completar depois.'}>
        {base ? 'Duplicar produto' : 'Novo produto'}
      </Titulo>
      <ProdutoForm key={base?.id ?? 'novo'} base={base} />
    </div>
  );
}
