-- =====================================================================
--  DELLA — Arquivo 3: ATUALIZAÇÃO VERSÃO 2
--  Permissões por usuário, transferência imediata com histórico próprio,
--  log de atividades para o administrador, proteção contra lançamento
--  duplicado e melhorias de produtos e lojas.
--
--  Como usar: rode DEPOIS do 01_estrutura.sql (e do 02, se usou).
--  Serve tanto para instalação nova quanto para quem já usa a versão 1:
--  nenhum dado é perdido.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Permissões do OPERADOR (o administrador sempre pode tudo)
-- ---------------------------------------------------------------------
alter table public.usuarios
  add column if not exists perm_produtos              boolean not null default false, -- cadastrar/editar produtos e categorias
  add column if not exists perm_entrada               boolean not null default true,
  add column if not exists perm_saida                 boolean not null default true,
  add column if not exists perm_transferir            boolean not null default true,  -- transferir entre lojas
  add column if not exists perm_inventario            boolean not null default true,
  add column if not exists perm_estornar              boolean not null default false,
  add column if not exists perm_relatorios            boolean not null default true,
  add column if not exists perm_historico             boolean not null default true;  -- ver movimentações de todos (senão só as suas)

-- Quem já existia como operador na versão 1 continua podendo estornar (como era antes)
update public.usuarios set perm_estornar = true where perfil = 'operador';

create or replace function public.tem_permissao(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when u.perfil = 'admin' then true
      else case p
        when 'produtos'   then u.perm_produtos
        when 'entrada'    then u.perm_entrada
        when 'saida'      then u.perm_saida
        when 'transferir' then u.perm_transferir
        when 'inventario' then u.perm_inventario
        when 'estornar'   then u.perm_estornar
        when 'relatorios' then u.perm_relatorios
        when 'historico'  then u.perm_historico
        else false end
      end
    from public.usuarios u where u.id = auth.uid() and u.ativo), false);
$$;

create or replace function public.fn_exigir_permissao(p text, acao text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  perform public.fn_exigir_usuario();
  if not public.tem_permissao(p) then
    raise exception 'Sem permissão para %. Peça ao administrador para liberar.', acao;
  end if;
end $$;

create or replace function public.fn_exigir_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then
    raise exception 'Somente o administrador pode fazer isso.';
  end if;
end $$;

-- Cadastro público bloqueado no próprio banco: depois do 1º usuário (admin),
-- só entra login que o administrador CONVIDOU pela tela Usuários (o servidor
-- grava o convite com a chave secreta logo antes de criar o login).
create table if not exists public.usuarios_convites (
  email      text primary key,
  criado_em  timestamptz not null default now()
);
alter table public.usuarios_convites enable row level security;  -- sem políticas: ninguém do app lê/grava
revoke all on public.usuarios_convites from anon, authenticated;

create or replace function public.fn_novo_usuario_auth()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.usuarios) then
    delete from public.usuarios_convites
     where email = lower(new.email) and criado_em > now() - interval '10 minutes';
    if not found then
      raise exception 'Cadastro bloqueado: novos usuários só podem ser criados pelo administrador.';
    end if;
  end if;
  insert into public.usuarios (id, nome, email, perfil)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    case when exists (select 1 from public.usuarios) then 'operador' else 'admin' end::public.perfil_usuario
  );
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Lojas: gestão de lojas
-- ---------------------------------------------------------------------
alter table public.lojas add column if not exists virtual boolean not null default false;  -- reservado para uso futuro

-- loja válida para lançamentos = ativa e não-virtual
create or replace function public.fn_exigir_loja(p_loja smallint)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from public.lojas where id = p_loja and ativa and not virtual;
  if v_nome is null then
    raise exception 'Loja inválida ou inativa. Escolha uma loja da lista.';
  end if;
  return v_nome;
end $$;

-- Criar / alterar loja (somente admin)
create or replace function public.salvar_loja(p jsonb)
returns smallint language plpgsql security definer set search_path = public as $$
declare
  v_id smallint := nullif(p ->> 'id', '')::smallint;
  v_nome text := upper(trim(coalesce(p ->> 'nome', '')));
  v_cor text := upper(coalesce(nullif(p ->> 'cor', ''), '#1E5BC6'));
  v_ativa boolean := coalesce((p ->> 'ativa')::boolean, true);
begin
  perform public.fn_exigir_admin();
  if v_nome = '' then raise exception 'Informe o nome da loja.'; end if;
  if v_cor !~ '^#[0-9A-F]{6}$' then raise exception 'Cor inválida.'; end if;
  if exists (select 1 from public.lojas where upper(nome) = v_nome and id is distinct from v_id) then
    raise exception 'Já existe uma loja com este nome.';
  end if;
  if v_id is null then
    insert into public.lojas (codigo, nome, cor, ordem)
    values (
      upper(regexp_replace(coalesce(nullif(p ->> 'codigo', ''), v_nome), '[^A-Za-z0-9]+', '_', 'g')),
      v_nome, v_cor, coalesce((select max(ordem) from public.lojas where not virtual), 0) + 1)
    returning id into v_id;
    return v_id;
  end if;
  if not v_ativa then
    if exists (select 1 from public.produto_loja where loja_id = v_id and saldo > 0) then
      raise exception 'Não é possível desativar: a loja ainda tem produtos em estoque. Zere o estoque antes (transferência ou inventário).';
    end if;
    if (select count(*) from public.lojas where ativa and not virtual and id <> v_id) = 0 then
      raise exception 'O sistema precisa de pelo menos uma loja ativa.';
    end if;
  end if;
  update public.lojas set nome = v_nome, cor = v_cor, ativa = v_ativa where id = v_id;
  if not found then raise exception 'Loja não encontrada.'; end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 2b. ESTOQUE ATUAL: cada usuário trabalha "dentro" de um estoque por vez.
--     Ao entrar no sistema, escolhe o estoque e digita a senha do estoque.
--     Entradas, saídas, inventário e transferências (saída) só acontecem
--     no estoque em que a pessoa está. Regra conferida aqui no banco.
-- ---------------------------------------------------------------------
alter table public.lojas
  add column if not exists senha_salt text,
  add column if not exists senha_hash text;
alter table public.usuarios
  add column if not exists loja_atual smallint references public.lojas (id);

create or replace function public.fn_hash_senha_loja(p_salt text, p_senha text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(p_salt || ':' || p_senha, 'UTF8')), 'hex');
$$;

-- senha padrão das lojas: Galaxys2!  (o administrador troca em Configurações)
update public.lojas set senha_salt = md5(random()::text || id::text) where senha_salt is null;
update public.lojas set senha_hash = public.fn_hash_senha_loja(senha_salt, 'Galaxys2!') where senha_hash is null;

-- loja nova também nasce com a senha padrão
create or replace function public.fn_loja_senha_padrao()
returns trigger language plpgsql as $$
begin
  if new.senha_salt is null then new.senha_salt := md5(random()::text || clock_timestamp()::text); end if;
  if new.senha_hash is null then new.senha_hash := public.fn_hash_senha_loja(new.senha_salt, 'Galaxys2!'); end if;
  return new;
end $$;
drop trigger if exists loja_senha_padrao on public.lojas;
create trigger loja_senha_padrao before insert on public.lojas for each row execute function public.fn_loja_senha_padrao();

-- ninguém do aplicativo lê a senha (nem criptografada)
revoke select on public.lojas from authenticated;
grant select (id, codigo, nome, cor, ordem, ativa, ml_seller_id, criado_em, virtual) on public.lojas to authenticated;

-- A troca de estoque atual não precisa virar "alterou usuário" na auditoria
-- (o log já registra "entrou no estoque").
create or replace function public.fn_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reg jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'usuarios' and (to_jsonb(old) - 'loja_atual') = (to_jsonb(new) - 'loja_atual') then
    return new;
  end if;
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

-- Entrar num estoque (confere a senha do estoque). Devolve true/false.
create or replace function public.entrar_loja(p_loja smallint, p_senha text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  l public.lojas;
begin
  perform public.fn_exigir_usuario();
  select * into l from public.lojas where id = p_loja and ativa;
  if not found then raise exception 'Estoque inválido ou desativado.'; end if;
  if l.senha_hash <> public.fn_hash_senha_loja(l.senha_salt, coalesce(p_senha, '')) then
    insert into public.auditoria (usuario_id, usuario_nome, acao, tabela, registro_id, depois)
    values (auth.uid(), (select nome from public.usuarios where id = auth.uid()), 'errou a senha do estoque', 'login',
            l.id::text, jsonb_build_object('nome', l.nome));
    return false;
  end if;
  update public.usuarios set loja_atual = l.id where id = auth.uid();
  insert into public.auditoria (usuario_id, usuario_nome, acao, tabela, registro_id, depois)
  values (auth.uid(), (select nome from public.usuarios where id = auth.uid()), 'entrou no estoque', 'login',
          l.id::text, jsonb_build_object('nome', l.nome));
  return true;
end $$;

-- Sair do estoque (ao fazer login de novo, a escolha é pedida outra vez)
create or replace function public.sair_loja()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_usuario();
  update public.usuarios set loja_atual = null where id = auth.uid();
end $$;

-- Trocar a senha de um estoque (somente admin)
create or replace function public.definir_senha_loja(p_loja smallint, p_senha text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_admin();
  if length(coalesce(p_senha, '')) < 6 then raise exception 'A senha do estoque precisa ter pelo menos 6 caracteres.'; end if;
  update public.lojas set senha_salt = md5(random()::text || clock_timestamp()::text) where id = p_loja;
  update public.lojas set senha_hash = public.fn_hash_senha_loja(senha_salt, p_senha) where id = p_loja;
  if not found then raise exception 'Estoque não encontrado.'; end if;
  insert into public.auditoria (usuario_id, usuario_nome, acao, tabela, registro_id, depois)
  values (auth.uid(), (select nome from public.usuarios where id = auth.uid()), 'alterou a senha do estoque', 'lojas',
          p_loja::text, jsonb_build_object('nome', (select nome from public.lojas where id = p_loja)));
end $$;

-- A loja do lançamento precisa ser o estoque em que o usuário está
create or replace function public.fn_exigir_loja_atual(p_loja smallint, p_acao text)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_atual smallint := (select loja_atual from public.usuarios where id = auth.uid());
begin
  if v_atual is null then
    raise exception 'Escolha em qual estoque você vai trabalhar antes de lançar.';
  end if;
  if v_atual is distinct from p_loja then
    raise exception 'Você está no estoque %. Para % em %, troque de estoque (com a senha dele).',
      (select nome from public.lojas where id = v_atual), p_acao, coalesce((select nome from public.lojas where id = p_loja), 'outra loja');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Operações: data de referência e proteção contra duplicidade
-- ---------------------------------------------------------------------
alter table public.operacoes
  add column if not exists data_referencia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  add column if not exists chave text unique;   -- identificador único do envio (evita lançar 2x por clique duplo)

-- Data informada pelo usuário: não pode ser futura nem muito antiga
create or replace function public.fn_data_referencia(p text)
returns date language plpgsql stable as $$
declare
  v date := coalesce(nullif(p, '')::date, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if v > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data não pode ser no futuro.';
  end if;
  if v < date '2000-01-01' then
    raise exception 'Data inválida.';
  end if;
  return v;
end $$;

-- Se já existe operação com esta chave (clique duplo / reenvio), devolve a existente
create or replace function public.fn_operacao_por_chave(p_chave text)
returns bigint language sql stable security definer set search_path = public as $$
  select id from public.operacoes where p_chave is not null and chave = p_chave;
$$;

-- ---------------------------------------------------------------------
-- 4. Produtos: validações extras, exclusão de produto sem histórico
-- ---------------------------------------------------------------------
-- Código de barras: só números; se tiver 8, 12, 13 ou 14 dígitos confere o dígito verificador (GTIN)
create or replace function public.ean_valido(p text)
returns boolean language plpgsql immutable as $$
declare
  v text := coalesce(p, '');
  soma int := 0; i int; n int; dv int;
begin
  if v !~ '^[0-9]{4,14}$' then return false; end if;
  n := length(v);
  if n not in (8, 12, 13, 14) then return true; end if;  -- código interno: aceita
  for i in 1..n - 1 loop
    soma := soma + substr(v, i, 1)::int * case when (n - i) % 2 = 1 then 3 else 1 end;
  end loop;
  dv := (10 - soma % 10) % 10;
  return substr(v, n, 1)::int = dv;
end $$;

create or replace function public.salvar_produto(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := nullif(p ->> 'id', '')::bigint;
  v_sku text := upper(trim(coalesce(p ->> 'sku', '')));
  v_ean text := nullif(regexp_replace(coalesce(p ->> 'ean', ''), '\s', '', 'g'), '');
  v_nome text := trim(coalesce(p ->> 'nome', ''));
  v_custo numeric := coalesce(nullif(p ->> 'preco_custo', '')::numeric, 0);
  v_venda numeric := coalesce(nullif(p ->> 'preco_venda', '')::numeric, 0);
  v_outro text;
  v_k text;
  v_v jsonb;
  v_min int;
begin
  perform public.fn_exigir_permissao('produtos', 'cadastrar ou editar produtos');
  if v_nome = '' then raise exception 'O nome do produto é obrigatório.'; end if;
  if length(v_nome) > 200 then raise exception 'Nome muito longo (máximo 200 caracteres).'; end if;
  if v_sku <> '' and v_sku !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$' then
    raise exception 'SKU inválido: use só letras, números, ponto, hífen ou barra (até 40 caracteres).';
  end if;
  if v_ean is not null and not public.ean_valido(v_ean) then
    raise exception 'Código de barras inválido: confira os dígitos (só números; o último dígito é verificador).';
  end if;
  if v_custo < 0 or v_venda < 0 then raise exception 'Preços não podem ser negativos.'; end if;
  if v_custo > 1000000 or v_venda > 1000000 then raise exception 'Preço fora do limite.'; end if;
  if v_sku <> '' then
    select nome into v_outro from public.produtos where sku = v_sku and id is distinct from v_id;
    if v_outro is not null then raise exception 'Já existe um produto com o SKU %: "%".', v_sku, v_outro; end if;
  end if;
  if v_ean is not null then
    select nome into v_outro from public.produtos where ean = v_ean and id is distinct from v_id;
    if v_outro is not null then raise exception 'Já existe um produto com o código de barras %: "%".', v_ean, v_outro; end if;
  end if;

  if v_id is null then
    insert into public.produtos (nome, sku, ean, categoria_id, marca_id, unidade, preco_custo, preco_venda,
                                 foto_path, observacoes, ml_item_id)
    values (v_nome, v_sku, v_ean, public.fn_categoria_id(p ->> 'categoria'), public.fn_marca_id(p ->> 'marca'),
            coalesce(nullif(upper(trim(p ->> 'unidade')), ''), 'UN'), v_custo, v_venda,
            nullif(p ->> 'foto_path', ''), nullif(trim(coalesce(p ->> 'observacoes', '')), ''),
            nullif(trim(coalesce(p ->> 'ml_item_id', '')), ''))
    returning id into v_id;
  else
    update public.produtos set
      nome = v_nome,
      sku = case when v_sku = '' then sku else v_sku end,
      ean = v_ean,
      categoria_id = public.fn_categoria_id(p ->> 'categoria'),
      marca_id = public.fn_marca_id(p ->> 'marca'),
      unidade = coalesce(nullif(upper(trim(p ->> 'unidade')), ''), 'UN'),
      preco_custo = v_custo,
      preco_venda = v_venda,
      foto_path = nullif(p ->> 'foto_path', ''),
      observacoes = nullif(trim(coalesce(p ->> 'observacoes', '')), ''),
      ml_item_id = nullif(trim(coalesce(p ->> 'ml_item_id', '')), '')
    where id = v_id;
    if not found then raise exception 'Produto não encontrado.'; end if;
    update public.produtos set custo_medio = preco_custo
     where id = v_id and not exists (select 1 from public.produto_loja where produto_id = v_id and saldo > 0);
  end if;

  if jsonb_typeof(p -> 'minimos') = 'object' then
    for v_k, v_v in select * from jsonb_each(p -> 'minimos') loop
      v_min := coalesce(nullif(v_v #>> '{}', '')::int, 0);
      if v_min < 0 then raise exception 'Estoque mínimo não pode ser negativo.'; end if;
      update public.produto_loja set estoque_minimo = v_min
       where produto_id = v_id and loja_id = v_k::smallint
         and loja_id in (select id from public.lojas where not virtual);
    end loop;
  end if;
  return v_id;
end $$;

-- Inativar/reativar: somente admin.
create or replace function public.definir_produto_ativo(p_id bigint, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_admin();
  update public.produtos set ativo = p_ativo where id = p_id;
  if not found then raise exception 'Produto não encontrado.'; end if;
end $$;

-- Excluir de vez: somente admin e somente produto que NUNCA teve movimentação
create or replace function public.excluir_produto(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_exigir_admin();
  if exists (select 1 from public.movimentacoes where produto_id = p_id)
     or exists (select 1 from public.transferencia_itens where produto_id = p_id) then
    raise exception 'Este produto já teve movimentação e não pode ser excluído (o histórico precisa ser mantido). Use "Inativar".';
  end if;
  delete from public.produtos where id = p_id;
  if not found then raise exception 'Produto não encontrado.'; end if;
end $$;

-- Importação de planilha agora exige permissão de produtos (salvar_produto já confere)

-- ---------------------------------------------------------------------
-- 5. Transferências (imediatas: sai de uma loja e entra na outra na hora)
-- ---------------------------------------------------------------------
do $$ begin
  create type public.status_transferencia as enum ('concluida', 'estornada');
exception when duplicate_object then null; end $$;

create table if not exists public.transferencias (
  id               bigserial primary key,
  status           public.status_transferencia not null default 'concluida',
  loja_origem_id   smallint not null references public.lojas (id),
  loja_destino_id  smallint not null references public.lojas (id),
  observacao       text,
  nota_fiscal_id   bigint references public.notas_fiscais (id),
  chave            text unique,                 -- evita gravar 2x o mesmo formulário
  usuario_id       uuid references public.usuarios (id),
  criado_em        timestamptz not null default now(),
  estornado_por    uuid references public.usuarios (id),
  estornado_em     timestamptz,
  motivo_estorno   text,
  check (loja_origem_id <> loja_destino_id)
);
create index if not exists transferencias_criado_idx on public.transferencias (criado_em desc);

create table if not exists public.transferencia_itens (
  transferencia_id  bigint not null references public.transferencias (id) on delete cascade,
  produto_id        bigint not null references public.produtos (id) on delete restrict,
  quantidade        int not null check (quantidade > 0),
  primary key (transferencia_id, produto_id)
);

alter table public.operacoes add column if not exists transferencia_id bigint references public.transferencias (id);
create index if not exists operacoes_transf_idx on public.operacoes (transferencia_id);

-- Confere se há saldo suficiente (com mensagem clara)
create or replace function public.fn_exigir_disponivel(p_produto bigint, p_loja smallint, p_qtd int)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_saldo int;
begin
  select saldo into v_saldo from public.produto_loja where produto_id = p_produto and loja_id = p_loja;
  v_saldo := coalesce(v_saldo, 0);
  if p_qtd > v_saldo then
    raise exception 'Estoque insuficiente de "%" na loja %: disponível %, solicitado %.',
      (select nome from public.produtos where id = p_produto), (select nome from public.lojas where id = p_loja),
      v_saldo, p_qtd;
  end if;
end $$;

-- 5.1 TRANSFERIR (tudo ou nada)
-- p = {"origem_id","destino_id","itens":[{"produto_id","quantidade"}],"observacao","nota":{...},"chave"}
create or replace function public.registrar_transferencia(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_op bigint;
  v_origem smallint := nullif(p ->> 'origem_id', '')::smallint;
  v_destino smallint := nullif(p ->> 'destino_id', '')::smallint;
  v_chave text := nullif(p ->> 'chave', '');
  v_item record;
  v_custo numeric;
begin
  perform public.fn_exigir_permissao('transferir', 'fazer transferências');
  if v_chave is not null then
    select id into v_id from public.transferencias where chave = v_chave;
    if v_id is not null then return v_id; end if;   -- reenvio do mesmo formulário: não duplica
  end if;
  perform public.fn_exigir_loja(v_origem);
  perform public.fn_exigir_loja(v_destino);
  if v_origem = v_destino then raise exception 'A loja de origem e a de destino precisam ser diferentes.'; end if;
  -- só se transfere A PARTIR do estoque em que se está (mover do FULL só pelo painel do FULL)
  perform public.fn_exigir_loja_atual(v_origem, 'tirar mercadoria');

  insert into public.transferencias (loja_origem_id, loja_destino_id, observacao, nota_fiscal_id, chave, usuario_id)
  values (v_origem, v_destino, nullif(trim(coalesce(p ->> 'observacao', '')), ''), public.fn_criar_nota(p -> 'nota'),
          v_chave, auth.uid())
  returning id into v_id;

  insert into public.operacoes (tipo, motivo, loja_origem_id, loja_destino_id, nota_fiscal_id, observacao, transferencia_id, usuario_id)
  select 'transferencia', 'transferencia', v_origem, v_destino, t.nota_fiscal_id, t.observacao, t.id, auth.uid()
    from public.transferencias t where t.id = v_id
  returning id into v_op;

  for v_item in select * from public.fn_ler_itens(p -> 'itens') loop
    perform 1 from public.produto_loja where produto_id = v_item.produto_id and loja_id = v_origem for update;
    perform public.fn_exigir_disponivel(v_item.produto_id, v_origem, v_item.quantidade);
    select custo_medio into v_custo from public.produtos where id = v_item.produto_id;
    perform public.fn_movimentar(v_op, v_item.produto_id, v_origem, -v_item.quantidade, v_custo);
    perform public.fn_movimentar(v_op, v_item.produto_id, v_destino, v_item.quantidade, v_custo);
    insert into public.transferencia_itens (transferencia_id, produto_id, quantidade)
    values (v_id, v_item.produto_id, v_item.quantidade);
  end loop;
  return v_id;
end $$;

-- 5.2 ESTORNAR uma transferência (volta tudo do destino para a origem)
create or replace function public.estornar_transferencia(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.transferencias;
  v_item record;
  v_op bigint;
begin
  perform public.fn_exigir_permissao('estornar', 'estornar lançamentos');
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  select * into t from public.transferencias where id = p_id for update;
  if not found then raise exception 'Transferência não encontrada.'; end if;
  if t.status = 'estornada' then raise exception 'Esta transferência já foi estornada.'; end if;
  -- o estorno tira mercadoria do destino: precisa estar no estoque de destino
  perform public.fn_exigir_loja_atual(t.loja_destino_id, 'desfazer esta transferência (a mercadoria sai de lá)');

  insert into public.operacoes (tipo, motivo, loja_origem_id, loja_destino_id, nota_fiscal_id, observacao, transferencia_id,
                                estorno_de, usuario_id)
  select 'estorno', trim(p_motivo), t.loja_destino_id, t.loja_origem_id, t.nota_fiscal_id,
         'Estorno da transferência nº ' || t.id, t.id, o.id, auth.uid()
    from public.operacoes o where o.transferencia_id = t.id and o.tipo = 'transferencia'
  returning id into v_op;

  for v_item in select * from public.transferencia_itens where transferencia_id = p_id order by produto_id loop
    perform 1 from public.produto_loja where produto_id = v_item.produto_id and loja_id = t.loja_destino_id for update;
    perform public.fn_exigir_disponivel(v_item.produto_id, t.loja_destino_id, v_item.quantidade);
    perform public.fn_movimentar(v_op, v_item.produto_id, t.loja_destino_id, -v_item.quantidade, null);
    perform public.fn_movimentar(v_op, v_item.produto_id, t.loja_origem_id, v_item.quantidade, null);
  end loop;
  update public.operacoes set estornada_por = v_op where transferencia_id = p_id and tipo = 'transferencia';
  update public.transferencias set status = 'estornada', estornado_por = auth.uid(), estornado_em = now(),
         motivo_estorno = trim(p_motivo) where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 6. Entrada, saída, ajuste e estorno com permissões, data e anti-duplicidade
-- ---------------------------------------------------------------------
drop function if exists public.registrar_entrada(smallint, jsonb, text, jsonb, text, text);
drop function if exists public.registrar_saida(smallint, jsonb, text, jsonb, text);
drop function if exists public.registrar_transferencia(smallint, smallint, jsonb, jsonb, text);
drop function if exists public.registrar_ajuste(smallint, jsonb, text, text);

-- p = {"loja_id","itens":[{"produto_id","quantidade","custo_unitario"}],"motivo","nota":{...},
--      "observacao","origem","data","chave"}
create or replace function public.registrar_entrada(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_op bigint;
  v_item record;
  v_total int;
  v_loja smallint := nullif(p ->> 'loja_id', '')::smallint;
  v_motivo text := coalesce(nullif(p ->> 'motivo', ''), 'compra');
  v_obs text := nullif(trim(coalesce(p ->> 'observacao', '')), '');
begin
  perform public.fn_exigir_permissao('entrada', 'registrar entradas');
  v_op := public.fn_operacao_por_chave(p ->> 'chave');
  if v_op is not null then return v_op; end if;
  perform public.fn_exigir_loja(v_loja);
  perform public.fn_exigir_loja_atual(v_loja, 'dar entrada');
  if v_motivo not in ('compra', 'devolucao', 'bonificacao', 'outro') then raise exception 'Motivo de entrada inválido.'; end if;
  if v_motivo = 'outro' and v_obs is null then raise exception 'Para o motivo "Outro", descreva na observação.'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p -> 'itens', '[]')) e
              where nullif(e ->> 'custo_unitario', '') is not null and (e ->> 'custo_unitario')::numeric < 0) then
    raise exception 'O custo unitário não pode ser negativo.';
  end if;

  insert into public.operacoes (tipo, motivo, loja_destino_id, nota_fiscal_id, observacao, origem, usuario_id, data_referencia, chave)
  values ('entrada', v_motivo, v_loja, public.fn_criar_nota(p -> 'nota'), v_obs,
          coalesce(nullif(p ->> 'origem', ''), 'manual'), auth.uid(), public.fn_data_referencia(p ->> 'data'),
          nullif(p ->> 'chave', ''))
  returning id into v_op;

  for v_item in select * from public.fn_ler_itens(p -> 'itens') loop
    if v_item.custo_unitario is not null then
      select coalesce(sum(saldo), 0) into v_total from public.produto_loja where produto_id = v_item.produto_id;
      update public.produtos
         set custo_medio = case when v_total <= 0 then v_item.custo_unitario
                                else round((v_total * custo_medio + v_item.quantidade * v_item.custo_unitario)
                                           / (v_total + v_item.quantidade), 4) end
       where id = v_item.produto_id;
    end if;
    perform public.fn_movimentar(v_op, v_item.produto_id, v_loja, v_item.quantidade,
      coalesce(v_item.custo_unitario, (select custo_medio from public.produtos where id = v_item.produto_id)));
  end loop;
  return v_op;
end $$;

create or replace function public.registrar_saida(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_op bigint;
  v_item record;
  v_loja smallint := nullif(p ->> 'loja_id', '')::smallint;
  v_motivo text := nullif(p ->> 'motivo', '');
  v_obs text := nullif(trim(coalesce(p ->> 'observacao', '')), '');
begin
  perform public.fn_exigir_permissao('saida', 'registrar saídas');
  v_op := public.fn_operacao_por_chave(p ->> 'chave');
  if v_op is not null then return v_op; end if;
  perform public.fn_exigir_loja(v_loja);
  perform public.fn_exigir_loja_atual(v_loja, 'dar saída');
  if v_motivo is null then raise exception 'Informe o motivo da saída.'; end if;
  if v_motivo not in ('venda', 'perda', 'avaria', 'uso_interno', 'devolucao_fornecedor', 'outro') then
    raise exception 'Motivo de saída inválido.';
  end if;
  if v_motivo = 'outro' and v_obs is null then raise exception 'Para o motivo "Outro", descreva na observação.'; end if;

  insert into public.operacoes (tipo, motivo, loja_origem_id, nota_fiscal_id, observacao, usuario_id, data_referencia, chave)
  values ('saida', v_motivo, v_loja, public.fn_criar_nota(p -> 'nota'), v_obs, auth.uid(),
          public.fn_data_referencia(p ->> 'data'), nullif(p ->> 'chave', ''))
  returning id into v_op;

  for v_item in select * from public.fn_ler_itens(p -> 'itens') loop
    perform 1 from public.produto_loja where produto_id = v_item.produto_id and loja_id = v_loja for update;
    perform public.fn_exigir_disponivel(v_item.produto_id, v_loja, v_item.quantidade);
    perform public.fn_movimentar(v_op, v_item.produto_id, v_loja, -v_item.quantidade,
      (select custo_medio from public.produtos where id = v_item.produto_id));
  end loop;
  return v_op;
end $$;

-- AJUSTE DE INVENTÁRIO
-- p = {"loja_id","motivo","observacao","chave",
--      "itens":[{"produto_id","quantidade_contada","saldo_esperado"}]}
-- "saldo_esperado" = o saldo que aparecia na tela durante a contagem. Se mudou
-- (alguém lançou algo no meio da contagem), o sistema avisa em vez de apagar o lançamento do colega.
create or replace function public.registrar_ajuste(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_op bigint;
  v_item record;
  v_saldo int;
  v_difs jsonb := '[]'::jsonb;
  v_d jsonb;
  v_loja smallint := nullif(p ->> 'loja_id', '')::smallint;
  v_motivo text := trim(coalesce(p ->> 'motivo', ''));
  v_itens jsonb := p -> 'itens';
begin
  perform public.fn_exigir_permissao('inventario', 'fazer inventário/ajuste');
  v_op := public.fn_operacao_por_chave(p ->> 'chave');
  if v_op is not null then return v_op; end if;
  perform public.fn_exigir_loja(v_loja);
  perform public.fn_exigir_loja_atual(v_loja, 'fazer inventário');
  if v_motivo = '' then raise exception 'O motivo do ajuste é obrigatório.'; end if;
  if v_itens is null or jsonb_typeof(v_itens) <> 'array' or jsonb_array_length(v_itens) = 0 then
    raise exception 'Informe pelo menos um produto contado.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_itens) e
     where jsonb_typeof(e -> 'quantidade_contada') <> 'number'
        or (e ->> 'quantidade_contada')::numeric < 0
        or (e ->> 'quantidade_contada')::numeric <> trunc((e ->> 'quantidade_contada')::numeric)
  ) then
    raise exception 'A quantidade contada deve ser um número inteiro (zero ou mais).';
  end if;

  for v_item in
    select x.produto_id, max(x.quantidade_contada) as contada, max(x.saldo_esperado) as esperado
      from jsonb_to_recordset(v_itens) as x (produto_id bigint, quantidade_contada int, saldo_esperado int)
     group by x.produto_id order by x.produto_id
  loop
    if not exists (select 1 from public.produtos where id = v_item.produto_id) then
      raise exception 'Produto % não encontrado.', v_item.produto_id;
    end if;
    insert into public.produto_loja (produto_id, loja_id) values (v_item.produto_id, v_loja) on conflict do nothing;
    select saldo into v_saldo from public.produto_loja
     where produto_id = v_item.produto_id and loja_id = v_loja for update;
    if v_item.esperado is not null and v_item.esperado <> v_saldo then
      raise exception 'O saldo de "%" mudou durante a contagem (era %, agora é %): alguém lançou uma movimentação. Atualize a tela e confira.',
        (select nome from public.produtos where id = v_item.produto_id), v_item.esperado, v_saldo;
    end if;
    if v_item.contada <> v_saldo then
      v_difs := v_difs || jsonb_build_object('produto_id', v_item.produto_id, 'dif', v_item.contada - v_saldo);
    end if;
  end loop;

  if jsonb_array_length(v_difs) = 0 then
    return null;
  end if;

  insert into public.operacoes (tipo, motivo, loja_destino_id, observacao, usuario_id, chave)
  values ('ajuste', v_motivo, v_loja, nullif(trim(coalesce(p ->> 'observacao', '')), ''), auth.uid(), nullif(p ->> 'chave', ''))
  returning id into v_op;
  for v_d in select * from jsonb_array_elements(v_difs) loop
    perform public.fn_movimentar(v_op, (v_d ->> 'produto_id')::bigint, v_loja, (v_d ->> 'dif')::int,
      (select custo_medio from public.produtos where id = (v_d ->> 'produto_id')::bigint));
  end loop;
  return v_op;
end $$;

-- Estorno de lançamento avulso (entradas, saídas, ajustes). Transferências: estornar_transferencia.
create or replace function public.estornar_operacao(p_operacao_id bigint, p_motivo text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_orig public.operacoes;
  v_op bigint;
  v_m record;
  v_total int;
begin
  perform public.fn_exigir_permissao('estornar', 'estornar lançamentos');
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  select * into v_orig from public.operacoes where id = p_operacao_id for update;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if v_orig.transferencia_id is not null then
    raise exception 'Este lançamento faz parte da transferência nº %. Estorne pela própria transferência.', v_orig.transferencia_id;
  end if;
  if v_orig.tipo = 'estorno' then raise exception 'Um estorno não pode ser estornado.'; end if;
  if v_orig.estornada_por is not null then raise exception 'Este lançamento já foi estornado.'; end if;
  -- só estorna lançamento do estoque em que está
  if not exists (select 1 from public.movimentacoes m join public.usuarios u on u.id = auth.uid()
                  where m.operacao_id = v_orig.id and m.loja_id = u.loja_atual)
     or exists (select 1 from public.movimentacoes m join public.usuarios u on u.id = auth.uid()
                 where m.operacao_id = v_orig.id and m.loja_id is distinct from u.loja_atual) then
    raise exception 'Este lançamento é de outro estoque. Entre no estoque dele para estornar.';
  end if;

  insert into public.operacoes (tipo, motivo, loja_origem_id, loja_destino_id, nota_fiscal_id, observacao, estorno_de, usuario_id)
  values ('estorno', trim(p_motivo), v_orig.loja_destino_id, v_orig.loja_origem_id, v_orig.nota_fiscal_id,
          'Estorno do lançamento nº ' || v_orig.id, v_orig.id, auth.uid())
  returning id into v_op;

  for v_m in
    select produto_id, loja_id, quantidade, custo_unitario
      from public.movimentacoes where operacao_id = v_orig.id
     order by produto_id, quantidade
  loop
    if v_orig.tipo = 'entrada' and v_m.custo_unitario is not null then
      select coalesce(sum(saldo), 0) into v_total from public.produto_loja where produto_id = v_m.produto_id;
      if v_total - v_m.quantidade > 0 then
        update public.produtos
           set custo_medio = greatest(0, round((v_total * custo_medio - v_m.quantidade * v_m.custo_unitario)
                                               / (v_total - v_m.quantidade), 4))
         where id = v_m.produto_id;
      end if;
    end if;
    if v_m.quantidade > 0 then
      perform 1 from public.produto_loja where produto_id = v_m.produto_id and loja_id = v_m.loja_id for update;
      perform public.fn_exigir_disponivel(v_m.produto_id, v_m.loja_id, v_m.quantidade);
    end if;
    perform public.fn_movimentar(v_op, v_m.produto_id, v_m.loja_id, -v_m.quantidade, v_m.custo_unitario);
  end loop;

  update public.operacoes set estornada_por = v_op where id = v_orig.id;
  return v_op;
end $$;

-- ---------------------------------------------------------------------
-- 7. Visões atualizadas
-- ---------------------------------------------------------------------
drop view if exists public.vw_movimentacoes;
create view public.vw_movimentacoes with (security_invoker = true) as
select
  m.id, m.criado_em, o.data_referencia, m.operacao_id, o.tipo, o.motivo, o.observacao, o.origem,
  m.produto_id, p.nome as produto_nome, p.sku, p.ean, p.unidade,
  m.loja_id, l.nome as loja_nome, l.codigo as loja_codigo, l.cor as loja_cor,
  m.quantidade, m.custo_unitario, m.saldo_apos - m.quantidade as saldo_antes, m.saldo_apos,
  m.usuario_id, coalesce(u.nome, 'Sistema') as usuario_nome,
  o.nota_fiscal_id, nf.numero as nf_numero, nf.serie as nf_serie, nf.chave_acesso as nf_chave,
  f.nome as fornecedor_nome,
  o.loja_origem_id, lo.nome as origem_nome, o.loja_destino_id, ld.nome as destino_nome,
  o.estorno_de, o.estornada_por, o.transferencia_id
from public.movimentacoes m
join public.operacoes o on o.id = m.operacao_id
join public.produtos p on p.id = m.produto_id
join public.lojas l on l.id = m.loja_id
left join public.lojas lo on lo.id = o.loja_origem_id
left join public.lojas ld on ld.id = o.loja_destino_id
left join public.usuarios u on u.id = m.usuario_id
left join public.notas_fiscais nf on nf.id = o.nota_fiscal_id
left join public.fornecedores f on f.id = nf.fornecedor_id;

drop view if exists public.vw_operacoes;
create view public.vw_operacoes with (security_invoker = true) as
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
     from public.movimentacoes m where m.operacao_id = o.id)::int as qtd_unidades
from public.operacoes o
left join public.lojas lo on lo.id = o.loja_origem_id
left join public.lojas ld on ld.id = o.loja_destino_id
left join public.usuarios u on u.id = o.usuario_id
left join public.notas_fiscais nf on nf.id = o.nota_fiscal_id
left join public.fornecedores f on f.id = nf.fornecedor_id;

create or replace view public.vw_transferencias with (security_invoker = true) as
select
  t.*,
  lo.nome as origem_nome, lo.cor as origem_cor, ld.nome as destino_nome, ld.cor as destino_cor,
  coalesce(u.nome, 'Sistema') as usuario_nome, ux.nome as estornado_por_nome, nf.numero as nf_numero,
  (select count(*) from public.transferencia_itens i where i.transferencia_id = t.id)::int as qtd_produtos,
  (select coalesce(sum(i.quantidade), 0) from public.transferencia_itens i where i.transferencia_id = t.id)::int as total_unidades
from public.transferencias t
join public.lojas lo on lo.id = t.loja_origem_id
join public.lojas ld on ld.id = t.loja_destino_id
left join public.usuarios u on u.id = t.usuario_id
left join public.usuarios ux on ux.id = t.estornado_por
left join public.notas_fiscais nf on nf.id = t.nota_fiscal_id;

create or replace view public.vw_transferencia_itens with (security_invoker = true) as
select i.*, p.nome as produto_nome, p.sku, p.unidade
from public.transferencia_itens i
join public.produtos p on p.id = i.produto_id;

-- LOG DE ATIVIDADES (só o administrador vê): quem fez cada mudança, num lugar só
create or replace view public.vw_log with (security_invoker = true) as
select o.criado_em as quando, o.usuario_id, coalesce(u.nome, 'Sistema') as usuario_nome, u.perfil::text as perfil,
       case o.tipo when 'entrada' then 'Entrada' when 'saida' then 'Saída' when 'ajuste' then 'Ajuste de inventário'
                   when 'transferencia' then 'Transferência' else 'Estorno' end as acao,
       concat_ws(' · ',
         nullif(concat_ws(' → ', lo.nome, ld.nome), ''),
         (select string_agg(p.nome || ' ' || case when m.quantidade > 0 then '+' else '' end || m.quantidade, ', ' order by p.nome)
            from public.movimentacoes m join public.produtos p on p.id = m.produto_id
           where m.operacao_id = o.id and (o.tipo <> 'transferencia' and o.transferencia_id is null or m.quantidade > 0)),
         nullif(o.motivo, o.tipo::text),
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
select a.criado_em, a.usuario_id, coalesce(a.usuario_nome, 'Sistema'), u.perfil::text,
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
   -- alterações de usuário feitas pelo servidor já aparecem com o nome do administrador que pediu
   and not (a.usuario_id is null and a.tabela = 'usuarios');

-- ---------------------------------------------------------------------
-- 8. Segurança (RLS) da versão 2
-- ---------------------------------------------------------------------
alter table public.transferencias        enable row level security;
alter table public.transferencia_itens   enable row level security;
create policy ler on public.transferencias        for select to authenticated using (public.eh_usuario_ativo());
create policy ler on public.transferencia_itens   for select to authenticated using (public.eh_usuario_ativo());

-- Histórico: operador sem a permissão "histórico" vê só os lançamentos que ele mesmo fez
drop policy if exists ler on public.operacoes;
drop policy if exists ler on public.movimentacoes;
create policy ler on public.operacoes for select to authenticated
  using (public.eh_usuario_ativo() and (public.tem_permissao('historico') or usuario_id = auth.uid()));
create policy ler on public.movimentacoes for select to authenticated
  using (public.eh_usuario_ativo() and (public.tem_permissao('historico') or usuario_id = auth.uid()));

-- Categorias e marcas: criar/editar com permissão de produtos; excluir só admin
drop policy if exists criar on public.categorias;
drop policy if exists editar on public.categorias;
drop policy if exists criar on public.marcas;
drop policy if exists editar on public.marcas;
create policy criar  on public.categorias for insert to authenticated with check (public.tem_permissao('produtos'));
create policy editar on public.categorias for update to authenticated using (public.tem_permissao('produtos'));
create policy criar  on public.marcas     for insert to authenticated with check (public.tem_permissao('produtos'));
create policy editar on public.marcas     for update to authenticated using (public.tem_permissao('produtos'));
-- fn_categoria_id / fn_marca_id são chamadas dentro de salvar_produto (que já confere a permissão)

-- Fornecedores: cadastro direto só admin (nas notas fiscais eles são criados automaticamente)
drop policy if exists criar on public.fornecedores;
drop policy if exists editar on public.fornecedores;
create policy criar  on public.fornecedores for insert to authenticated with check (public.eh_admin());
create policy editar on public.fornecedores for update to authenticated using (public.eh_admin());

-- Notas fiscais: completar dados/anexo exige permissão de entrada
drop policy if exists editar on public.notas_fiscais;
create policy editar on public.notas_fiscais for update to authenticated using (public.tem_permissao('entrada'));

-- Lojas: alterações somente pela função salvar_loja (admin)
drop policy if exists editar on public.lojas;
revoke update on public.lojas from authenticated;

-- O Supabase dá permissão total às tabelas novas por padrão: retiramos (gravação só pelas funções)
revoke insert, update, delete, truncate on public.transferencias, public.transferencia_itens,
  public.vw_transferencias, public.vw_transferencia_itens, public.vw_log,
  public.vw_movimentacoes, public.vw_operacoes from authenticated;
revoke all on all sequences in schema public from authenticated;
grant usage on sequence public.categorias_id_seq, public.marcas_id_seq, public.fornecedores_id_seq to authenticated;

grant select on public.transferencias, public.transferencia_itens,
  public.vw_transferencias, public.vw_transferencia_itens, public.vw_log,
  public.vw_movimentacoes, public.vw_operacoes to authenticated;
revoke all on public.transferencias, public.transferencia_itens,
  public.vw_transferencias, public.vw_transferencia_itens, public.vw_log from anon;
revoke all on public.vw_movimentacoes, public.vw_operacoes from anon;

-- Funções: revoga tudo e libera só as que o aplicativo usa
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.eh_usuario_ativo(), public.eh_admin(), public.tem_permissao(text),
  public.cnpj_valido(text), public.chave_nfe_valida(text), public.ean_valido(text),
  public.registrar_entrada(jsonb), public.registrar_saida(jsonb), public.registrar_ajuste(jsonb),
  public.estornar_operacao(bigint, text),
  public.registrar_transferencia(jsonb), public.estornar_transferencia(bigint, text),
  public.salvar_produto(jsonb), public.definir_produto_ativo(bigint, boolean), public.excluir_produto(bigint),
  public.importar_produtos(jsonb), public.salvar_loja(jsonb), public.registrar_login(),
  public.entrar_loja(smallint, text), public.sair_loja(), public.definir_senha_loja(smallint, text)
to authenticated;

-- Tempo real também para transferências
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.transferencias;
  end if;
exception when duplicate_object then null;
end $$;
