'use client';

import { ListaOperacoes } from '@/components/operacoes';
import { Titulo } from '@/components/ui';

export default function Movimentacoes() {
  return (
    <div>
      <Titulo sub="Todo o histórico (livro-razão): entradas, saídas, ajustes, transferências e estornos. Toque num lançamento para ver os detalhes ou estornar.">
        Movimentações
      </Titulo>
      <ListaOperacoes />
    </div>
  );
}
