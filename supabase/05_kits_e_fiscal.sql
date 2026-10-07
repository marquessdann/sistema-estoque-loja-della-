-- =====================================================================
--  DELLA — Arquivo 5: KITS E DADOS FISCAIS DOS PRODUTOS
--
--  Rode DEPOIS do 04. Não apaga nenhum dado.
--
--  * Produto ganha: código do fornecedor, NCM, CEST e origem (0 nacional,
--    2 estrangeira adquirida no mercado interno...).
--  * KIT: um produto "virtual" formado por outros produtos (ex.: Kit 3 Pinças).
--    O kit não tem estoque próprio: dar baixa (ou transferir) 1 kit tira cada
--    componente do estoque, na quantidade da composição. Quantos kits dá para
--    montar = o componente que acabar primeiro.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Dados fiscais e do fornecedor
-- ---------------------------------------------------------------------
alter table public.produtos
  add column if not exists codigo_fornecedor text,
  add column if not exists ncm text,
  add column if not exists cest text,
  add column if not exists origem_fiscal smallint,
  add column if not exists eh_kit boolean not null default false;
do $$ begin
  alter table public.produtos add constraint produtos_ncm_valido check (ncm ~ '^\d{8}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.produtos add constraint produtos_cest_valido check (cest ~ '^\d{7}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.produtos add constraint produtos_origem_valida check (origem_fiscal between 0 and 8);
exception when duplicate_object then null; end $$;
create index if not exists produtos_cod_fornecedor_idx on public.produtos (codigo_fornecedor);

-- salvar_produto passa a gravar também os campos fiscais (a função antiga vira "interna")
do $$ begin
  if to_regprocedure('public.salvar_produto_interno(jsonb)') is null then
    alter function public.salvar_produto(jsonb) rename to salvar_produto_interno;
  end if;
end $$;

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

-- ---------------------------------------------------------------------
-- 2. Kits
-- ---------------------------------------------------------------------
create table if not exists public.kit_itens (
  kit_id      bigint not null references public.produtos (id) on delete cascade,
  produto_id  bigint not null references public.produtos (id) on delete restrict,
  quantidade  int not null check (quantidade between 1 and 1000),
  primary key (kit_id, produto_id),
  check (kit_id <> produto_id)
);
create index if not exists kit_itens_produto_idx on public.kit_itens (produto_id);
alter table public.kit_itens enable row level security;
drop policy if exists ler on public.kit_itens;
create policy ler on public.kit_itens for select to authenticated using (public.eh_usuario_ativo());
revoke all on public.kit_itens from anon, authenticated;
grant select on public.kit_itens to authenticated;

-- Define a composição de um kit (lista vazia = deixa de ser kit)
create or replace function public.salvar_kit(p_kit bigint, p_itens jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
begin
  perform public.fn_exigir_permissao('produtos', 'montar kits');
  select nome into v_nome from public.produtos where id = p_kit for update;
  if v_nome is null then raise exception 'Produto não encontrado.'; end if;
  if jsonb_typeof(coalesce(p_itens, '[]')) <> 'array' then raise exception 'Lista de componentes inválida.'; end if;

  if jsonb_array_length(coalesce(p_itens, '[]')) > 0 then
    if exists (select 1 from public.produto_loja where produto_id = p_kit and saldo <> 0)
       or exists (select 1 from public.movimentacoes where produto_id = p_kit) then
      raise exception '"%" já tem estoque ou histórico próprio e não pode virar kit. Cadastre o kit como um produto novo.', v_nome;
    end if;
    if exists (select 1 from public.kit_itens where produto_id = p_kit) then
      raise exception '"%" é componente de outro kit e não pode ser um kit.', v_nome;
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_itens) e
       where jsonb_typeof(e -> 'quantidade') <> 'number'
          or (e ->> 'quantidade')::numeric <> trunc((e ->> 'quantidade')::numeric)
          or (e ->> 'quantidade')::numeric not between 1 and 1000) then
      raise exception 'A quantidade de cada componente deve ser um número inteiro de 1 a 1000.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_itens) e
       where not exists (select 1 from public.produtos p where p.id = (e ->> 'produto_id')::bigint and p.ativo and not p.eh_kit)) then
      raise exception 'Componente inválido: escolha produtos ativos que não sejam kits.';
    end if;
    if exists (select 1 from jsonb_array_elements(p_itens) e where (e ->> 'produto_id')::bigint = p_kit) then
      raise exception 'O kit não pode ser componente dele mesmo.';
    end if;
  end if;

  delete from public.kit_itens where kit_id = p_kit;
  insert into public.kit_itens (kit_id, produto_id, quantidade)
  select p_kit, (e ->> 'produto_id')::bigint, sum((e ->> 'quantidade')::int)
    from jsonb_array_elements(coalesce(p_itens, '[]')) e
   group by 1, 2;
  update public.produtos set eh_kit = exists (select 1 from public.kit_itens where kit_id = p_kit) where id = p_kit;
end $$;

-- Troca cada kit da lista pelos seus componentes (quantidade x composição)
create or replace function public.fn_expandir_kits(p_itens jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  -- valida primeiro (quantidades inteiras, produtos ativos)
  perform 1 from public.fn_ler_itens(p_itens);
  select jsonb_agg(x) into v from (
    select jsonb_build_object('produto_id', i.produto_id, 'quantidade', i.quantidade, 'custo_unitario', i.custo_unitario) as x
      from public.fn_ler_itens(p_itens) i
      join public.produtos p on p.id = i.produto_id
     where not p.eh_kit
    union all
    select jsonb_build_object('produto_id', k.produto_id, 'quantidade', i.quantidade * k.quantidade)
      from public.fn_ler_itens(p_itens) i
      join public.produtos p on p.id = i.produto_id and p.eh_kit
      join public.kit_itens k on k.kit_id = p.id
  ) t;
  if v is null then raise exception 'Kit sem componentes: monte a composição do kit antes de usar.'; end if;
  return v;
end $$;

-- Texto "Kit 3 Pinças x2" para a observação do lançamento
create or replace function public.fn_descrever_kits(p_itens jsonb)
returns text language sql stable security definer set search_path = public as $$
  select string_agg(p.nome || ' x' || i.quantidade, ', ' order by p.nome)
    from public.fn_ler_itens(p_itens) i join public.produtos p on p.id = i.produto_id and p.eh_kit;
$$;

-- Kit nunca tem saldo próprio: o banco recusa qualquer movimento direto nele
create or replace function public.fn_kit_sem_estoque()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.produtos where id = new.produto_id and eh_kit) then
    raise exception 'Kit não tem estoque próprio: lance os produtos que formam o kit.';
  end if;
  return new;
end $$;
drop trigger if exists kit_sem_estoque on public.movimentacoes;
create trigger kit_sem_estoque before insert on public.movimentacoes
  for each row execute function public.fn_kit_sem_estoque();

-- Saída: aceita kits (baixa nos componentes) e anota o kit na observação
do $$ begin
  if to_regprocedure('public.registrar_saida_componentes(jsonb)') is null then
    alter function public.registrar_saida(jsonb) rename to registrar_saida_componentes;
  end if;
  if to_regprocedure('public.registrar_transferencia_componentes(jsonb)') is null then
    alter function public.registrar_transferencia(jsonb) rename to registrar_transferencia_componentes;
  end if;
end $$;

create or replace function public.fn_trocar_kits(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_kits text := public.fn_descrever_kits(p -> 'itens');
begin
  if v_kits is null then return p; end if;
  return p || jsonb_build_object(
    'itens', public.fn_expandir_kits(p -> 'itens'),
    'observacao', concat_ws(' · ', 'Kit: ' || v_kits, nullif(trim(coalesce(p ->> 'observacao', '')), '')));
end $$;

create or replace function public.registrar_saida(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_permissao('saida', 'dar baixa (saída)');
  return public.registrar_saida_componentes(public.fn_trocar_kits(p));
end $$;

create or replace function public.registrar_transferencia(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_permissao('transferir', 'transferir entre estoques');
  return public.registrar_transferencia_componentes(public.fn_trocar_kits(p));
end $$;

-- permissões das funções
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.eh_usuario_ativo(), public.eh_admin(), public.eh_ceo(), public.tem_permissao(text),
  public.cnpj_valido(text), public.chave_nfe_valida(text), public.ean_valido(text),
  public.registrar_entrada(jsonb), public.registrar_saida(jsonb), public.registrar_ajuste(jsonb),
  public.estornar_operacao(bigint, text),
  public.registrar_transferencia(jsonb), public.estornar_transferencia(bigint, text),
  public.salvar_produto(jsonb), public.definir_produto_ativo(bigint, boolean), public.excluir_produto(bigint),
  public.salvar_kit(bigint, jsonb),
  public.importar_produtos(jsonb), public.salvar_loja(jsonb), public.registrar_login(),
  public.entrar_loja(smallint, text), public.sair_loja(), public.definir_senha_loja(smallint, text)
to authenticated;
