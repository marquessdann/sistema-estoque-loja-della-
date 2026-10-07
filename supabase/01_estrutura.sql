-- =====================================================================
--  DELLA Distribuidora de Produtos — Sistema de Controle de Estoque
--  Arquivo 1 de 2: ESTRUTURA DO BANCO DE DADOS
--
--  Como usar: no Supabase, abra "SQL Editor" > "New query", cole TODO
--  este arquivo e clique em "Run". Pode ser executado só UMA vez num
--  projeto novo.
--
--  Ideias principais:
--  * O saldo de cada produto em cada loja vem do LIVRO-RAZÃO
--    (tabela "movimentacoes"). Ninguém edita saldo na mão.
--  * Toda operação de estoque (entrada, saída, ajuste, transferência,
--    estorno) é feita por uma FUNÇÃO do banco que roda numa transação:
--    ou tudo dá certo, ou nada é gravado.
--  * O saldo nunca fica negativo (regra CHECK + verificação nas funções).
--  * No máximo 3 usuários ativos.
--  * Tudo registra o usuário que fez (auditoria).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Tipos
-- ---------------------------------------------------------------------
create type public.perfil_usuario as enum ('admin', 'operador');
create type public.tipo_operacao  as enum ('entrada', 'saida', 'ajuste', 'transferencia', 'estorno');

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------

-- Lojas (estoques). Para criar uma 3ª loja no futuro basta inserir aqui.
create table public.lojas (
  id            smallserial primary key,
  codigo        text not null unique,              -- ex.: ESTOQUE, FULL_ML
  nome          text not null,                     -- ex.: DELLA ESTOQUE
  cor           text not null default '#1E5BC6',   -- cor da etiqueta
  ordem         int  not null default 0,
  ativa         boolean not null default true,
  ml_seller_id  text,                              -- futuro: conta do Mercado Livre
  criado_em     timestamptz not null default now()
);

-- Usuários do sistema (ligados ao login do Supabase).
create table public.usuarios (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  email      text not null unique,
  perfil     public.perfil_usuario not null default 'operador',
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table public.categorias (
  id         serial primary key,
  nome       text not null,
  criado_em  timestamptz not null default now()
);
create unique index categorias_nome_uk on public.categorias (lower(nome));

create table public.marcas (
  id         serial primary key,
  nome       text not null,
  criado_em  timestamptz not null default now()
);
create unique index marcas_nome_uk on public.marcas (lower(nome));

create table public.fornecedores (
  id         serial primary key,
  nome       text not null,
  cnpj       text unique,                          -- só os 14 caracteres, sem pontuação
  criado_em  timestamptz not null default now()
);

-- Sequência usada para gerar SKU automático (DELLA-00001, DELLA-00002...)
create sequence public.produto_sku_seq;

create table public.produtos (
  id              bigserial primary key,
  sku             text not null unique,
  ean             text,
  nome            text not null,
  categoria_id    int references public.categorias (id) on delete restrict,
  marca_id        int references public.marcas (id) on delete restrict,
  unidade         text not null default 'UN',
  preco_custo     numeric(12,2) not null default 0 check (preco_custo >= 0),
  preco_venda     numeric(12,2) not null default 0 check (preco_venda >= 0),
  custo_medio     numeric(14,4) not null default 0 check (custo_medio >= 0),
  foto_path       text,
  observacoes     text,
  ativo           boolean not null default true,
  ml_item_id      text,                            -- futuro: código do anúncio MLB
  criado_por      uuid references public.usuarios (id),
  criado_em       timestamptz not null default now(),
  atualizado_por  uuid references public.usuarios (id),
  atualizado_em   timestamptz not null default now()
);
create index produtos_ean_idx  on public.produtos (ean);
create index produtos_nome_idx on public.produtos (lower(nome));

-- Saldo e estoque mínimo de cada produto em cada loja.
-- O campo "saldo" é só uma "foto" do livro-razão, mantida pelas funções.
create table public.produto_loja (
  produto_id      bigint   not null references public.produtos (id) on delete cascade,
  loja_id         smallint not null references public.lojas (id) on delete restrict,
  saldo           int not null default 0 check (saldo >= 0),
  estoque_minimo  int not null default 0 check (estoque_minimo >= 0),
  atualizado_em   timestamptz not null default now(),
  primary key (produto_id, loja_id)
);

create table public.notas_fiscais (
  id                 bigserial primary key,
  numero             text not null,
  serie              text,
  chave_acesso       text unique,                 -- 44 caracteres
  data_emissao       date,
  fornecedor_id      int references public.fornecedores (id),
  valor_total        numeric(14,2) check (valor_total is null or valor_total >= 0),
  cfop               text,
  natureza_operacao  text,
  arquivo_path       text,                        -- caminho do PDF/XML no Storage
  arquivo_nome       text,
  criado_por         uuid references public.usuarios (id),
  criado_em          timestamptz not null default now()
);
create index notas_numero_idx on public.notas_fiscais (numero);

-- Cabeçalho de cada lançamento (pode ter vários produtos).
create table public.operacoes (
  id               bigserial primary key,
  tipo             public.tipo_operacao not null,
  motivo           text,
  loja_origem_id   smallint references public.lojas (id),
  loja_destino_id  smallint references public.lojas (id),
  nota_fiscal_id   bigint references public.notas_fiscais (id),
  observacao       text,
  origem           text not null default 'manual',   -- manual | xml | importacao | api_ml (futuro)
  estorno_de       bigint unique references public.operacoes (id),
  estornada_por    bigint references public.operacoes (id),
  usuario_id       uuid references public.usuarios (id),   -- vazio = sistema (dados de exemplo)
  criado_em        timestamptz not null default now()
);
create index operacoes_criado_idx on public.operacoes (criado_em desc);
create index operacoes_nota_idx   on public.operacoes (nota_fiscal_id);

-- LIVRO-RAZÃO: cada linha é uma entrada (+) ou saída (-) de um produto numa loja.
create table public.movimentacoes (
  id              bigserial primary key,
  operacao_id     bigint   not null references public.operacoes (id) on delete restrict,
  produto_id      bigint   not null references public.produtos (id) on delete restrict,
  loja_id         smallint not null references public.lojas (id) on delete restrict,
  quantidade      int not null check (quantidade <> 0),
  custo_unitario  numeric(14,4),
  saldo_apos      int not null check (saldo_apos >= 0),
  usuario_id      uuid references public.usuarios (id),
  criado_em       timestamptz not null default now()
);
create index movimentacoes_produto_idx  on public.movimentacoes (produto_id, criado_em desc);
create index movimentacoes_operacao_idx on public.movimentacoes (operacao_id);
create index movimentacoes_criado_idx   on public.movimentacoes (criado_em desc);

-- Trilha de auditoria (quem fez o quê e quando).
create table public.auditoria (
  id            bigserial primary key,
  usuario_id    uuid,
  usuario_nome  text,
  acao          text not null,
  tabela        text,
  registro_id   text,
  antes         jsonb,
  depois        jsonb,
  criado_em     timestamptz not null default now()
);
create index auditoria_criado_idx on public.auditoria (criado_em desc);

-- ---------------------------------------------------------------------
-- 2. Funções de apoio (permissões e validações)
-- ---------------------------------------------------------------------

-- O usuário logado está ativo no sistema?
create or replace function public.eh_usuario_ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and ativo);
$$;

-- O usuário logado é administrador?
create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios where id = auth.uid() and ativo and perfil = 'admin');
$$;

create or replace function public.fn_exigir_usuario()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_usuario_ativo() then
    raise exception 'Acesso negado: faça login com um usuário ativo.';
  end if;
end $$;

-- Valida CNPJ (numérico ou o novo CNPJ alfanumérico que vale desde 2026).
create or replace function public.cnpj_valido(p text)
returns boolean language plpgsql immutable as $$
declare
  v text := upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
  soma int; dv1 int; dv2 int; i int;
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if v !~ '^[0-9A-Z]{12}[0-9]{2}$' or v ~ '^(.)\1{13}$' then
    return false;
  end if;
  soma := 0;
  for i in 1..12 loop soma := soma + (ascii(substr(v, i, 1)) - 48) * pesos1[i]; end loop;
  dv1 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  soma := 0;
  for i in 1..13 loop soma := soma + (ascii(substr(v, i, 1)) - 48) * pesos2[i]; end loop;
  dv2 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  return substr(v, 13, 1)::int = dv1 and substr(v, 14, 1)::int = dv2;
end $$;

-- Valida a chave de acesso da NF-e (44 posições, dígito verificador módulo 11).
create or replace function public.chave_nfe_valida(p text)
returns boolean language plpgsql immutable as $$
declare
  v text := upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
  soma int := 0; peso int := 2; i int; dv int;
begin
  if v !~ '^[0-9]{6}[0-9A-Z]{14}[0-9]{24}$' then
    return false;
  end if;
  for i in reverse 43..1 loop
    soma := soma + (ascii(substr(v, i, 1)) - 48) * peso;
    peso := case when peso = 9 then 2 else peso + 1 end;
  end loop;
  dv := 11 - (soma % 11);
  if dv >= 10 then dv := 0; end if;
  return substr(v, 44, 1)::int = dv;
end $$;

alter table public.notas_fiscais
  add constraint notas_chave_valida check (chave_acesso is null or public.chave_nfe_valida(chave_acesso));
alter table public.fornecedores
  add constraint fornecedores_cnpj_valido check (cnpj is null or public.cnpj_valido(cnpj));

-- ---------------------------------------------------------------------
-- 3. Gatilhos (triggers)
-- ---------------------------------------------------------------------

-- 3.1 Auditoria genérica
create or replace function public.fn_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reg jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.auditoria (usuario_id, usuario_nome, acao, tabela, registro_id, antes, depois)
  values (
    auth.uid(),
    coalesce((select nome from public.usuarios where id = auth.uid()), 'Sistema'),
    case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'excluiu' end,
    tg_table_name,
    coalesce(v_reg ->> 'id', (v_reg ->> 'produto_id') || '/' || (v_reg ->> 'loja_id')),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger auditar_produtos     after insert or update or delete on public.produtos     for each row execute function public.fn_auditar();
create trigger auditar_usuarios     after insert or update or delete on public.usuarios     for each row execute function public.fn_auditar();
create trigger auditar_lojas        after insert or update or delete on public.lojas        for each row execute function public.fn_auditar();
create trigger auditar_categorias   after insert or update or delete on public.categorias   for each row execute function public.fn_auditar();
create trigger auditar_marcas       after insert or update or delete on public.marcas       for each row execute function public.fn_auditar();
create trigger auditar_fornecedores after insert or update or delete on public.fornecedores for each row execute function public.fn_auditar();
create trigger auditar_notas        after insert or update or delete on public.notas_fiscais for each row execute function public.fn_auditar();
-- No produto_loja só auditamos mudança de estoque mínimo (o saldo já fica no livro-razão).
create trigger auditar_minimo after update on public.produto_loja
  for each row when (old.estoque_minimo is distinct from new.estoque_minimo)
  execute function public.fn_auditar();

-- 3.2 Produto: gera SKU automático, guarda datas e cria o saldo em todas as lojas
create or replace function public.fn_produto_antes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.nome := trim(new.nome);
  new.sku  := upper(trim(coalesce(new.sku, '')));
  new.ean  := nullif(regexp_replace(coalesce(new.ean, ''), '\s', '', 'g'), '');
  if new.sku = '' then
    loop
      new.sku := 'DELLA-' || lpad(nextval('public.produto_sku_seq')::text, 5, '0');
      exit when not exists (select 1 from public.produtos where sku = new.sku);
    end loop;
  end if;
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
    if new.custo_medio = 0 then new.custo_medio := new.preco_custo; end if;
  end if;
  new.atualizado_por := auth.uid();
  new.atualizado_em  := now();
  return new;
end $$;
create trigger produto_antes before insert or update on public.produtos
  for each row execute function public.fn_produto_antes();

create or replace function public.fn_produto_criar_saldos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.produto_loja (produto_id, loja_id)
  select new.id, l.id from public.lojas l
  on conflict do nothing;
  return new;
end $$;
create trigger produto_criar_saldos after insert on public.produtos
  for each row execute function public.fn_produto_criar_saldos();

-- Loja nova: cria a linha de saldo (zerada) para todos os produtos
create or replace function public.fn_loja_criar_saldos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.produto_loja (produto_id, loja_id)
  select p.id, new.id from public.produtos p
  on conflict do nothing;
  return new;
end $$;
create trigger loja_criar_saldos after insert on public.lojas
  for each row execute function public.fn_loja_criar_saldos();

-- 3.3 Usuários: limite de 3 ativos e sempre pelo menos 1 administrador
create or replace function public.fn_usuarios_regras()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ativo and (tg_op = 'INSERT' or not old.ativo) then
    if (select count(*) from public.usuarios where ativo and id <> new.id) >= 3 then
      raise exception 'Limite de 3 usuários atingido. Desative um usuário antes de cadastrar outro.';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.perfil = 'admin' and old.ativo
     and (new.perfil <> 'admin' or not new.ativo)
     and not exists (select 1 from public.usuarios where id <> new.id and perfil = 'admin' and ativo) then
    raise exception 'O sistema precisa de pelo menos um administrador ativo.';
  end if;
  return new;
end $$;
create trigger usuarios_regras before insert or update on public.usuarios
  for each row execute function public.fn_usuarios_regras();

-- Quando um login é criado no Supabase, cria o usuário do sistema.
-- O PRIMEIRO usuário criado vira Administrador automaticamente.
create or replace function public.fn_novo_usuario_auth()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_perfil public.perfil_usuario;
begin
  -- Por segurança o perfil NÃO vem do cadastro: o 1º é admin, os demais começam como
  -- operador (o administrador muda o perfil depois pela tela de Usuários).
  if not exists (select 1 from public.usuarios) then
    v_perfil := 'admin';
  else
    v_perfil := 'operador';
  end if;
  insert into public.usuarios (id, nome, email, perfil)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    v_perfil
  );
  return new;
end $$;
create trigger ao_criar_login after insert on auth.users
  for each row execute function public.fn_novo_usuario_auth();

-- ---------------------------------------------------------------------
-- 4. Funções de estoque (o coração do sistema)
-- ---------------------------------------------------------------------

-- 4.1 Lança UMA linha no livro-razão e atualiza o saldo, sem deixar negativo.
--     Uso interno: só é chamada pelas outras funções.
create or replace function public.fn_movimentar(
  p_operacao bigint, p_produto bigint, p_loja smallint, p_qtd int, p_custo numeric
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_saldo int;
  v_produto text;
  v_loja text;
begin
  if p_qtd is null or p_qtd = 0 then
    return null;
  end if;

  insert into public.produto_loja (produto_id, loja_id) values (p_produto, p_loja)
  on conflict do nothing;

  -- trava a linha para que duas pessoas não mexam no mesmo saldo ao mesmo tempo
  select saldo into v_saldo from public.produto_loja
   where produto_id = p_produto and loja_id = p_loja
   for update;

  if v_saldo + p_qtd < 0 then
    select nome into v_produto from public.produtos where id = p_produto;
    select nome into v_loja from public.lojas where id = p_loja;
    raise exception 'Saldo insuficiente de "%" na loja %: disponível %, solicitado %.',
      v_produto, v_loja, v_saldo, abs(p_qtd);
  end if;

  update public.produto_loja
     set saldo = v_saldo + p_qtd, atualizado_em = now()
   where produto_id = p_produto and loja_id = p_loja;

  insert into public.movimentacoes (operacao_id, produto_id, loja_id, quantidade, custo_unitario, saldo_apos, usuario_id)
  values (p_operacao, p_produto, p_loja, p_qtd, p_custo, v_saldo + p_qtd, auth.uid());

  return v_saldo + p_qtd;
end $$;

-- 4.2 Lê e valida a lista de itens: [{"produto_id": 1, "quantidade": 5, "custo_unitario": 9.90}, ...]
--     Junta produtos repetidos e devolve em ordem (evita travamentos).
create or replace function public.fn_ler_itens(p_itens jsonb)
returns table (produto_id bigint, quantidade int, custo_unitario numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_id bigint;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe pelo menos um produto.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_itens) e
     where jsonb_typeof(e -> 'quantidade') <> 'number'
        or (e ->> 'quantidade')::numeric <= 0
        or (e ->> 'quantidade')::numeric <> trunc((e ->> 'quantidade')::numeric)
  ) then
    raise exception 'As quantidades devem ser números inteiros maiores que zero.';
  end if;
  select (e ->> 'produto_id')::bigint into v_id
    from jsonb_array_elements(p_itens) e
   where not exists (select 1 from public.produtos p where p.id = (e ->> 'produto_id')::bigint and p.ativo)
   limit 1;
  if found then
    raise exception 'Produto % não encontrado ou inativo.', coalesce(v_id::text, '(vazio)');
  end if;
  return query
    select x.produto_id,
           sum(x.quantidade)::int,
           case when bool_and(x.custo_unitario is not null)
                then round(sum(x.quantidade * x.custo_unitario) / sum(x.quantidade), 4) end
      from jsonb_to_recordset(p_itens) as x (produto_id bigint, quantidade int, custo_unitario numeric)
     group by x.produto_id
     order by x.produto_id;
end $$;

create or replace function public.fn_exigir_loja(p_loja smallint)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from public.lojas where id = p_loja and ativa;
  if v_nome is null then
    raise exception 'Escolha uma loja válida.';
  end if;
  return v_nome;
end $$;

-- 4.3 Cria (ou reaproveita) a nota fiscal informada.
--     p_nota = {"numero","serie","chave_acesso","data_emissao","fornecedor_nome",
--               "fornecedor_cnpj","valor_total","cfop","natureza_operacao",
--               "arquivo_path","arquivo_nome"}  ou  {"id": 12} para usar uma já cadastrada.
create or replace function public.fn_criar_nota(p_nota jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_chave text;
  v_cnpj text;
  v_forn_nome text;
  v_forn int;
  v_op record;
begin
  if p_nota is null or jsonb_typeof(p_nota) <> 'object' then
    return null;
  end if;
  if nullif(p_nota ->> 'id', '') is not null then
    select id into v_id from public.notas_fiscais where id = (p_nota ->> 'id')::bigint;
    if v_id is null then raise exception 'Nota fiscal não encontrada.'; end if;
    return v_id;
  end if;
  if coalesce(trim(p_nota ->> 'numero'), '') = '' then
    return null;  -- nota não informada
  end if;

  v_chave := nullif(upper(regexp_replace(coalesce(p_nota ->> 'chave_acesso', ''), '[^0-9A-Za-z]', '', 'g')), '');
  if v_chave is not null then
    if not public.chave_nfe_valida(v_chave) then
      raise exception 'Chave de acesso inválida. Confira os 44 dígitos da nota.';
    end if;
    select o.id, o.criado_em into v_op
      from public.notas_fiscais n join public.operacoes o on o.nota_fiscal_id = n.id
     where n.chave_acesso = v_chave and o.estornada_por is null and o.tipo <> 'estorno'
     limit 1;
    if found then
      raise exception 'Esta nota fiscal já foi lançada (operação nº % em %). Verifique para não lançar em dobro.',
        v_op.id, to_char(v_op.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
    end if;
    -- nota já cadastrada mas cuja operação foi estornada: reaproveita
    select id into v_id from public.notas_fiscais where chave_acesso = v_chave;
    if v_id is not null then return v_id; end if;
  end if;

  -- fornecedor
  v_cnpj := nullif(upper(regexp_replace(coalesce(p_nota ->> 'fornecedor_cnpj', ''), '[^0-9A-Za-z]', '', 'g')), '');
  v_forn_nome := nullif(trim(coalesce(p_nota ->> 'fornecedor_nome', '')), '');
  if v_cnpj is not null then
    if not public.cnpj_valido(v_cnpj) then
      raise exception 'CNPJ do fornecedor inválido.';
    end if;
    select id into v_forn from public.fornecedores where cnpj = v_cnpj;
    if v_forn is null then
      insert into public.fornecedores (nome, cnpj) values (coalesce(v_forn_nome, 'Fornecedor ' || v_cnpj), v_cnpj)
      returning id into v_forn;
    end if;
  elsif v_forn_nome is not null then
    select id into v_forn from public.fornecedores where lower(nome) = lower(v_forn_nome) order by id limit 1;
    if v_forn is null then
      insert into public.fornecedores (nome) values (v_forn_nome) returning id into v_forn;
    end if;
  end if;

  insert into public.notas_fiscais (numero, serie, chave_acesso, data_emissao, fornecedor_id, valor_total,
                                    cfop, natureza_operacao, arquivo_path, arquivo_nome, criado_por)
  values (
    trim(p_nota ->> 'numero'),
    nullif(trim(coalesce(p_nota ->> 'serie', '')), ''),
    v_chave,
    nullif(p_nota ->> 'data_emissao', '')::date,
    v_forn,
    nullif(p_nota ->> 'valor_total', '')::numeric,
    nullif(trim(coalesce(p_nota ->> 'cfop', '')), ''),
    nullif(trim(coalesce(p_nota ->> 'natureza_operacao', '')), ''),
    nullif(p_nota ->> 'arquivo_path', ''),
    nullif(p_nota ->> 'arquivo_nome', ''),
    auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

-- 4.4 ENTRADA (compra, devolução de cliente, bonificação...)
--     Atualiza o custo médio do produto quando o custo unitário é informado.
create or replace function public.registrar_entrada(
  p_loja_id smallint, p_itens jsonb, p_motivo text default 'compra',
  p_nota jsonb default null, p_observacao text default null, p_origem text default 'manual'
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_op bigint;
  v_item record;
  v_total int;
begin
  perform public.fn_exigir_usuario();
  perform public.fn_exigir_loja(p_loja_id);

  insert into public.operacoes (tipo, motivo, loja_destino_id, nota_fiscal_id, observacao, origem, usuario_id)
  values ('entrada', coalesce(nullif(p_motivo, ''), 'compra'), p_loja_id, public.fn_criar_nota(p_nota),
          nullif(trim(coalesce(p_observacao, '')), ''), coalesce(p_origem, 'manual'), auth.uid())
  returning id into v_op;

  for v_item in select * from public.fn_ler_itens(p_itens) loop
    -- custo médio ponderado considerando o saldo somado de todas as lojas
    if v_item.custo_unitario is not null then
      select coalesce(sum(saldo), 0) into v_total from public.produto_loja where produto_id = v_item.produto_id;
      update public.produtos
         set custo_medio = case when v_total <= 0 then v_item.custo_unitario
                                else round((v_total * custo_medio + v_item.quantidade * v_item.custo_unitario)
                                           / (v_total + v_item.quantidade), 4) end
       where id = v_item.produto_id;
    end if;
    perform public.fn_movimentar(v_op, v_item.produto_id, p_loja_id, v_item.quantidade,
      coalesce(v_item.custo_unitario, (select custo_medio from public.produtos where id = v_item.produto_id)));
  end loop;
  return v_op;
end $$;

-- 4.5 SAÍDA (venda, perda, avaria, uso interno...)
create or replace function public.registrar_saida(
  p_loja_id smallint, p_itens jsonb, p_motivo text,
  p_nota jsonb default null, p_observacao text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_op bigint;
  v_item record;
begin
  perform public.fn_exigir_usuario();
  perform public.fn_exigir_loja(p_loja_id);
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da saída.';
  end if;

  insert into public.operacoes (tipo, motivo, loja_origem_id, nota_fiscal_id, observacao, usuario_id)
  values ('saida', p_motivo, p_loja_id, public.fn_criar_nota(p_nota),
          nullif(trim(coalesce(p_observacao, '')), ''), auth.uid())
  returning id into v_op;

  for v_item in select * from public.fn_ler_itens(p_itens) loop
    perform public.fn_movimentar(v_op, v_item.produto_id, p_loja_id, -v_item.quantidade,
      (select custo_medio from public.produtos where id = v_item.produto_id));
  end loop;
  return v_op;
end $$;

-- 4.6 TRANSFERÊNCIA entre lojas (sai de uma e entra na outra, tudo ou nada)
create or replace function public.registrar_transferencia(
  p_origem_id smallint, p_destino_id smallint, p_itens jsonb,
  p_nota jsonb default null, p_observacao text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_op bigint;
  v_item record;
  v_custo numeric;
begin
  perform public.fn_exigir_usuario();
  perform public.fn_exigir_loja(p_origem_id);
  perform public.fn_exigir_loja(p_destino_id);
  if p_origem_id = p_destino_id then
    raise exception 'A loja de origem e a de destino precisam ser diferentes.';
  end if;

  insert into public.operacoes (tipo, motivo, loja_origem_id, loja_destino_id, nota_fiscal_id, observacao, usuario_id)
  values ('transferencia', 'transferencia', p_origem_id, p_destino_id, public.fn_criar_nota(p_nota),
          nullif(trim(coalesce(p_observacao, '')), ''), auth.uid())
  returning id into v_op;

  for v_item in select * from public.fn_ler_itens(p_itens) loop
    select custo_medio into v_custo from public.produtos where id = v_item.produto_id;
    perform public.fn_movimentar(v_op, v_item.produto_id, p_origem_id, -v_item.quantidade, v_custo);
    perform public.fn_movimentar(v_op, v_item.produto_id, p_destino_id, v_item.quantidade, v_custo);
  end loop;
  return v_op;
end $$;

-- 4.7 AJUSTE DE INVENTÁRIO: informa a quantidade CONTADA; o sistema lança a diferença.
--     p_itens = [{"produto_id": 1, "quantidade_contada": 12}, ...]
--     Devolve o nº da operação, ou NULL se não havia nenhuma diferença.
create or replace function public.registrar_ajuste(
  p_loja_id smallint, p_itens jsonb, p_motivo text, p_observacao text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_op bigint;
  v_item record;
  v_saldo int;
  v_difs jsonb := '[]'::jsonb;
  v_d jsonb;
begin
  perform public.fn_exigir_usuario();
  perform public.fn_exigir_loja(p_loja_id);
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'O motivo do ajuste é obrigatório.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe pelo menos um produto contado.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_itens) e
     where jsonb_typeof(e -> 'quantidade_contada') <> 'number'
        or (e ->> 'quantidade_contada')::numeric < 0
        or (e ->> 'quantidade_contada')::numeric <> trunc((e ->> 'quantidade_contada')::numeric)
  ) then
    raise exception 'A quantidade contada deve ser um número inteiro (zero ou mais).';
  end if;

  for v_item in
    select x.produto_id, max(x.quantidade_contada) as contada
      from jsonb_to_recordset(p_itens) as x (produto_id bigint, quantidade_contada int)
     group by x.produto_id order by x.produto_id
  loop
    if not exists (select 1 from public.produtos where id = v_item.produto_id) then
      raise exception 'Produto % não encontrado.', v_item.produto_id;
    end if;
    insert into public.produto_loja (produto_id, loja_id) values (v_item.produto_id, p_loja_id) on conflict do nothing;
    select saldo into v_saldo from public.produto_loja
     where produto_id = v_item.produto_id and loja_id = p_loja_id for update;
    if v_item.contada <> v_saldo then
      v_difs := v_difs || jsonb_build_object('produto_id', v_item.produto_id, 'dif', v_item.contada - v_saldo);
    end if;
  end loop;

  if jsonb_array_length(v_difs) = 0 then
    return null;  -- tudo conferido, nada a ajustar
  end if;

  insert into public.operacoes (tipo, motivo, loja_destino_id, observacao, usuario_id)
  values ('ajuste', trim(p_motivo), p_loja_id, nullif(trim(coalesce(p_observacao, '')), ''), auth.uid())
  returning id into v_op;

  for v_d in select * from jsonb_array_elements(v_difs) loop
    perform public.fn_movimentar(v_op, (v_d ->> 'produto_id')::bigint, p_loja_id, (v_d ->> 'dif')::int,
      (select custo_medio from public.produtos where id = (v_d ->> 'produto_id')::bigint));
  end loop;
  return v_op;
end $$;

-- 4.8 ESTORNO: desfaz um lançamento criando o lançamento inverso (o histórico fica completo).
create or replace function public.estornar_operacao(p_operacao_id bigint, p_motivo text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_orig public.operacoes;
  v_op bigint;
  v_m record;
  v_total int;
begin
  perform public.fn_exigir_usuario();
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do estorno.';
  end if;
  select * into v_orig from public.operacoes where id = p_operacao_id for update;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if v_orig.tipo = 'estorno' then raise exception 'Um estorno não pode ser estornado.'; end if;
  if v_orig.estornada_por is not null then raise exception 'Este lançamento já foi estornado.'; end if;

  insert into public.operacoes (tipo, motivo, loja_origem_id, loja_destino_id, nota_fiscal_id, observacao, estorno_de, usuario_id)
  values ('estorno', trim(p_motivo), v_orig.loja_destino_id, v_orig.loja_origem_id, v_orig.nota_fiscal_id,
          'Estorno do lançamento nº ' || v_orig.id, v_orig.id, auth.uid())
  returning id into v_op;

  for v_m in
    select produto_id, loja_id, quantidade, custo_unitario
      from public.movimentacoes where operacao_id = v_orig.id
     order by produto_id, quantidade   -- tira primeiro, depois devolve
  loop
    -- estorno de entrada: desfaz o efeito no custo médio
    if v_orig.tipo = 'entrada' and v_m.custo_unitario is not null then
      select coalesce(sum(saldo), 0) into v_total from public.produto_loja where produto_id = v_m.produto_id;
      if v_total - v_m.quantidade > 0 then
        update public.produtos
           set custo_medio = greatest(0, round((v_total * custo_medio - v_m.quantidade * v_m.custo_unitario)
                                               / (v_total - v_m.quantidade), 4))
         where id = v_m.produto_id;
      end if;
    end if;
    perform public.fn_movimentar(v_op, v_m.produto_id, v_m.loja_id, -v_m.quantidade, v_m.custo_unitario);
  end loop;

  update public.operacoes set estornada_por = v_op where id = v_orig.id;
  return v_op;
end $$;

-- ---------------------------------------------------------------------
-- 5. Funções de cadastro
-- ---------------------------------------------------------------------

create or replace function public.fn_categoria_id(p_nome text)
returns int language plpgsql security definer set search_path = public as $$
declare v_id int; v_nome text := nullif(trim(coalesce(p_nome, '')), '');
begin
  if v_nome is null then return null; end if;
  select id into v_id from public.categorias where lower(nome) = lower(v_nome);
  if v_id is null then insert into public.categorias (nome) values (v_nome) returning id into v_id; end if;
  return v_id;
end $$;

create or replace function public.fn_marca_id(p_nome text)
returns int language plpgsql security definer set search_path = public as $$
declare v_id int; v_nome text := nullif(trim(coalesce(p_nome, '')), '');
begin
  if v_nome is null then return null; end if;
  select id into v_id from public.marcas where lower(nome) = lower(v_nome);
  if v_id is null then insert into public.marcas (nome) values (v_nome) returning id into v_id; end if;
  return v_id;
end $$;

-- Cria ou altera um produto (e seus estoques mínimos por loja).
-- p = {"id"?, "nome", "sku", "ean", "categoria", "marca", "unidade", "preco_custo",
--      "preco_venda", "foto_path", "observacoes", "ml_item_id", "minimos": {"<loja_id>": 5}}
create or replace function public.salvar_produto(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint;
  v_sku text := upper(trim(coalesce(p ->> 'sku', '')));
  v_ean text := nullif(regexp_replace(coalesce(p ->> 'ean', ''), '\s', '', 'g'), '');
  v_outro text;
  v_k text;
  v_v jsonb;
begin
  perform public.fn_exigir_usuario();
  if coalesce(trim(p ->> 'nome'), '') = '' then
    raise exception 'O nome do produto é obrigatório.';
  end if;
  if v_sku <> '' then
    select nome into v_outro from public.produtos where sku = v_sku and id is distinct from v_id;
    if v_outro is not null then
      raise exception 'Já existe um produto com o SKU %: "%".', v_sku, v_outro;
    end if;
  end if;
  if v_ean is not null then
    select nome into v_outro from public.produtos where ean = v_ean and id is distinct from v_id;
    if v_outro is not null then
      raise exception 'Já existe um produto com o código de barras %: "%".', v_ean, v_outro;
    end if;
  end if;

  if v_id is null then
    insert into public.produtos (nome, sku, ean, categoria_id, marca_id, unidade, preco_custo, preco_venda,
                                 foto_path, observacoes, ml_item_id)
    values (p ->> 'nome', v_sku, v_ean, public.fn_categoria_id(p ->> 'categoria'), public.fn_marca_id(p ->> 'marca'),
            coalesce(nullif(upper(trim(p ->> 'unidade')), ''), 'UN'),
            coalesce(nullif(p ->> 'preco_custo', '')::numeric, 0), coalesce(nullif(p ->> 'preco_venda', '')::numeric, 0),
            nullif(p ->> 'foto_path', ''), nullif(trim(coalesce(p ->> 'observacoes', '')), ''), nullif(trim(coalesce(p ->> 'ml_item_id', '')), ''))
    returning id into v_id;
  else
    update public.produtos set
      nome = p ->> 'nome',
      sku = case when v_sku = '' then sku else v_sku end,
      ean = v_ean,
      categoria_id = public.fn_categoria_id(p ->> 'categoria'),
      marca_id = public.fn_marca_id(p ->> 'marca'),
      unidade = coalesce(nullif(upper(trim(p ->> 'unidade')), ''), 'UN'),
      preco_custo = coalesce(nullif(p ->> 'preco_custo', '')::numeric, 0),
      preco_venda = coalesce(nullif(p ->> 'preco_venda', '')::numeric, 0),
      foto_path = nullif(p ->> 'foto_path', ''),
      observacoes = nullif(trim(coalesce(p ->> 'observacoes', '')), ''),
      ml_item_id = nullif(trim(coalesce(p ->> 'ml_item_id', '')), '')
    where id = v_id;
    if not found then raise exception 'Produto não encontrado.'; end if;
    -- sem estoque em nenhuma loja: o custo médio acompanha o preço de custo do cadastro
    update public.produtos set custo_medio = preco_custo
     where id = v_id and not exists (select 1 from public.produto_loja where produto_id = v_id and saldo > 0);
  end if;

  if jsonb_typeof(p -> 'minimos') = 'object' then
    for v_k, v_v in select * from jsonb_each(p -> 'minimos') loop
      update public.produto_loja
         set estoque_minimo = greatest(0, coalesce(nullif(v_v #>> '{}', '')::int, 0))
       where produto_id = v_id and loja_id = v_k::smallint;
    end loop;
  end if;
  return v_id;
end $$;

-- Ativa / inativa um produto (produto nunca é apagado)
create or replace function public.definir_produto_ativo(p_id bigint, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_usuario();
  update public.produtos set ativo = p_ativo where id = p_id;
  if not found then raise exception 'Produto não encontrado.'; end if;
end $$;

-- Importação de planilha: atualiza pelo SKU (ou EAN) ou cria produto novo. Tudo ou nada.
-- p_linhas = [{"sku","nome","ean","categoria","marca","unidade","preco_custo","preco_venda",
--              "observacoes","minimos": {"<loja_id>": n}}, ...]
create or replace function public.importar_produtos(p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_l jsonb;
  v_id bigint;
  v_novos int := 0;
  v_alterados int := 0;
  v_n int := 0;
begin
  perform public.fn_exigir_usuario();
  if jsonb_typeof(p_linhas) <> 'array' then raise exception 'Planilha inválida.'; end if;
  for v_l in select * from jsonb_array_elements(p_linhas) loop
    v_n := v_n + 1;
    v_id := null;
    if coalesce(trim(v_l ->> 'sku'), '') <> '' then
      select id into v_id from public.produtos where sku = upper(trim(v_l ->> 'sku'));
    end if;
    if v_id is null and coalesce(trim(v_l ->> 'ean'), '') <> '' then
      select id into v_id from public.produtos where ean = regexp_replace(v_l ->> 'ean', '\s', '', 'g');
    end if;
    begin
      perform public.salvar_produto(v_l || jsonb_build_object('id', v_id));
    exception when others then
      raise exception 'Linha %: %', v_n + 1, sqlerrm;   -- +1 por causa do cabeçalho
    end;
    if v_id is null then v_novos := v_novos + 1; else v_alterados := v_alterados + 1; end if;
  end loop;
  return jsonb_build_object('novos', v_novos, 'alterados', v_alterados);
end $$;

-- Registra o login na auditoria (chamado pela tela de login)
create or replace function public.registrar_login()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_usuario();
  insert into public.auditoria (usuario_id, usuario_nome, acao, tabela)
  values (auth.uid(), (select nome from public.usuarios where id = auth.uid()), 'entrou no sistema', 'login');
end $$;

-- ---------------------------------------------------------------------
-- 6. Visões (consultas prontas para as telas e relatórios)
-- ---------------------------------------------------------------------
create view public.vw_movimentacoes with (security_invoker = true) as
select
  m.id, m.criado_em, m.operacao_id, o.tipo, o.motivo, o.observacao, o.origem,
  m.produto_id, p.nome as produto_nome, p.sku, p.ean, p.unidade,
  m.loja_id, l.nome as loja_nome, l.codigo as loja_codigo, l.cor as loja_cor,
  m.quantidade, m.custo_unitario, m.saldo_apos,
  m.usuario_id, coalesce(u.nome, 'Sistema') as usuario_nome,
  o.nota_fiscal_id, nf.numero as nf_numero, nf.serie as nf_serie, nf.chave_acesso as nf_chave,
  f.nome as fornecedor_nome,
  o.loja_origem_id, o.loja_destino_id, o.estorno_de, o.estornada_por
from public.movimentacoes m
join public.operacoes o on o.id = m.operacao_id
join public.produtos p on p.id = m.produto_id
join public.lojas l on l.id = m.loja_id
left join public.usuarios u on u.id = m.usuario_id
left join public.notas_fiscais nf on nf.id = o.nota_fiscal_id
left join public.fornecedores f on f.id = nf.fornecedor_id;

create view public.vw_operacoes with (security_invoker = true) as
select
  o.id, o.criado_em, o.tipo, o.motivo, o.observacao, o.origem,
  o.loja_origem_id, lo.nome as origem_nome, lo.cor as origem_cor,
  o.loja_destino_id, ld.nome as destino_nome, ld.cor as destino_cor,
  o.nota_fiscal_id, nf.numero as nf_numero, nf.serie as nf_serie, f.nome as fornecedor_nome,
  o.estorno_de, o.estornada_por,
  o.usuario_id, coalesce(u.nome, 'Sistema') as usuario_nome,
  (select count(distinct m.produto_id) from public.movimentacoes m where m.operacao_id = o.id) as qtd_produtos,
  -- em transferências cada unidade aparece 2 vezes (sai e entra), por isso divide por 2
  (select coalesce(sum(abs(m.quantidade)), 0)
          / case when o.loja_origem_id is not null and o.loja_destino_id is not null then 2 else 1 end
     from public.movimentacoes m where m.operacao_id = o.id)::int as qtd_unidades
from public.operacoes o
left join public.lojas lo on lo.id = o.loja_origem_id
left join public.lojas ld on ld.id = o.loja_destino_id
left join public.usuarios u on u.id = o.usuario_id
left join public.notas_fiscais nf on nf.id = o.nota_fiscal_id
left join public.fornecedores f on f.id = nf.fornecedor_id;

create view public.vw_notas with (security_invoker = true) as
select
  n.*, f.nome as fornecedor_nome, f.cnpj as fornecedor_cnpj,
  coalesce(u.nome, 'Sistema') as criado_por_nome,
  (select count(*) from public.operacoes o where o.nota_fiscal_id = n.id) as qtd_operacoes
from public.notas_fiscais n
left join public.fornecedores f on f.id = n.fornecedor_id
left join public.usuarios u on u.id = n.criado_por;

-- ---------------------------------------------------------------------
-- 7. Segurança (RLS): só usuários logados e ativos enxergam os dados.
--    Gravações de estoque só acontecem pelas funções acima.
-- ---------------------------------------------------------------------
alter table public.lojas          enable row level security;
alter table public.usuarios       enable row level security;
alter table public.categorias     enable row level security;
alter table public.marcas         enable row level security;
alter table public.fornecedores   enable row level security;
alter table public.produtos       enable row level security;
alter table public.produto_loja   enable row level security;
alter table public.notas_fiscais  enable row level security;
alter table public.operacoes      enable row level security;
alter table public.movimentacoes  enable row level security;
alter table public.auditoria      enable row level security;

create policy ler on public.lojas         for select to authenticated using (public.eh_usuario_ativo());
create policy ler on public.usuarios      for select to authenticated using (public.eh_usuario_ativo());
create policy ler on public.categorias    for select to authenticated using (public.eh_usuario_ativo());
create policy ler on public.marcas        for select to authenticated using (public.eh_usuario_ativo());
create policy ler on public.fornecedores  for select to authenticated using (public.eh_usuario_ativo());
create policy ler on public.produtos      for select to authenticated using (public.eh_usuario_ativo());
create policy ler on public.produto_loja  for select to authenticated using (public.eh_usuario_ativo());
create policy ler on public.notas_fiscais for select to authenticated using (public.eh_usuario_ativo());
create policy ler on public.operacoes     for select to authenticated using (public.eh_usuario_ativo());
create policy ler on public.movimentacoes for select to authenticated using (public.eh_usuario_ativo());
create policy ler on public.auditoria     for select to authenticated using (public.eh_admin());

-- Cadastros auxiliares: qualquer usuário ativo cria/edita; só o admin exclui.
create policy criar   on public.categorias   for insert to authenticated with check (public.eh_usuario_ativo());
create policy editar  on public.categorias   for update to authenticated using (public.eh_usuario_ativo());
create policy excluir on public.categorias   for delete to authenticated using (public.eh_admin());
create policy criar   on public.marcas       for insert to authenticated with check (public.eh_usuario_ativo());
create policy editar  on public.marcas       for update to authenticated using (public.eh_usuario_ativo());
create policy excluir on public.marcas       for delete to authenticated using (public.eh_admin());
create policy criar   on public.fornecedores for insert to authenticated with check (public.eh_usuario_ativo());
create policy editar  on public.fornecedores for update to authenticated using (public.eh_usuario_ativo());
create policy excluir on public.fornecedores for delete to authenticated using (public.eh_admin());
-- Lojas: só o admin altera (nome, cor)
create policy editar  on public.lojas        for update to authenticated using (public.eh_admin());
-- Nota fiscal: usuários ativos podem completar dados/anexo depois
create policy editar  on public.notas_fiscais for update to authenticated using (public.eh_usuario_ativo());

-- Permissões de tabela (anon = visitante sem login: nada)
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables    in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.categorias, public.marcas, public.fornecedores to authenticated;
grant update (nome, cor, ordem) on public.lojas to authenticated;
grant update (numero, serie, data_emissao, fornecedor_id, valor_total, cfop, natureza_operacao, arquivo_path, arquivo_nome)
  on public.notas_fiscais to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Funções: só as "públicas" podem ser chamadas pelo aplicativo
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.eh_usuario_ativo(), public.eh_admin(),
  public.cnpj_valido(text), public.chave_nfe_valida(text),
  public.registrar_entrada(smallint, jsonb, text, jsonb, text, text),
  public.registrar_saida(smallint, jsonb, text, jsonb, text),
  public.registrar_transferencia(smallint, smallint, jsonb, jsonb, text),
  public.registrar_ajuste(smallint, jsonb, text, text),
  public.estornar_operacao(bigint, text),
  public.salvar_produto(jsonb),
  public.definir_produto_ativo(bigint, boolean),
  public.importar_produtos(jsonb),
  public.registrar_login()
to authenticated;

-- ---------------------------------------------------------------------
-- 8. Tempo real: avisa as telas abertas quando o estoque muda
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.produto_loja, public.operacoes, public.produtos;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 9. Arquivos (fotos de produto e notas fiscais em PDF/XML)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('produtos', 'produtos', true)  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('notas',    'notas',    false) on conflict (id) do nothing;

create policy "arquivos_ler" on storage.objects for select to authenticated
  using (bucket_id in ('produtos', 'notas') and public.eh_usuario_ativo());
create policy "arquivos_enviar" on storage.objects for insert to authenticated
  with check (bucket_id in ('produtos', 'notas') and public.eh_usuario_ativo());
create policy "arquivos_trocar" on storage.objects for update to authenticated
  using (bucket_id in ('produtos', 'notas') and public.eh_usuario_ativo());

-- ---------------------------------------------------------------------
-- 10. As duas lojas (obrigatórias)
-- ---------------------------------------------------------------------
insert into public.lojas (codigo, nome, cor, ordem) values
  ('ESTOQUE', 'DELLA ESTOQUE', '#1E5BC6', 1),
  ('FULL_ML', 'DELLA FULL ML', '#D4A437', 2);
