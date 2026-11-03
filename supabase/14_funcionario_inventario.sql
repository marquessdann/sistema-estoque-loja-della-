-- =====================================================================
--  DELLA — Arquivo 14: FUNCIONÁRIO TAMBÉM FAZ INVENTÁRIO (auditoria)
--
--  Rode depois dos anteriores. Não apaga nenhum dado. Pode rodar de novo.
--
--  O funcionário passa a poder contar o estoque e corrigir as quantidades
--  pela tela Inventário (ajuste com motivo, fica no histórico e no log).
--  Continua sem: entrada, estorno, cadastro de produtos, relatórios e log.
-- =====================================================================

create or replace function public.tem_permissao(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when u.cargo in ('ceo', 'gerente') then true
      else p in ('saida', 'transferir', 'inventario')   -- funcionário: baixa, transferência e inventário
    end
    from public.usuarios u where u.id = auth.uid() and u.ativo), false);
$$;
