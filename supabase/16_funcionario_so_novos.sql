-- =====================================================================
--  DELLA — Arquivo 16: FUNCIONÁRIO SÓ CADASTRA PRODUTO NOVO
--
--  Rode depois do 15. Não apaga nenhum dado. Pode rodar de novo.
--
--  O funcionário cadastra produtos e kits NOVOS, mas não edita os que já
--  existem. Ele só pode corrigir um produto que ele mesmo cadastrou e que
--  ainda não teve nenhuma movimentação (ex.: errou o nome logo depois de criar).
--  CEO e gerente continuam editando tudo.
-- =====================================================================

create or replace function public.fn_exigir_pode_editar_produto(p_id bigint)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if (select cargo from public.usuarios where id = auth.uid()) = 'funcionario'
     and not exists (select 1 from public.produtos p
                      where p.id = p_id and p.criado_por = auth.uid()
                        and not exists (select 1 from public.movimentacoes m where m.produto_id = p.id)) then
    raise exception 'Você pode cadastrar produtos novos, mas não editar os que já existem. Peça ao CEO ou ao gerente.';
  end if;
end $$;
revoke execute on function public.fn_exigir_pode_editar_produto(bigint) from public, anon, authenticated;

create or replace function public.salvar_produto(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_ncm text := nullif(regexp_replace(coalesce(p ->> 'ncm', ''), '\D', '', 'g'), '');
  v_cest text := nullif(regexp_replace(coalesce(p ->> 'cest', ''), '\D', '', 'g'), '');
  v_origem smallint := nullif(left(trim(coalesce(p ->> 'origem_fiscal', '')), 1), '')::smallint;
  v_cod text := nullif(trim(coalesce(p ->> 'codigo_fornecedor', '')), '');
begin
  perform public.fn_exigir_permissao('produtos', 'cadastrar ou editar produtos');
  if nullif(p ->> 'id', '') is not null then perform public.fn_exigir_pode_editar_produto((p ->> 'id')::bigint); end if;
  if v_ncm is not null and length(v_ncm) <> 8 then raise exception 'NCM inválido: são 8 números (ex.: 8203.20.90).'; end if;
  if v_cest is not null and length(v_cest) <> 7 then raise exception 'CEST inválido: são 7 números (ex.: 20.053.00).'; end if;
  if v_origem is not null and v_origem > 8 then raise exception 'Origem inválida (0 a 8).'; end if;
  if length(coalesce(v_cod, '')) > 60 then raise exception 'Código do fornecedor muito longo.'; end if;
  v_id := public.salvar_produto_interno(p);
  -- só mexe no campo que veio no pacote (quem não manda NCM não apaga o NCM)
  update public.produtos
     set codigo_fornecedor = case when p ? 'codigo_fornecedor' then v_cod else codigo_fornecedor end,
         ncm = case when p ? 'ncm' then v_ncm else ncm end,
         cest = case when p ? 'cest' then v_cest else cest end,
         origem_fiscal = case when p ? 'origem_fiscal' then v_origem else origem_fiscal end
   where id = v_id
     and (codigo_fornecedor, ncm, cest, origem_fiscal) is distinct from (
           case when p ? 'codigo_fornecedor' then v_cod else codigo_fornecedor end,
           case when p ? 'ncm' then v_ncm else ncm end,
           case when p ? 'cest' then v_cest else cest end,
           case when p ? 'origem_fiscal' then v_origem else origem_fiscal end);
  return v_id;
end $$;

-- montar/alterar a composição de um kit também é editar o kit
create or replace function public.fn_kit_itens_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_pode_editar_produto(coalesce(new.kit_id, old.kit_id));
  return coalesce(new, old);
end $$;
revoke execute on function public.fn_kit_itens_guarda() from public, anon, authenticated;
drop trigger if exists kit_itens_guarda on public.kit_itens;
create trigger kit_itens_guarda before insert or update or delete on public.kit_itens
  for each row execute function public.fn_kit_itens_guarda();
