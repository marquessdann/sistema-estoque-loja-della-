'use client';

import { ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import { ListaOperacoes } from '@/components/operacoes';
import { Titulo } from '@/components/ui';

export default function HistoricoTransferencias() {
  return (
    <div>
      <Titulo
        sub="Todas as transferências entre DELLA ESTOQUE e DELLA FULL ML, com quem fez e quando."
        acoes={
          <Link href="/transferencia" className="btn-azul">
            <ArrowLeftRight className="h-4 w-4" /> Nova transferência
          </Link>
        }
      >
        Histórico de transferências
      </Titulo>
      <ListaOperacoes tipoFixo="transferencia" />
    </div>
  );
}
