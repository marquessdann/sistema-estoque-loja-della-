-- =====================================================================
--  DELLA — Arquivo 15: FUNCIONÁRIO CADASTRA PRODUTO E DÁ ENTRADA
--
--  Rode depois dos anteriores. Não apaga nenhum dado. Pode rodar de novo.
--
--  O funcionário passa a poder cadastrar/editar produtos e dar entrada
--  (SKU, nome e quantidade). Continua sem: inativar/excluir produto,
--  estorno, relatórios, log, usuários e configurações.
-- =====================================================================

create or replace function public.tem_permissao(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when u.cargo in ('ceo', 'gerente') then true
      else p in ('saida', 'transferir', 'inventario', 'produtos', 'entrada')
    end
    from public.usuarios u where u.id = auth.uid() and u.ativo), false);
$$;
