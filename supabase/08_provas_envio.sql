-- =====================================================================
--  DELLA — Arquivo 8: PROVA DE ENVIO (QR da etiqueta + 3 fotos)
--
--  Rode DEPOIS do 07. Não apaga nenhum dado. Pode rodar de novo.
--
--  Na expedição, o celular lê o QR Code (ou código de barras) da etiqueta
--  e tira 3 fotos: 1) produto ao lado da caixa, 2) produto dentro da caixa,
--  3) caixa lacrada com a etiqueta. As fotos ficam guardadas (pasta privada
--  "envios") ligadas ao código da etiqueta e, quando o código for o mesmo
--  do nº do pedido lançado na saída, aparecem dentro do pedido.
-- =====================================================================

-- pasta privada das fotos
insert into storage.buckets (id, name, public) values ('envios', 'envios', false) on conflict (id) do nothing;
drop policy if exists "envios_ler" on storage.objects;
drop policy if exists "envios_enviar" on storage.objects;
create policy "envios_ler" on storage.objects for select to authenticated
  using (bucket_id = 'envios' and public.eh_usuario_ativo());
create policy "envios_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'envios' and public.eh_usuario_ativo());

create table if not exists public.provas_envio (
  id          bigserial primary key,
  codigo      text not null,                 -- código lido da etiqueta (nº do envio / pedido)
  loja_id     smallint references public.lojas (id),
  fotos       text[] not null,               -- caminhos na pasta "envios" (1 a 3)
  chave       text unique,                   -- evita gravar 2x se a internet repetir o envio
  usuario_id  uuid references public.usuarios (id) default auth.uid(),
  criado_em   timestamptz not null default now(),
  check (length(codigo) between 1 and 200),
  check (cardinality(fotos) between 1 and 3)
);
create index if not exists provas_envio_codigo_idx on public.provas_envio (codigo);
create index if not exists provas_envio_criado_idx on public.provas_envio (criado_em desc);

alter table public.provas_envio enable row level security;
drop policy if exists ler on public.provas_envio;
-- CEO e gerente veem todas; funcionário vê as que ele registrou
create policy ler on public.provas_envio for select to authenticated
  using (public.eh_usuario_ativo() and (public.eh_admin() or usuario_id = auth.uid()));
revoke all on public.provas_envio from anon, authenticated;
grant select on public.provas_envio to authenticated;

-- Registrar uma prova de envio (quem pode dar baixa pode registrar)
-- p = {"codigo","fotos":["2026/10/abc-1.jpg", ...],"chave"}
create or replace function public.registrar_prova_envio(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_codigo text := nullif(trim(coalesce(p ->> 'codigo', '')), '');
  v_fotos text[];
begin
  perform public.fn_exigir_permissao('saida', 'registrar envio');
  select id into v_id from public.provas_envio where chave = nullif(p ->> 'chave', '');
  if v_id is not null then return v_id; end if;
  if v_codigo is null then raise exception 'Leia o código da etiqueta.'; end if;
  if length(v_codigo) > 200 then raise exception 'Código da etiqueta muito longo.'; end if;
  if jsonb_typeof(p -> 'fotos') <> 'array' then raise exception 'Envie as fotos.'; end if;
  select array_agg(f) into v_fotos from jsonb_array_elements_text(p -> 'fotos') f;
  if coalesce(cardinality(v_fotos), 0) not between 1 and 3 then raise exception 'Envie de 1 a 3 fotos.'; end if;
  if exists (select 1 from unnest(v_fotos) f where f !~ '^[0-9]{4}/[0-9]{2}/[A-Za-z0-9_-]+\.jpg$') then
    raise exception 'Foto inválida.';
  end if;
  insert into public.provas_envio (codigo, loja_id, fotos, chave, usuario_id)
  values (v_codigo, (select loja_atual from public.usuarios where id = auth.uid()), v_fotos,
          nullif(p ->> 'chave', ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Lista com quem registrou e o pedido ligado (mesmo código = nº do pedido da saída)
create or replace view public.vw_provas_envio with (security_invoker = true) as
select pe.id, pe.codigo, pe.fotos, pe.criado_em, pe.usuario_id, coalesce(u.nome, 'Sistema') as usuario_nome,
       pe.loja_id, l.nome as loja_nome,
       (select o.id from public.operacoes o
         where o.tipo = 'saida' and o.numero_pedido = pe.codigo order by o.id desc limit 1) as operacao_id
  from public.provas_envio pe
  left join public.usuarios u on u.id = pe.usuario_id
  left join public.lojas l on l.id = pe.loja_id;
grant select on public.vw_provas_envio to authenticated;
revoke all on public.vw_provas_envio from anon;
revoke insert, update, delete, truncate on public.vw_provas_envio from authenticated;

revoke execute on function public.registrar_prova_envio(jsonb) from public, anon;
grant execute on function public.registrar_prova_envio(jsonb) to authenticated;
