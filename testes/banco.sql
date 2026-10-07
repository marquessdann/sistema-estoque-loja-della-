-- =====================================================================
-- Bateria de testes automáticos das regras do banco (estoque e permissões).
-- Roda num banco de TESTE já com 01 + 03 + 02 aplicados (nunca em produção).
-- Cada linha "OK"/"FALHOU" mostra o resultado; ao final, um resumo.
-- =====================================================================
\set ON_ERROR_STOP 1
set client_min_messages = warning;
begin;  -- tudo é desfeito no final (rollback): o banco de teste fica limpo
\o /dev/null

create temp table resultado (n serial, teste text, ok boolean, detalhe text);
grant all on resultado to authenticated; grant usage on sequence resultado_n_seq to authenticated;

create or replace function pg_temp.checar(p_teste text, p_ok boolean, p_detalhe text default null) returns void
language plpgsql security definer as $$ begin insert into resultado (teste, ok, detalhe) values (p_teste, p_ok, p_detalhe); end $$;

-- executa um comando e espera ERRO contendo o texto informado
create or replace function pg_temp.espera_erro(p_teste text, p_sql text, p_trecho text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into resultado (teste, ok, detalhe) values (p_teste, false, 'deveria ter dado erro, mas passou');
  exception when others then
    insert into resultado (teste, ok, detalhe) values (p_teste, sqlerrm ilike '%' || p_trecho || '%', sqlerrm);
  end;
end $$;

create or replace function pg_temp.saldo(p_sku text, p_loja text) returns int language sql as $$
  select pl.saldo from produto_loja pl join produtos p on p.id = pl.produto_id join lojas l on l.id = pl.loja_id
   where p.sku = p_sku and l.codigo = p_loja $$ security definer;
create or replace function pg_temp.pid(p_sku text) returns bigint language sql security definer as $$ select id from produtos where sku = p_sku $$;
create or replace function pg_temp.lid(p_cod text) returns smallint language sql security definer as $$ select id from lojas where codigo = p_cod $$;
create or replace function pg_temp.como(p_email text) returns void language plpgsql security definer as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce((select id::text from usuarios where email = p_email), ''), false);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from usuarios where email = p_email), 'role', 'authenticated')::text, false);
end $$;
-- coloca o usuário "dentro" de um estoque (como se tivesse digitado a senha do estoque)
create or replace function pg_temp.no_estoque(p_email text, p_cod text) returns void language sql security definer as $$
  update public.usuarios set loja_atual = (select id from public.lojas where codigo = p_cod) where email = p_email $$;
grant execute on all functions in schema pg_temp to authenticated;

-- ---------- usuários de teste ----------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@teste.com', '{"nome":"Admin Teste"}');
select pg_temp.espera_erro('Cadastro público (sem convite do admin) é bloqueado',
  $$insert into auth.users (id, email) values (gen_random_uuid(), 'intruso@teste.com')$$, 'Cadastro bloqueado');
-- o servidor (chave secreta) grava o convite antes de criar o login
insert into usuarios_convites (email) values ('op1@teste.com'), ('op2@teste.com'), ('quarto@teste.com');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'op1@teste.com', '{"nome":"Operador Um"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'op2@teste.com', '{"nome":"Operador Dois"}');
select pg_temp.espera_erro('Limite de 3 usuários ativos',
  $$insert into auth.users (id, email) values (gen_random_uuid(), 'quarto@teste.com')$$, 'Limite de 3');
select pg_temp.checar('Convite é consumido (não pode ser reutilizado)', not exists (select 1 from usuarios_convites where email in ('op1@teste.com', 'op2@teste.com')));
select pg_temp.checar('1º usuário vira administrador; demais operadores',
  (select string_agg(perfil::text, ',' order by email) from usuarios) = 'admin,operador,operador');
-- operador 2 restrito: sem entrada, saída, transferência e histórico
update usuarios set perm_entrada = false, perm_saida = false, perm_transferir = false, perm_historico = false,
       perm_inventario = false where email = 'op2@teste.com';

-- todos começam dentro do DELLA ESTOQUE
update usuarios set loja_atual = (select id from lojas where codigo = 'ESTOQUE');
set role authenticated;

-- ===================== ESTOQUE ATUAL E SENHA DO ESTOQUE =====================
select pg_temp.como('op1@teste.com');
select pg_temp.checar('Senha errada do estoque é recusada', entrar_loja(pg_temp.lid('FULL_ML'), 'senhaerrada') = false);
select pg_temp.checar('Ninguém consegue ler a senha do estoque', true);
select pg_temp.espera_erro('A coluna da senha não pode ser lida pelo aplicativo', $$select senha_hash from lojas$$, 'permission denied');
select pg_temp.checar('Senha padrão Galaxys2! entra no estoque', entrar_loja(pg_temp.lid('FULL_ML'), 'Galaxys2!') = true);
select pg_temp.espera_erro('Dentro do FULL não lança entrada no DELLA ESTOQUE',
  format($$select registrar_entrada('{"loja_id":%s,"itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'Você está no estoque DELLA FULL ML');
select pg_temp.espera_erro('Dentro do FULL não tira mercadoria do DELLA ESTOQUE (transferência)',
  format($$select registrar_transferencia('{"origem_id":%s,"destino_id":%s,"itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.lid('FULL_ML'), pg_temp.pid('PIN-FINA')), 'Você está no estoque DELLA FULL ML');
select sair_loja();
select pg_temp.espera_erro('Sem escolher estoque não lança nada',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'Escolha em qual estoque');
select pg_temp.espera_erro('Operador não troca a senha do estoque', format($$select definir_senha_loja(%s::smallint, 'nova123')$$, pg_temp.lid('FULL_ML')), 'Somente o administrador');
select pg_temp.no_estoque('op1@teste.com', 'ESTOQUE');
select pg_temp.como('admin@teste.com');
select definir_senha_loja(pg_temp.lid('FULL_ML'), 'NovaSenha9');
select pg_temp.checar('Admin troca a senha do estoque: a antiga deixa de valer e a nova entra',
  entrar_loja(pg_temp.lid('FULL_ML'), 'Galaxys2!') = false and entrar_loja(pg_temp.lid('FULL_ML'), 'NovaSenha9') = true);
select pg_temp.no_estoque('admin@teste.com', 'ESTOQUE');
delete from resultado where teste = 'Ninguém consegue ler a senha do estoque';

-- ===================== PERMISSÕES =====================
select pg_temp.como('op1@teste.com');
select pg_temp.espera_erro('Operador NÃO cadastra produto', $$select salvar_produto('{"nome":"X"}')$$, 'Sem permissão');
select pg_temp.espera_erro('Operador NÃO inativa produto', $$select definir_produto_ativo(1, false)$$, 'Somente o administrador');
select pg_temp.espera_erro('Operador NÃO exclui produto', $$select excluir_produto(1)$$, 'Somente o administrador');
select pg_temp.espera_erro('Operador NÃO importa planilha', $$select importar_produtos('[{"nome":"Y"}]')$$, 'Sem permissão');
select pg_temp.espera_erro('Operador NÃO cria categoria', $$insert into categorias (nome) values ('Hack')$$, 'row-level security');
select pg_temp.espera_erro('Operador NÃO cria/edita loja', $$select salvar_loja('{"nome":"LOJA HACK"}')$$, 'Somente o administrador');
select pg_temp.espera_erro('Operador NÃO altera loja direto', $$update lojas set nome = 'X'$$, 'permission denied');
select pg_temp.espera_erro('Operador NÃO se promove a admin', $$update usuarios set perfil = 'admin'$$, 'permission denied');
select pg_temp.espera_erro('Operador NÃO altera saldo direto', $$update produto_loja set saldo = 999$$, 'permission denied');
select pg_temp.espera_erro('Operador NÃO apaga movimentação', $$delete from movimentacoes$$, 'permission denied');
select pg_temp.espera_erro('Operador NÃO altera movimentação', $$update movimentacoes set quantidade = 1$$, 'permission denied');
select pg_temp.espera_erro('Operador NÃO apaga operação', $$delete from operacoes$$, 'permission denied');
select pg_temp.espera_erro('Operador NÃO chama função interna fn_movimentar', $$select fn_movimentar(1, 1, 1::smallint, 100, 0)$$, 'permission denied');
select pg_temp.espera_erro('Operador NÃO insere transferência direto', $$insert into transferencias (loja_origem_id, loja_destino_id) values (1, 2)$$, 'permission denied');
select pg_temp.checar('Operador NÃO lê auditoria', (select count(*) from auditoria) = 0);
select pg_temp.espera_erro('Operador NÃO estorna (padrão)', $$select estornar_operacao(1, 'x')$$, 'Sem permissão');

select pg_temp.como('op2@teste.com');
select pg_temp.espera_erro('Operador sem permissão de entrada é bloqueado',
  format($$select registrar_entrada('{"loja_id":%s,"itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'Sem permissão');
select pg_temp.espera_erro('Operador sem permissão de saída é bloqueado',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'Sem permissão');
select pg_temp.espera_erro('Operador sem permissão de transferir é bloqueado',
  format($$select registrar_transferencia('{"origem_id":%s,"destino_id":%s,"itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.lid('FULL_ML'), pg_temp.pid('PIN-FINA')), 'Sem permissão');
select pg_temp.espera_erro('Operador sem permissão de inventário é bloqueado',
  format($$select registrar_ajuste('{"loja_id":%s,"motivo":"x","itens":[{"produto_id":%s,"quantidade_contada":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'Sem permissão');

-- ===================== TESTES DE ESTOQUE (pedidos) =====================
select pg_temp.como('admin@teste.com');
-- prepara: Navalha com 10 no ESTOQUE
select registrar_ajuste(format('{"loja_id":%s,"motivo":"Preparação do teste","itens":[{"produto_id":%s,"quantidade_contada":10}]}',
       pg_temp.lid('ESTOQUE'), pg_temp.pid('NAV-INOX'))::jsonb);
select pg_temp.checar('Preparação: Navalha ESTOQUE = 10', pg_temp.saldo('NAV-INOX', 'ESTOQUE') = 10);

select pg_temp.como('op1@teste.com');
select registrar_entrada(format('{"loja_id":%s,"motivo":"compra","itens":[{"produto_id":%s,"quantidade":5,"custo_unitario":14}]}',
       pg_temp.lid('ESTOQUE'), pg_temp.pid('NAV-INOX'))::jsonb);
select pg_temp.checar('Teste 1: estoque 10 + entrada 5 = 15', pg_temp.saldo('NAV-INOX', 'ESTOQUE') = 15, pg_temp.saldo('NAV-INOX', 'ESTOQUE')::text);
select pg_temp.checar('Teste 1: custo médio recalculado ((19x12 + 5x14) / 24 = 12,4167)',
  (select custo_medio from produtos where sku = 'NAV-INOX') = 12.4167, (select custo_medio::text from produtos where sku = 'NAV-INOX'));
select pg_temp.checar('Teste 1: histórico registra usuário, saldo antes e depois',
  exists (select 1 from vw_movimentacoes where sku = 'NAV-INOX' and quantidade = 5 and saldo_antes = 10 and saldo_apos = 15 and usuario_nome = 'Operador Um'));

select registrar_saida(format('{"loja_id":%s,"motivo":"venda","itens":[{"produto_id":%s,"quantidade":3}]}',
       pg_temp.lid('ESTOQUE'), pg_temp.pid('NAV-INOX'))::jsonb) as saida_teste2 \gset
select pg_temp.checar('Teste 2: estoque 15 - saída 3 = 12', pg_temp.saldo('NAV-INOX', 'ESTOQUE') = 12);

-- Teste 3: Loja A (ESTOQUE) com 20 -> transferir 5 para Loja B (FULL), na hora
select pg_temp.como('admin@teste.com');
select registrar_ajuste(format('{"loja_id":%s,"motivo":"Preparação","itens":[{"produto_id":%s,"quantidade_contada":20}]}',
       pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-OBLQ'))::jsonb);
select pg_temp.saldo('PIN-OBLQ', 'FULL_ML') as full_antes \gset
select pg_temp.como('op1@teste.com');
select registrar_transferencia(format('{"origem_id":%s,"destino_id":%s,"chave":"t3","itens":[{"produto_id":%s,"quantidade":5}]}',
       pg_temp.lid('ESTOQUE'), pg_temp.lid('FULL_ML'), pg_temp.pid('PIN-OBLQ'))::jsonb) as t3 \gset
select pg_temp.checar('Teste 3: operador transfere na hora -> origem 20 - 5 = 15',  pg_temp.saldo('PIN-OBLQ', 'ESTOQUE') = 15);
select pg_temp.checar('Teste 3: destino = anterior + 5', pg_temp.saldo('PIN-OBLQ', 'FULL_ML') = :full_antes + 5);
select pg_temp.checar('Teste 3: transferência registrada com quem fez',
  (select status::text || usuario_nome from vw_transferencias where id = :t3) = 'concluidaOperador Um');
select registrar_transferencia(format('{"origem_id":%s,"destino_id":%s,"chave":"t3","itens":[{"produto_id":%s,"quantidade":5}]}',
       pg_temp.lid('ESTOQUE'), pg_temp.lid('FULL_ML'), pg_temp.pid('PIN-OBLQ'))::jsonb) as t3b \gset
select pg_temp.checar('Transferência duplicada (mesmo formulário 2x) não transfere de novo',
  :t3 = :t3b and pg_temp.saldo('PIN-OBLQ', 'ESTOQUE') = 15 and (select count(*) from transferencias where chave = 't3') = 1);
select pg_temp.espera_erro('Transferência com um item sem saldo não grava nenhum item',
  format($$select registrar_transferencia('{"origem_id":%s,"destino_id":%s,"itens":[{"produto_id":%s,"quantidade":1},{"produto_id":%s,"quantidade":999}]}')$$,
    pg_temp.lid('ESTOQUE'), pg_temp.lid('FULL_ML'), pg_temp.pid('PIN-OBLQ'), pg_temp.pid('PIN-RETA')), 'insuficiente');
select pg_temp.checar('... e o primeiro item continua intacto', pg_temp.saldo('PIN-OBLQ', 'ESTOQUE') = 15);

-- Teste 4: retirar mais que o disponível
select pg_temp.espera_erro('Teste 4: saída maior que o estoque é bloqueada com mensagem clara',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","itens":[{"produto_id":%s,"quantidade":999}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('NAV-INOX')),
  'Estoque insuficiente de "Navalha Profissional Aço Inox"');
select pg_temp.checar('Teste 4: saldo não mudou após o bloqueio', pg_temp.saldo('NAV-INOX', 'ESTOQUE') = 12);
select pg_temp.espera_erro('Transferência maior que o disponível é bloqueada',
  format($$select registrar_transferencia('{"origem_id":%s,"destino_id":%s,"itens":[{"produto_id":%s,"quantidade":999}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.lid('FULL_ML'), pg_temp.pid('NAV-INOX')),
  'insuficiente');
select pg_temp.checar('Transferência bloqueada não deixou registro', not exists (select 1 from transferencia_itens where quantidade = 999));

-- Teste 5: cancelar (estornar) uma movimentação
select pg_temp.como('admin@teste.com');
select estornar_operacao(:saida_teste2, 'Venda lançada por engano') as est5 \gset
select pg_temp.checar('Teste 5: estorno da saída devolve o estoque (12 + 3 = 15)', pg_temp.saldo('NAV-INOX', 'ESTOQUE') = 15);
select pg_temp.checar('Teste 5: histórico registra o estorno e marca o original',
  (select estornada_por from operacoes where id = :saida_teste2) = :est5
  and exists (select 1 from vw_movimentacoes where operacao_id = :est5 and quantidade = 3 and tipo = 'estorno'));
select pg_temp.espera_erro('Estornar duas vezes é bloqueado', format($$select estornar_operacao(%s, 'de novo')$$, :saida_teste2), 'já foi estornado');
select pg_temp.espera_erro('Estornar um estorno é bloqueado', format($$select estornar_operacao(%s, 'x')$$, :est5), 'não pode ser estornado');
select pg_temp.espera_erro('Estorno sem motivo é bloqueado', format($$select estornar_operacao(%s, '')$$, :saida_teste2), 'motivo');

-- ===================== ESTORNO DE TRANSFERÊNCIA =====================
select pg_temp.como('admin@teste.com');
select pg_temp.saldo('KIT-PIN3', 'ESTOQUE') as k_e \gset
select pg_temp.saldo('KIT-PIN3', 'FULL_ML') as k_f \gset
select registrar_transferencia(format('{"origem_id":%s,"destino_id":%s,"itens":[{"produto_id":%s,"quantidade":2}]}',
       pg_temp.lid('ESTOQUE'), pg_temp.lid('FULL_ML'), pg_temp.pid('KIT-PIN3'))::jsonb) as tn \gset
select pg_temp.espera_erro('Estorno avulso de metade da transferência é bloqueado',
  format($$select estornar_operacao(%s, 'x')$$, (select min(id) from operacoes where transferencia_id = :tn)), 'própria transferência');
select pg_temp.como('op1@teste.com');
select pg_temp.espera_erro('Operador sem permissão não estorna transferência', format($$select estornar_transferencia(%s, 'x')$$, :tn), 'Sem permissão');
select pg_temp.como('admin@teste.com');
select pg_temp.espera_erro('Estorno de transferência só no estoque de destino (de onde a mercadoria sai)',
  format($$select estornar_transferencia(%s, 'x')$$, :tn), 'Você está no estoque DELLA ESTOQUE');
select pg_temp.no_estoque('admin@teste.com', 'FULL_ML');
select estornar_transferencia(:tn, 'Enviado por engano');
select pg_temp.no_estoque('admin@teste.com', 'ESTOQUE');
select pg_temp.checar('Estornar transferência devolve as quantidades',
  pg_temp.saldo('KIT-PIN3', 'ESTOQUE') = :k_e and pg_temp.saldo('KIT-PIN3', 'FULL_ML') = :k_f
  and (select status::text from transferencias where id = :tn) = 'estornada');
select pg_temp.espera_erro('Estornar transferência duas vezes é bloqueado', format($$select estornar_transferencia(%s, 'x')$$, :tn), 'já foi estornada');

-- Erros de dados
select pg_temp.espera_erro('Transferência com produto inexistente',
  format($$select registrar_transferencia('{"origem_id":%s,"destino_id":%s,"itens":[{"produto_id":999999,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.lid('FULL_ML')), 'não encontrado');
select pg_temp.espera_erro('Transferência com loja inexistente',
  format($$select registrar_transferencia('{"origem_id":999,"destino_id":%s,"itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('FULL_ML'), pg_temp.pid('PIN-FINA')), 'Loja inválida');
select pg_temp.espera_erro('Transferência para a mesma loja',
  format($$select registrar_transferencia('{"origem_id":%s,"destino_id":%s,"itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'diferentes');
select pg_temp.espera_erro('Quantidade zero é bloqueada',
  format($$select registrar_entrada('{"loja_id":%s,"itens":[{"produto_id":%s,"quantidade":0}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'inteiros maiores que zero');
select pg_temp.espera_erro('Quantidade negativa é bloqueada',
  format($$select registrar_entrada('{"loja_id":%s,"itens":[{"produto_id":%s,"quantidade":-5}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'inteiros maiores que zero');
select pg_temp.espera_erro('Quantidade fracionada é bloqueada',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","itens":[{"produto_id":%s,"quantidade":1.5}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'inteiros');
select pg_temp.espera_erro('Quantidade em texto é bloqueada',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","itens":[{"produto_id":%s,"quantidade":"abc"}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'inteiros');
select pg_temp.espera_erro('Custo negativo é bloqueado',
  format($$select registrar_entrada('{"loja_id":%s,"itens":[{"produto_id":%s,"quantidade":1,"custo_unitario":-1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'negativo');
select pg_temp.espera_erro('Data futura é bloqueada',
  format($$select registrar_entrada('{"loja_id":%s,"data":"2099-01-01","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'futuro');
select pg_temp.espera_erro('Motivo de saída inválido é bloqueado',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"furto_inventado","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'inválido');
select pg_temp.espera_erro('Saída "Outro" sem observação é bloqueada',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"outro","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'descreva');
select pg_temp.espera_erro('Chave de NF-e inválida é bloqueada',
  format($$select registrar_entrada('{"loja_id":%s,"nota":{"numero":"1","chave_acesso":"35261011222333000181550010000045671000000001"},"itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'Chave de acesso inválida');
select pg_temp.espera_erro('CNPJ inválido é bloqueado',
  format($$select registrar_entrada('{"loja_id":%s,"nota":{"numero":"1","fornecedor_cnpj":"11.111.111/1111-11"},"itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'CNPJ');
select pg_temp.espera_erro('Produto inativo não recebe lançamento',
  format($$select registrar_entrada('{"loja_id":%s,"itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'),
    (select salvar_produto('{"nome":"Produto para inativar"}'))) || '; select 1', 'XX_IGNORAR');
delete from resultado where teste = 'Produto inativo não recebe lançamento';
select definir_produto_ativo((select id from produtos where nome = 'Produto para inativar'), false);
select pg_temp.espera_erro('Produto inativo não recebe lançamento',
  format($$select registrar_entrada('{"loja_id":%s,"itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), (select id from produtos where nome = 'Produto para inativar')), 'inativo');

-- Entrada duplicada (mesmo formulário enviado 2x)
select pg_temp.saldo('PIN-RETA', 'ESTOQUE') as pr_e \gset
select registrar_entrada(format('{"loja_id":%s,"chave":"form-123","itens":[{"produto_id":%s,"quantidade":7}]}', pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-RETA'))::jsonb) as e1 \gset
select registrar_entrada(format('{"loja_id":%s,"chave":"form-123","itens":[{"produto_id":%s,"quantidade":7}]}', pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-RETA'))::jsonb) as e2 \gset
select pg_temp.checar('Entrada enviada 2x (clique duplo) só soma uma vez', :e1 = :e2 and pg_temp.saldo('PIN-RETA', 'ESTOQUE') = :pr_e + 7);

-- ===================== PRODUTOS =====================
select salvar_produto('{"nome":"  Produto Novo Teste  ","ean":"7891234567895","preco_custo":"10.5","minimos":{"1":3}}') as pnovo \gset
select pg_temp.checar('Produto novo: SKU automático, nome sem espaços, custo médio = custo',
  (select sku ~ '^DELLA-\d{5}$' and nome = 'Produto Novo Teste' and custo_medio = 10.5 from produtos where id = :pnovo));
select pg_temp.checar('Produto novo ganha saldo zerado em todas as lojas',
  (select count(*) from produto_loja where produto_id = :pnovo and saldo = 0) = (select count(*) from lojas));
select pg_temp.espera_erro('SKU duplicado é bloqueado', $$select salvar_produto('{"nome":"Dup","sku":"pin-fina"}')$$, 'Já existe um produto com o SKU');
select pg_temp.espera_erro('EAN duplicado é bloqueado', $$select salvar_produto('{"nome":"Dup","ean":"7891234567895"}')$$, 'código de barras 7891234567895');
select pg_temp.espera_erro('EAN com dígito verificador errado é bloqueado', $$select salvar_produto('{"nome":"X","ean":"7891234567890"}')$$, 'Código de barras inválido');
select pg_temp.espera_erro('EAN com letras é bloqueado', $$select salvar_produto('{"nome":"X","ean":"ABC123"}')$$, 'Código de barras inválido');
select pg_temp.espera_erro('SKU com caracteres inválidos é bloqueado', $$select salvar_produto('{"nome":"X","sku":"PIN FINA#"}')$$, 'SKU inválido');
select pg_temp.espera_erro('Nome vazio é bloqueado', $$select salvar_produto('{"nome":"   "}')$$, 'obrigatório');
select pg_temp.espera_erro('Preço negativo é bloqueado', $$select salvar_produto('{"nome":"X","preco_venda":"-1"}')$$, 'negativos');
select pg_temp.espera_erro('Estoque mínimo negativo é bloqueado', $$select salvar_produto('{"nome":"X","minimos":{"1":-2}}')$$, 'negativo');
select pg_temp.espera_erro('Excluir produto com histórico é bloqueado', format('select excluir_produto(%s)', pg_temp.pid('PIN-FINA')), 'não pode ser excluído');
select excluir_produto(:pnovo);
select pg_temp.checar('Excluir produto SEM histórico funciona', not exists (select 1 from produtos where id = :pnovo));
select pg_temp.checar('Auditoria registra alterações de produto com o nome do usuário',
  exists (select 1 from auditoria where tabela = 'produtos' and usuario_nome = 'Admin Teste'));

-- ===================== INVENTÁRIO =====================
select pg_temp.espera_erro('Inventário avisa se o saldo mudou durante a contagem',
  format($$select registrar_ajuste('{"loja_id":%s,"motivo":"Inventário","itens":[{"produto_id":%s,"quantidade_contada":5,"saldo_esperado":12345}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('LAM-CX100')), 'mudou durante a contagem');
select pg_temp.no_estoque('admin@teste.com', 'FULL_ML');
select pg_temp.checar('Inventário sem diferença não gera lançamento',
  registrar_ajuste(format('{"loja_id":%s,"motivo":"Conferência","itens":[{"produto_id":%s,"quantidade_contada":%s}]}',
    pg_temp.lid('FULL_ML'), pg_temp.pid('LAM-CX100'), pg_temp.saldo('LAM-CX100', 'FULL_ML'))::jsonb) is null);

select pg_temp.no_estoque('admin@teste.com', 'ESTOQUE');
-- ===================== LOJAS =====================
select salvar_loja('{"nome":"Loja Teste","cor":"#22AA55"}') as lnova \gset
select pg_temp.checar('Admin cria loja nova e ela ganha saldo para todos os produtos',
  (select count(*) from produto_loja where loja_id = :lnova) = (select count(*) from produtos));
select salvar_loja(format('{"id":%s,"nome":"Loja Teste","cor":"#22AA55","ativa":false}', :lnova)::jsonb);
select pg_temp.checar('Admin desativa loja sem estoque', not (select ativa from lojas where id = :lnova));
select pg_temp.espera_erro('Não desativa loja com estoque', format($$select salvar_loja('{"id":%s,"nome":"DELLA ESTOQUE","cor":"#1E5BC6","ativa":false}')$$, pg_temp.lid('ESTOQUE')), 'ainda tem produtos');
select pg_temp.espera_erro('Não lança em loja inativa',
  format($$select registrar_entrada('{"loja_id":%s,"itens":[{"produto_id":%s,"quantidade":1}]}')$$, :lnova, pg_temp.pid('PIN-FINA')), 'Loja inválida ou inativa');

-- ===================== HISTÓRICO (visibilidade) =====================
select pg_temp.como('op2@teste.com');
select pg_temp.checar('Operador sem permissão de histórico vê só os próprios lançamentos',
  (select count(*) from operacoes where usuario_id is distinct from auth.uid()) = 0);
select pg_temp.como('op1@teste.com');
select pg_temp.checar('Operador com permissão de histórico vê todos', (select count(*) from operacoes) > (select count(*) from operacoes where usuario_id = auth.uid()));

-- ===================== LOG DE ATIVIDADES (só admin) =====================
select pg_temp.como('admin@teste.com');
select pg_temp.checar('Admin vê o log com quem fez cada mudança',
  exists (select 1 from vw_log where usuario_nome = 'Operador Um' and acao = 'Transferência')
  and exists (select 1 from vw_log where usuario_nome = 'Admin Teste' and acao like 'Criou produto%'));
select pg_temp.como('op1@teste.com');
select pg_temp.checar('Operador NÃO vê o log de atividades', (select count(*) from vw_log) = 0);

-- ===================== INTEGRIDADE FINAL =====================
reset role;
select pg_temp.checar('INTEGRIDADE: nenhum saldo negativo', not exists (select 1 from produto_loja where saldo < 0));
select pg_temp.checar('INTEGRIDADE: saldo = soma do livro-razão em todas as lojas', not exists (
  select 1 from produto_loja pl
   where pl.saldo <> coalesce((select sum(quantidade) from movimentacoes m where m.produto_id = pl.produto_id and m.loja_id = pl.loja_id), 0)));
select pg_temp.checar('INTEGRIDADE: só existem as lojas reais (sem loja EM TRÂNSITO)', not exists (select 1 from lojas where virtual or codigo = 'TRANSITO'));
select pg_temp.checar('INTEGRIDADE: saldo_apos de cada movimento bate com a sequência', not exists (
  select 1 from (select m.*, sum(quantidade) over (partition by produto_id, loja_id order by id) as acumulado from movimentacoes m) x
   where x.saldo_apos <> x.acumulado));

-- ---------- RESULTADO ----------
\o
\pset footer off
select n, case when ok then 'OK    ' else 'FALHOU' end as res, teste,
       case when not ok then detalhe else '' end as detalhe
  from resultado order by n;
select count(*) filter (where ok) as passaram, count(*) filter (where not ok) as falharam, count(*) as total from resultado;
rollback;
