-- =====================================================================
--  DELLA — Arquivo 13: PRAZO DO MERCADO LIVRE FULL (contagem regressiva)
--
--  Rode depois dos anteriores. Não apaga nenhum dado. Pode rodar de novo.
--
--  No FULL a mercadoria tem um prazo (60 dias) para vender antes de começar
--  a pagar armazenagem. Cada envio para o FULL vira um "lote" com data de
--  início e prazo. O site mostra a contagem e avisa todo mundo:
--  toda segunda-feira, a cada 15 dias e faltando 15, 10, 5, 2 e 1 dia.
--  Só o CEO cria, edita e encerra lotes. Todos veem os avisos.
-- =====================================================================

create table if not exists public.lotes_full (
  id           bigserial primary key,
  nome         text not null,
  inicio       timestamptz not null,
  dias         int not null default 60,
  observacao   text,
  encerrado_em timestamptz,                   -- vendeu tudo / retirou: para de avisar
  criado_por   uuid references public.usuarios (id) default auth.uid(),
  criado_em    timestamptz not null default now(),
  check (length(trim(nome)) between 1 and 80),
  check (dias between 1 and 365)
);

-- quem já viu cada aviso (cada aviso aparece 1 vez por pessoa)
create table if not exists public.avisos_full_vistos (
  usuario_id uuid not null references public.usuarios (id) default auth.uid(),
  lote_id    bigint not null references public.lotes_full (id) on delete cascade,
  aviso      text not null,                   -- ex.: 'seg-2026-10-19', 'quinzena-1', 'critico-5'
  visto_em   timestamptz not null default now(),
  primary key (usuario_id, lote_id, aviso),
  check (length(aviso) between 1 and 40)
);

alter table public.lotes_full enable row level security;
alter table public.avisos_full_vistos enable row level security;
drop policy if exists ler on public.lotes_full;
create policy ler on public.lotes_full for select to authenticated using (public.eh_usuario_ativo());
drop policy if exists ler on public.avisos_full_vistos;
create policy ler on public.avisos_full_vistos for select to authenticated
  using (public.eh_usuario_ativo() and usuario_id = auth.uid());
revoke all on public.lotes_full, public.avisos_full_vistos from anon, authenticated;
grant select on public.lotes_full, public.avisos_full_vistos to authenticated;

drop trigger if exists auditar_lotes_full on public.lotes_full;
create trigger auditar_lotes_full after insert or update or delete on public.lotes_full
  for each row execute function public.fn_auditar();

-- Criar / editar / encerrar / reabrir um lote (só o CEO)
-- p = {"id"?, "nome", "inicio", "dias", "observacao", "encerrar"?: true|false}
create or replace function public.salvar_lote_full(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint;
  v_nome text := nullif(trim(coalesce(p ->> 'nome', '')), '');
  v_inicio timestamptz := nullif(p ->> 'inicio', '')::timestamptz;
  v_dias int := coalesce(nullif(p ->> 'dias', '')::int, 60);
  v_obs text := nullif(trim(coalesce(p ->> 'observacao', '')), '');
begin
  perform public.fn_exigir_ceo();
  if v_id is not null and p ? 'encerrar' and not (p ? 'nome') then
    update public.lotes_full
       set encerrado_em = case when (p ->> 'encerrar')::boolean then now() else null end
     where id = v_id;
    if not found then raise exception 'Lote não encontrado.'; end if;
    return v_id;
  end if;
  if v_nome is null then raise exception 'Dê um nome ao lote (ex.: Envio 16/10).'; end if;
  if v_inicio is null then raise exception 'Informe a data e a hora de início.'; end if;
  if v_dias not between 1 and 365 then raise exception 'O prazo deve ser de 1 a 365 dias.'; end if;
  if v_id is null then
    insert into public.lotes_full (nome, inicio, dias, observacao) values (v_nome, v_inicio, v_dias, v_obs)
    returning id into v_id;
  else
    update public.lotes_full set nome = v_nome, inicio = v_inicio, dias = v_dias, observacao = v_obs where id = v_id;
    if not found then raise exception 'Lote não encontrado.'; end if;
  end if;
  return v_id;
end $$;

-- Apagar um lote criado por engano (só o CEO)
create or replace function public.excluir_lote_full(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_ceo();
  delete from public.lotes_full where id = p_id;
  if not found then raise exception 'Lote não encontrado.'; end if;
end $$;

-- Marcar avisos como vistos pelo usuário logado: p = [{"lote_id", "aviso"}, ...]
create or replace function public.marcar_avisos_full(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_usuario_ativo() then raise exception 'Usuário inativo.'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 50 then raise exception 'Lista de avisos inválida.'; end if;
  insert into public.avisos_full_vistos (usuario_id, lote_id, aviso)
  select auth.uid(), (a ->> 'lote_id')::bigint, left(a ->> 'aviso', 40)
    from jsonb_array_elements(p) a
    join public.lotes_full l on l.id = (a ->> 'lote_id')::bigint
  on conflict do nothing;
end $$;

revoke execute on function public.salvar_lote_full(jsonb), public.excluir_lote_full(bigint), public.marcar_avisos_full(jsonb)
  from public, anon;
grant execute on function public.salvar_lote_full(jsonb), public.excluir_lote_full(bigint), public.marcar_avisos_full(jsonb)
  to authenticated;
