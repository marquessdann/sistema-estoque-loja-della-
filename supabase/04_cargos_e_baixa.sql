-- =====================================================================
--  DELLA — Arquivo 4: CARGOS (CEO, GERENTE, FUNCIONÁRIO) E PEDIDOS NA ENTRADA/SAÍDA
--
--  Rode DEPOIS do 03. Não apaga nenhum dado.
--
--  Cargos fixos (sem caixinhas de permissão):
--   * CEO ......... tudo: usuários, senhas dos estoques, lojas, configurações,
--                   excluir produto, exportar tudo, log, e toda a operação.
--   * GERENTE ..... toda a operação e autoriza correções: cadastrar/editar e
--                   inativar produto, entrada, saída, transferência, inventário,
--                   ESTORNO, relatórios, histórico e log de atividades.
--                   NÃO mexe em usuários, senhas dos estoques, lojas e configurações.
--   * FUNCIONÁRIO . o básico: entrar nos estoques (com a senha), transferir e
--                   dar BAIXA (saída). Vê só os lançamentos que ele mesmo fez.
--
--  Entrada e saída ganham nº do pedido, nº da NF, cliente, plataforma
--  (Mercado Livre / TikTok Shop) e data e hora.
-- =====================================================================

alter table public.usuarios add column if not exists cargo text;

-- quem já existe: o administrador mais antigo vira CEO, os outros admins viram gerente
update public.usuarios set cargo = 'funcionario' where cargo is null and perfil = 'operador';
update public.usuarios set cargo = 'ceo'
 where cargo is null and id = (select id from public.usuarios where perfil = 'admin' order by criado_em limit 1);
update public.usuarios set cargo = 'gerente' where cargo is null;

alter table public.usuarios alter column cargo set default 'funcionario';
alter table public.usuarios alter column cargo set not null;
do $$ begin
  alter table public.usuarios add constraint usuarios_cargo_valido check (cargo in ('ceo', 'gerente', 'funcionario'));
exception when duplicate_object then null; end $$;

-- "perfil" acompanha o cargo (o restante do sistema usa admin/operador)
create or replace function public.fn_usuario_cargo()
returns trigger language plpgsql as $$
begin
  new.perfil := case when new.cargo in ('ceo', 'gerente') then 'admin' else 'operador' end::public.perfil_usuario;
  return new;
end $$;
drop trigger if exists usuario_cargo on public.usuarios;
create trigger usuario_cargo before insert or update on public.usuarios
  for each row execute function public.fn_usuario_cargo();
update public.usuarios set cargo = cargo;  -- alinha o perfil de quem já existe

create or replace function public.eh_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and ativo and cargo = 'ceo');
$$;

create or replace function public.fn_exigir_ceo()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_ceo() then
    raise exception 'Somente o CEO pode fazer isso.';
  end if;
end $$;

-- O que cada cargo pode fazer (conferido em toda função de gravação)
create or replace function public.tem_permissao(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when u.cargo in ('ceo', 'gerente') then true
      else p in ('saida', 'transferir')            -- funcionário: só baixa e transferência
    end
    from public.usuarios u where u.id = auth.uid() and u.ativo), false);
$$;

-- Histórico: funcionário vê só o que ele lançou
drop policy if exists ler on public.operacoes;
drop policy if exists ler on public.movimentacoes;
create policy ler on public.operacoes for select to authenticated
  using (public.eh_usuario_ativo() and (public.eh_admin() or usuario_id = auth.uid()));
create policy ler on public.movimentacoes for select to authenticated
  using (public.eh_usuario_ativo() and (public.eh_admin() or usuario_id = auth.uid()));

-- Regras dos usuários: sempre 1 CEO ativo; limite de 3 ativos
create or replace function public.fn_usuarios_regras()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ativo and (tg_op = 'INSERT' or not old.ativo) then
    if (select count(*) from public.usuarios where ativo and id <> new.id) >= 3 then
      raise exception 'Limite de 3 usuários atingido. Desative um usuário antes de cadastrar outro.';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.cargo = 'ceo' and old.ativo and (new.cargo <> 'ceo' or not new.ativo)
     and not exists (select 1 from public.usuarios where id <> new.id and cargo = 'ceo' and ativo) then
    raise exception 'O sistema precisa de um CEO ativo.';
  end if;
  return new;
end $$;

-- Login novo: o 1º usuário é o CEO; os demais começam como funcionário
create or replace function public.fn_novo_usuario_auth()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.usuarios) then
    delete from public.usuarios_convites
     where email = lower(new.email) and criado_em > now() - interval '10 minutes';
    if not found then
      raise exception 'Cadastro bloqueado: novos usuários só podem ser criados pelo CEO.';
    end if;
  end if;
  insert into public.usuarios (id, nome, email, cargo)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    case when exists (select 1 from public.usuarios) then 'funcionario' else 'ceo' end
  );
  return new;
end $$;

-- Funções exclusivas do CEO
create or replace function public.fn_exigir_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then
    raise exception 'Somente o CEO ou o gerente podem fazer isso.';
  end if;
end $$;

do $$
declare f text;
begin
  -- lojas, senhas dos estoques e exclusão de produto passam a exigir o CEO;
  -- a entrada ganha nº do pedido, nº da NF e data/hora (função "por fora" mais abaixo)
  foreach f in array array['salvar_loja(jsonb)', 'definir_senha_loja(smallint, text)', 'excluir_produto(bigint)',
                           'registrar_entrada(jsonb)'] loop
    if to_regprocedure('public.' || split_part(f, '(', 1) || '_interno(' || split_part(f, '(', 2)) is null then
      execute format('alter function public.%s rename to %s', f, split_part(f, '(', 1) || '_interno');
    end if;
  end loop;
end $$;

create or replace function public.salvar_loja(p jsonb)
returns smallint language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_ceo();
  return public.salvar_loja_interno(p);
end $$;
create or replace function public.definir_senha_loja(p_loja smallint, p_senha text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_ceo();
  perform public.definir_senha_loja_interno(p_loja, p_senha);
end $$;
create or replace function public.excluir_produto(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_ceo();
  perform public.excluir_produto_interno(p_id);
end $$;

-- Cadastros auxiliares (categorias, marcas, fornecedores): excluir só o CEO
drop policy if exists excluir on public.categorias;
drop policy if exists excluir on public.marcas;
drop policy if exists excluir on public.fornecedores;
create policy excluir on public.categorias   for delete to authenticated using (public.eh_ceo());
create policy excluir on public.marcas       for delete to authenticated using (public.eh_ceo());
create policy excluir on public.fornecedores for delete to authenticated using (public.eh_ceo());

-- ---------------------------------------------------------------------
-- ENTRADA e SAÍDA com nº do pedido, nº da NF, cliente, plataforma e data/hora
--
--  Entrada: nº do pedido (de compra), nº da NF que entrou, data e hora.
--  Saída para PEDIDO (motivo "venda"): nº do pedido (obrigatório), nº da NF,
--  nome do cliente, data e hora e, no DELLA ESTOQUE, "Qual plataforma?"
--  (Mercado Livre ou TikTok Shop). No DELLA FULL ML a plataforma é sempre
--  o Mercado Livre.
--  (Mandar mercadoria para o outro estoque continua sendo a transferência.)
-- ---------------------------------------------------------------------
alter table public.operacoes
  add column if not exists numero_pedido text,
  add column if not exists cliente_nome text,
  add column if not exists plataforma text,
  add column if not exists data_hora timestamptz;
do $$ begin
  alter table public.operacoes add constraint operacoes_plataforma_valida
    check (plataforma in ('mercado_livre', 'tiktok_shop'));
exception when duplicate_object then null; end $$;
create index if not exists operacoes_pedido_idx on public.operacoes (numero_pedido);

-- Data e hora informadas. Vazio = agora. Não pode ser no futuro.
create or replace function public.fn_data_hora(p text)
returns timestamptz language plpgsql stable as $$
declare v timestamptz;
begin
  if nullif(trim(coalesce(p, '')), '') is null then return null; end if;
  begin
    -- com fuso (ex.: 2026-10-07T20:47:00.000Z, enviado pelo aparelho) ou sem fuso (= horário de Brasília)
    if p ~ '(Z|[+-]\d\d(:?\d\d)?)$' then v := p::timestamptz;
    else v := (p::timestamp) at time zone 'America/Sao_Paulo';
    end if;
  exception when others then
    raise exception 'Data e hora inválidas.';
  end;
  if v > now() + interval '5 minutes' then raise exception 'A data e hora não podem ser no futuro.'; end if;
  if v < timestamptz '2000-01-01' then raise exception 'Data inválida.'; end if;
  return v;
end $$;

-- Ajusta o pacote recebido: nº da NF digitado vira a nota; data/hora define o dia
create or replace function public.fn_preparar_lancamento(p jsonb)
returns jsonb language plpgsql stable as $$
declare
  v jsonb := p;
  v_nf text := nullif(trim(coalesce(p ->> 'numero_nf', '')), '');
  v_dh timestamptz := public.fn_data_hora(p ->> 'data_hora');
begin
  if length(coalesce(trim(p ->> 'numero_pedido'), '')) > 60 then raise exception 'Número do pedido muito longo (máx. 60).'; end if;
  if length(coalesce(v_nf, '')) > 20 then raise exception 'Número da NF muito longo (máx. 20).'; end if;
  if length(coalesce(trim(p ->> 'cliente_nome'), '')) > 120 then raise exception 'Nome do cliente muito longo (máx. 120).'; end if;
  if v_nf is not null and coalesce(p -> 'nota' ->> 'numero', '') = '' then
    v := jsonb_set(v, '{nota}',
      (case when jsonb_typeof(p -> 'nota') = 'object' then p -> 'nota' else '{}'::jsonb end) || jsonb_build_object('numero', v_nf));
  end if;
  if v_dh is not null then
    v := v || jsonb_build_object('data', to_char(v_dh at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'));
  end if;
  return v;
end $$;

create or replace function public.registrar_entrada(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_op bigint;
  v_novo boolean;
begin
  perform public.fn_exigir_permissao('entrada', 'registrar entradas');
  v_op := public.fn_operacao_por_chave(p ->> 'chave');
  if v_op is not null then return v_op; end if;
  v_op := public.registrar_entrada_interno(public.fn_preparar_lancamento(p));
  update public.operacoes
     set numero_pedido = nullif(trim(coalesce(p ->> 'numero_pedido', '')), ''),
         data_hora = coalesce(public.fn_data_hora(p ->> 'data_hora'), criado_em)
   where id = v_op;
  return v_op;
end $$;

create or replace function public.registrar_saida(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_op bigint;
  v_item record;
  v_p jsonb;
  v_loja smallint := nullif(p ->> 'loja_id', '')::smallint;
  v_motivo text := nullif(p ->> 'motivo', '');
  v_obs text := nullif(trim(coalesce(p ->> 'observacao', '')), '');
  v_pedido text := nullif(trim(coalesce(p ->> 'numero_pedido', '')), '');
  v_cliente text := nullif(trim(coalesce(p ->> 'cliente_nome', '')), '');
  v_plat text := nullif(p ->> 'plataforma', '');
  v_full boolean;
begin
  perform public.fn_exigir_permissao('saida', 'dar baixa (saída)');
  v_op := public.fn_operacao_por_chave(p ->> 'chave');
  if v_op is not null then return v_op; end if;
  perform public.fn_exigir_loja(v_loja);
  perform public.fn_exigir_loja_atual(v_loja, 'dar baixa');
  v_p := public.fn_preparar_lancamento(p);
  if v_motivo is null then raise exception 'Informe o motivo da saída.'; end if;
  if v_motivo not in ('venda', 'perda', 'avaria', 'uso_interno', 'devolucao_fornecedor', 'outro') then
    raise exception 'Motivo de saída inválido.';
  end if;
  if v_motivo = 'outro' and v_obs is null then raise exception 'Para o motivo "Outro", descreva na observação.'; end if;

  if v_motivo = 'venda' then
    if v_pedido is null then raise exception 'Informe o número do pedido.'; end if;
    select codigo = 'FULL_ML' into v_full from public.lojas where id = v_loja;
    if v_full then
      if coalesce(v_plat, 'mercado_livre') <> 'mercado_livre' then
        raise exception 'No DELLA FULL ML a saída é sempre do Mercado Livre.';
      end if;
      v_plat := 'mercado_livre';
    elsif v_plat is null then
      raise exception 'Escolha a plataforma do pedido (Mercado Livre ou TikTok Shop).';
    elsif v_plat not in ('mercado_livre', 'tiktok_shop') then
      raise exception 'Plataforma inválida.';
    end if;
  else
    v_plat := null;  -- perda, avaria etc. não são pedidos
  end if;

  insert into public.operacoes (tipo, motivo, loja_origem_id, nota_fiscal_id, observacao, usuario_id, data_referencia, chave,
                                numero_pedido, cliente_nome, plataforma, data_hora)
  values ('saida', v_motivo, v_loja, public.fn_criar_nota(v_p -> 'nota'), v_obs, auth.uid(),
          public.fn_data_referencia(v_p ->> 'data'), nullif(p ->> 'chave', ''),
          v_pedido, v_cliente, v_plat, coalesce(public.fn_data_hora(p ->> 'data_hora'), now()))
  returning id into v_op;

  for v_item in select * from public.fn_ler_itens(p -> 'itens') loop
    perform 1 from public.produto_loja where produto_id = v_item.produto_id and loja_id = v_loja for update;
    perform public.fn_exigir_disponivel(v_item.produto_id, v_loja, v_item.quantidade);
    perform public.fn_movimentar(v_op, v_item.produto_id, v_loja, -v_item.quantidade,
      (select custo_medio from public.produtos where id = v_item.produto_id));
  end loop;
  return v_op;
end $$;

-- visões: acrescenta pedido, cliente, plataforma e data/hora no fim
create or replace view public.vw_movimentacoes with (security_invoker = true) as
select
  m.id, m.criado_em, o.data_referencia, m.operacao_id, o.tipo, o.motivo, o.observacao, o.origem,
  m.produto_id, p.nome as produto_nome, p.sku, p.ean, p.unidade,
  m.loja_id, l.nome as loja_nome, l.codigo as loja_codigo, l.cor as loja_cor,
  m.quantidade, m.custo_unitario, m.saldo_apos - m.quantidade as saldo_antes, m.saldo_apos,
  m.usuario_id, coalesce(u.nome, 'Sistema') as usuario_nome,
  o.nota_fiscal_id, nf.numero as nf_numero, nf.serie as nf_serie, nf.chave_acesso as nf_chave,
  f.nome as fornecedor_nome,
  o.loja_origem_id, lo.nome as origem_nome, o.loja_destino_id, ld.nome as destino_nome,
  o.estorno_de, o.estornada_por, o.transferencia_id,
  o.numero_pedido, o.cliente_nome, o.plataforma, coalesce(o.data_hora, o.criado_em) as data_hora
from public.movimentacoes m
join public.operacoes o on o.id = m.operacao_id
join public.produtos p on p.id = m.produto_id
join public.lojas l on l.id = m.loja_id
left join public.lojas lo on lo.id = o.loja_origem_id
left join public.lojas ld on ld.id = o.loja_destino_id
left join public.usuarios u on u.id = m.usuario_id
left join public.notas_fiscais nf on nf.id = o.nota_fiscal_id
left join public.fornecedores f on f.id = nf.fornecedor_id;

create or replace view public.vw_operacoes with (security_invoker = true) as
select
  o.id, o.criado_em, o.data_referencia, o.tipo, o.motivo, o.observacao, o.origem,
  o.loja_origem_id, lo.nome as origem_nome, lo.cor as origem_cor,
  o.loja_destino_id, ld.nome as destino_nome, ld.cor as destino_cor,
  o.nota_fiscal_id, nf.numero as nf_numero, nf.serie as nf_serie, f.nome as fornecedor_nome,
  o.estorno_de, o.estornada_por, o.transferencia_id,
  o.usuario_id, coalesce(u.nome, 'Sistema') as usuario_nome,
  (select count(distinct m.produto_id) from public.movimentacoes m where m.operacao_id = o.id) as qtd_produtos,
  (select coalesce(sum(abs(m.quantidade)), 0)
          / case when o.loja_origem_id is not null and o.loja_destino_id is not null then 2 else 1 end
     from public.movimentacoes m where m.operacao_id = o.id)::int as qtd_unidades,
  o.numero_pedido, o.cliente_nome, o.plataforma, coalesce(o.data_hora, o.criado_em) as data_hora
from public.operacoes o
left join public.lojas lo on lo.id = o.loja_origem_id
left join public.lojas ld on ld.id = o.loja_destino_id
left join public.usuarios u on u.id = o.usuario_id
left join public.notas_fiscais nf on nf.id = o.nota_fiscal_id
left join public.fornecedores f on f.id = nf.fornecedor_id;

-- log: mostra o cargo, a plataforma, o pedido e o cliente
create or replace view public.vw_log with (security_invoker = true) as
select o.criado_em as quando, o.usuario_id, coalesce(u.nome, 'Sistema') as usuario_nome, u.cargo as perfil,
       case o.tipo when 'entrada' then 'Entrada' when 'saida' then 'Baixa (saída)' when 'ajuste' then 'Ajuste de inventário'
                   when 'transferencia' then 'Transferência' else 'Estorno' end as acao,
       concat_ws(' · ',
         nullif(concat_ws(' → ', lo.nome, ld.nome), ''),
         (select string_agg(p.nome || ' ' || case when m.quantidade > 0 then '+' else '' end || m.quantidade, ', ' order by p.nome)
            from public.movimentacoes m join public.produtos p on p.id = m.produto_id
           where m.operacao_id = o.id and (o.tipo <> 'transferencia' and o.transferencia_id is null or m.quantidade > 0)),
         case when o.motivo in (o.tipo::text, 'venda') then null else o.motivo end,
         case o.plataforma when 'mercado_livre' then 'Mercado Livre' when 'tiktok_shop' then 'TikTok Shop' end,
         case when o.numero_pedido is not null then 'Pedido ' || o.numero_pedido end,
         case when o.cliente_nome is not null then 'Cliente ' || o.cliente_nome end,
         case when nf.numero is not null then 'NF ' || nf.numero end,
         o.observacao) as detalhe,
       'operacao' as origem, o.id::text as referencia
  from public.operacoes o
  left join public.usuarios u on u.id = o.usuario_id
  left join public.lojas lo on lo.id = o.loja_origem_id
  left join public.lojas ld on ld.id = o.loja_destino_id
  left join public.notas_fiscais nf on nf.id = o.nota_fiscal_id
 where public.eh_admin()
union all
select a.criado_em, a.usuario_id, coalesce(a.usuario_nome, 'Sistema'), u.cargo,
       upper(left(a.acao, 1)) || substr(a.acao, 2) ||
         case when a.acao in ('criou', 'alterou', 'excluiu') then ' ' ||
           case a.tabela when 'produtos' then 'produto' when 'usuarios' then 'usuário' when 'lojas' then 'loja'
             when 'categorias' then 'categoria' when 'marcas' then 'marca' when 'fornecedores' then 'fornecedor'
             when 'notas_fiscais' then 'nota fiscal' when 'produto_loja' then 'estoque mínimo' else coalesce(a.tabela, '') end
         else '' end,
       coalesce(a.depois ->> 'nome', a.antes ->> 'nome', a.depois ->> 'numero', ''),
       'auditoria', a.id::text
  from public.auditoria a
  left join public.usuarios u on u.id = a.usuario_id
 where public.eh_admin()
   and not (a.usuario_id is null and a.tabela = 'usuarios');

-- permissões das funções
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.eh_usuario_ativo(), public.eh_admin(), public.eh_ceo(), public.tem_permissao(text),
  public.cnpj_valido(text), public.chave_nfe_valida(text), public.ean_valido(text),
  public.registrar_entrada(jsonb), public.registrar_saida(jsonb), public.registrar_ajuste(jsonb),
  public.estornar_operacao(bigint, text),
  public.registrar_transferencia(jsonb), public.estornar_transferencia(bigint, text),
  public.salvar_produto(jsonb), public.definir_produto_ativo(bigint, boolean), public.excluir_produto(bigint),
  public.importar_produtos(jsonb), public.salvar_loja(jsonb), public.registrar_login(),
  public.entrar_loja(smallint, text), public.sair_loja(), public.definir_senha_loja(smallint, text)
to authenticated;
grant select on public.vw_movimentacoes, public.vw_operacoes, public.vw_log to authenticated;
revoke insert, update, delete, truncate on public.vw_movimentacoes, public.vw_operacoes, public.vw_log from authenticated;
revoke all on public.vw_movimentacoes, public.vw_operacoes, public.vw_log from anon;
