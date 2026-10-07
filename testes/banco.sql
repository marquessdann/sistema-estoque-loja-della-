-- =====================================================================
-- Bateria de testes automáticos das regras do banco (estoque e permissões).
-- Roda num banco de TESTE já com 01 + 03 + 04 + 02 aplicados (nunca em produção).
-- Usuários de teste: admin = CEO, op1 = GERENTE, op2 = FUNCIONÁRIO.
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
  ('00000000-0000-0000-0000-0000000000b1', 'op1@teste.com', '{"nome":"Gerente Um"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'op2@teste.com', '{"nome":"Funcionario Dois"}');
select pg_temp.espera_erro('Limite de 3 usuários ativos',
  $$insert into auth.users (id, email) values (gen_random_uuid(), 'quarto@teste.com')$$, 'Limite de 3');
select pg_temp.checar('Convite é consumido (não pode ser reutilizado)', not exists (select 1 from usuarios_convites where email in ('op1@teste.com', 'op2@teste.com')));
select pg_temp.checar('1º usuário vira CEO; os demais começam como funcionário',
  (select string_agg(cargo || '/' || perfil::text, ',' order by email) from usuarios) = 'ceo/admin,funcionario/operador,funcionario/operador');
-- o CEO promove o op1 a gerente (a tela Usuários faz isso pela API do servidor)
update usuarios set cargo = 'gerente' where email = 'op1@teste.com';
select pg_temp.checar('Gerente ganha o perfil de administração automaticamente', (select perfil::text from usuarios where email = 'op1@teste.com') = 'admin');
select pg_temp.espera_erro('O sistema nunca fica sem CEO', $$update usuarios set cargo = 'gerente' where email = 'admin@teste.com'$$, 'precisa de um CEO');
select pg_temp.espera_erro('Não existe cargo inventado', $$update usuarios set cargo = 'dono' where email = 'op2@teste.com'$$, 'usuarios_cargo_valido');

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
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","numero_pedido":"1","plataforma":"tiktok_shop","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'Escolha em qual estoque');
select pg_temp.espera_erro('Gerente não troca a senha do estoque', format($$select definir_senha_loja(%s::smallint, 'nova123')$$, pg_temp.lid('FULL_ML')), 'Somente o CEO');
select pg_temp.no_estoque('op1@teste.com', 'ESTOQUE');
select pg_temp.como('admin@teste.com');
select definir_senha_loja(pg_temp.lid('FULL_ML'), 'NovaSenha9');
select pg_temp.checar('CEO troca a senha do estoque: a antiga deixa de valer e a nova entra',
  entrar_loja(pg_temp.lid('FULL_ML'), 'Galaxys2!') = false and entrar_loja(pg_temp.lid('FULL_ML'), 'NovaSenha9') = true);
select pg_temp.no_estoque('admin@teste.com', 'ESTOQUE');
delete from resultado where teste = 'Ninguém consegue ler a senha do estoque';

-- ===================== PERMISSÕES: FUNCIONÁRIO =====================
select pg_temp.como('op2@teste.com');
select pg_temp.espera_erro('Funcionário NÃO cadastra produto', $$select salvar_produto('{"nome":"X"}')$$, 'Sem permissão');
select pg_temp.espera_erro('Funcionário NÃO inativa produto', $$select definir_produto_ativo(1, false)$$, 'Somente o CEO ou o gerente');
select pg_temp.espera_erro('Funcionário NÃO exclui produto', $$select excluir_produto(1)$$, 'Somente o CEO');
select pg_temp.espera_erro('Funcionário NÃO importa planilha', $$select importar_produtos('[{"nome":"Y"}]')$$, 'Sem permissão');
select pg_temp.espera_erro('Funcionário NÃO cria categoria', $$insert into categorias (nome) values ('Hack')$$, 'row-level security');
select pg_temp.espera_erro('Funcionário NÃO cria/edita loja', $$select salvar_loja('{"nome":"LOJA HACK"}')$$, 'Somente o CEO');
select pg_temp.espera_erro('Funcionário NÃO altera loja direto', $$update lojas set nome = 'X'$$, 'permission denied');
select pg_temp.espera_erro('Funcionário NÃO se promove', $$update usuarios set cargo = 'ceo'$$, 'permission denied');
select pg_temp.espera_erro('Funcionário NÃO altera saldo direto', $$update produto_loja set saldo = 999$$, 'permission denied');
select pg_temp.espera_erro('Funcionário NÃO apaga movimentação', $$delete from movimentacoes$$, 'permission denied');
select pg_temp.espera_erro('Funcionário NÃO altera movimentação', $$update movimentacoes set quantidade = 1$$, 'permission denied');
select pg_temp.espera_erro('Funcionário NÃO apaga operação', $$delete from operacoes$$, 'permission denied');
select pg_temp.espera_erro('Funcionário NÃO chama função interna fn_movimentar', $$select fn_movimentar(1, 1, 1::smallint, 100, 0)$$, 'permission denied');
select pg_temp.espera_erro('Funcionário NÃO chama a entrada interna (sem as regras)', $$select registrar_entrada_interno('{}')$$, 'permission denied');
select pg_temp.espera_erro('Funcionário NÃO insere transferência direto', $$insert into transferencias (loja_origem_id, loja_destino_id) values (1, 2)$$, 'permission denied');
select pg_temp.checar('Funcionário NÃO lê auditoria', (select count(*) from auditoria) = 0);
select pg_temp.espera_erro('Funcionário NÃO estorna', $$select estornar_operacao(1, 'x')$$, 'Sem permissão');
select pg_temp.espera_erro('Funcionário NÃO dá entrada',
  format($$select registrar_entrada('{"loja_id":%s,"itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'Sem permissão');
select pg_temp.espera_erro('Funcionário NÃO faz inventário',
  format($$select registrar_ajuste('{"loja_id":%s,"motivo":"x","itens":[{"produto_id":%s,"quantidade_contada":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'Sem permissão');
select pg_temp.checar('Funcionário pode dar baixa e transferir', tem_permissao('saida') and tem_permissao('transferir') and not tem_permissao('produtos'));

-- ===================== PERMISSÕES: GERENTE =====================
select pg_temp.como('op1@teste.com');
select pg_temp.espera_erro('Gerente NÃO cria/edita loja', $$select salvar_loja('{"nome":"LOJA HACK"}')$$, 'Somente o CEO');
select pg_temp.espera_erro('Gerente NÃO exclui produto', $$select excluir_produto(1)$$, 'Somente o CEO');
select pg_temp.espera_erro('Gerente NÃO mexe em usuários', $$update usuarios set cargo = 'ceo'$$, 'permission denied');
select pg_temp.checar('Gerente pode autorizar: cadastrar, estornar, inventário, relatórios',
  tem_permissao('produtos') and tem_permissao('estornar') and tem_permissao('inventario') and tem_permissao('relatorios'));
select salvar_produto('{"nome":"Produto do Gerente"}') as pger \gset
select definir_produto_ativo(:pger, false);
select pg_temp.checar('Gerente cadastra e inativa produto', not (select ativo from produtos where id = :pger));
insert into categorias (nome) values ('Categoria do Gerente');
select count(*) as cat_antes from categorias \gset
delete from categorias where nome = 'Categoria do Gerente';
select pg_temp.checar('Gerente NÃO exclui categoria (só o CEO)', (select count(*) from categorias) = :cat_antes);

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
  exists (select 1 from vw_movimentacoes where sku = 'NAV-INOX' and quantidade = 5 and saldo_antes = 10 and saldo_apos = 15 and usuario_nome = 'Gerente Um'));

select registrar_saida(format('{"loja_id":%s,"motivo":"venda","numero_pedido":"ML-2000","plataforma":"mercado_livre","itens":[{"produto_id":%s,"quantidade":3}]}',
       pg_temp.lid('ESTOQUE'), pg_temp.pid('NAV-INOX'))::jsonb) as saida_teste2 \gset
select pg_temp.checar('Teste 2: estoque 15 - saída 3 = 12', pg_temp.saldo('NAV-INOX', 'ESTOQUE') = 12);

-- Teste 3: Loja A (ESTOQUE) com 20 -> transferir 5 para Loja B (FULL), na hora
select pg_temp.como('admin@teste.com');
select registrar_ajuste(format('{"loja_id":%s,"motivo":"Preparação","itens":[{"produto_id":%s,"quantidade_contada":20}]}',
       pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-OBLQ'))::jsonb);
select pg_temp.saldo('PIN-OBLQ', 'FULL_ML') as full_antes \gset
select pg_temp.como('op2@teste.com');
select registrar_transferencia(format('{"origem_id":%s,"destino_id":%s,"chave":"t3","itens":[{"produto_id":%s,"quantidade":5}]}',
       pg_temp.lid('ESTOQUE'), pg_temp.lid('FULL_ML'), pg_temp.pid('PIN-OBLQ'))::jsonb) as t3 \gset
select pg_temp.checar('Teste 3: funcionário transfere na hora -> origem 20 - 5 = 15',  pg_temp.saldo('PIN-OBLQ', 'ESTOQUE') = 15);
select pg_temp.checar('Teste 3: destino = anterior + 5', pg_temp.saldo('PIN-OBLQ', 'FULL_ML') = :full_antes + 5);
select pg_temp.checar('Teste 3: transferência registrada com quem fez',
  (select status::text || usuario_nome from vw_transferencias where id = :t3) = 'concluidaFuncionario Dois');
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
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","numero_pedido":"9","plataforma":"tiktok_shop","itens":[{"produto_id":%s,"quantidade":999}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('NAV-INOX')),
  'Estoque insuficiente de "Navalha Profissional Aço Inox"');
select pg_temp.checar('Teste 4: saldo não mudou após o bloqueio', pg_temp.saldo('NAV-INOX', 'ESTOQUE') = 12);
select pg_temp.espera_erro('Transferência maior que o disponível é bloqueada',
  format($$select registrar_transferencia('{"origem_id":%s,"destino_id":%s,"itens":[{"produto_id":%s,"quantidade":999}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.lid('FULL_ML'), pg_temp.pid('NAV-INOX')),
  'insuficiente');
select pg_temp.checar('Transferência bloqueada não deixou registro', not exists (select 1 from transferencia_itens where quantidade = 999));

-- Teste 5: cancelar (estornar) uma movimentação — o GERENTE autoriza
select pg_temp.como('op1@teste.com');
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
select pg_temp.como('op2@teste.com');
select pg_temp.espera_erro('Funcionário não estorna transferência', format($$select estornar_transferencia(%s, 'x')$$, :tn), 'Sem permissão');
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
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","numero_pedido":"1","plataforma":"tiktok_shop","itens":[{"produto_id":%s,"quantidade":1.5}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'inteiros');
select pg_temp.espera_erro('Quantidade em texto é bloqueada',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","numero_pedido":"1","plataforma":"tiktok_shop","itens":[{"produto_id":%s,"quantidade":"abc"}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('PIN-FINA')), 'inteiros');
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
select pg_temp.checar('CEO cria loja nova e ela ganha saldo para todos os produtos',
  (select count(*) from produto_loja where loja_id = :lnova) = (select count(*) from produtos));
select salvar_loja(format('{"id":%s,"nome":"Loja Teste","cor":"#22AA55","ativa":false}', :lnova)::jsonb);
select pg_temp.checar('CEO desativa loja sem estoque', not (select ativa from lojas where id = :lnova));
select pg_temp.espera_erro('Não desativa loja com estoque', format($$select salvar_loja('{"id":%s,"nome":"DELLA ESTOQUE","cor":"#1E5BC6","ativa":false}')$$, pg_temp.lid('ESTOQUE')), 'ainda tem produtos');
select pg_temp.espera_erro('Não lança em loja inativa',
  format($$select registrar_entrada('{"loja_id":%s,"itens":[{"produto_id":%s,"quantidade":1}]}')$$, :lnova, pg_temp.pid('PIN-FINA')), 'Loja inválida ou inativa');

-- ===================== PEDIDOS: ENTRADA E SAÍDA =====================
select pg_temp.como('op2@teste.com');
select pg_temp.no_estoque('op2@teste.com', 'ESTOQUE');
select pg_temp.espera_erro('Saída para pedido sem número do pedido é bloqueada',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","plataforma":"tiktok_shop","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('NAV-INOX')), 'número do pedido');
select pg_temp.espera_erro('No DELLA ESTOQUE é obrigatório escolher a plataforma',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","numero_pedido":"77","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('NAV-INOX')), 'Escolha a plataforma');
select pg_temp.espera_erro('Plataforma inventada é bloqueada',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","numero_pedido":"77","plataforma":"shopee","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('NAV-INOX')), 'Plataforma inválida');
select pg_temp.espera_erro('Data e hora no futuro são bloqueadas',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","numero_pedido":"77","plataforma":"tiktok_shop","data_hora":"2099-01-01T10:00","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('NAV-INOX')), 'futuro');
select pg_temp.saldo('NAV-INOX', 'ESTOQUE') as nav_antes \gset
select registrar_saida(format('{"loja_id":%s,"motivo":"venda","numero_pedido":"TT-5501","numero_nf":"1234","cliente_nome":"Maria Souza","plataforma":"tiktok_shop","data_hora":"2026-01-15T14:30","itens":[{"produto_id":%s,"quantidade":2}]}',
       pg_temp.lid('ESTOQUE'), pg_temp.pid('NAV-INOX'))::jsonb) as ped1 \gset
select pg_temp.checar('Funcionário dá baixa de pedido TikTok Shop no DELLA ESTOQUE (saldo -2)', pg_temp.saldo('NAV-INOX', 'ESTOQUE') = :nav_antes - 2);
select pg_temp.checar('Pedido grava nº do pedido, NF, cliente, plataforma, dia e hora',
  (select numero_pedido = 'TT-5501' and nf_numero = '1234' and cliente_nome = 'Maria Souza' and plataforma = 'tiktok_shop'
          and data_referencia = date '2026-01-15'
          and to_char(data_hora at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') = '15/01/2026 14:30'
     from vw_operacoes where id = :ped1));
select pg_temp.checar('Histórico mostra o pedido em cada movimento', exists (select 1 from vw_movimentacoes where operacao_id = :ped1 and numero_pedido = 'TT-5501' and plataforma = 'tiktok_shop'));
select pg_temp.no_estoque('op2@teste.com', 'FULL_ML');
select pg_temp.espera_erro('No DELLA FULL ML não existe pedido do TikTok Shop',
  format($$select registrar_saida('{"loja_id":%s,"motivo":"venda","numero_pedido":"1","plataforma":"tiktok_shop","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('FULL_ML'), pg_temp.pid('LAM-CX100')), 'sempre do Mercado Livre');
select registrar_saida(format('{"loja_id":%s,"motivo":"venda","numero_pedido":"2000123456","numero_nf":"889","cliente_nome":"João","itens":[{"produto_id":%s,"quantidade":1}]}',
       pg_temp.lid('FULL_ML'), pg_temp.pid('LAM-CX100'))::jsonb) as ped2 \gset
select pg_temp.checar('Baixa no FULL sai como Mercado Livre automaticamente',
  (select plataforma = 'mercado_livre' and numero_pedido = '2000123456' and nf_numero = '889' from vw_operacoes where id = :ped2));
select registrar_saida(format('{"loja_id":%s,"motivo":"avaria","plataforma":"tiktok_shop","itens":[{"produto_id":%s,"quantidade":1}]}',
       pg_temp.lid('FULL_ML'), pg_temp.pid('LAM-CX100'))::jsonb) as av1 \gset
select pg_temp.checar('Saída que não é pedido (avaria) não guarda plataforma', (select plataforma is null from operacoes where id = :av1));
select pg_temp.no_estoque('op2@teste.com', 'ESTOQUE');

select pg_temp.como('op1@teste.com');
select registrar_entrada(format('{"loja_id":%s,"motivo":"compra","numero_pedido":"PC-88","numero_nf":"45678","data_hora":"2026-02-03T09:15","itens":[{"produto_id":%s,"quantidade":4,"custo_unitario":10}]}',
       pg_temp.lid('ESTOQUE'), pg_temp.pid('TES-CUT'))::jsonb) as ent1 \gset
select pg_temp.checar('Entrada grava nº do pedido, nº da NF, dia e hora',
  (select numero_pedido = 'PC-88' and nf_numero = '45678' and data_referencia = date '2026-02-03'
          and to_char(data_hora at time zone 'America/Sao_Paulo', 'HH24:MI') = '09:15' from vw_operacoes where id = :ent1));
select pg_temp.checar('Entrada sem data/hora fica com o momento do lançamento',
  (select data_hora = criado_em from vw_operacoes where id = :e1));
select pg_temp.espera_erro('Entrada com data e hora inválidas',
  format($$select registrar_entrada('{"loja_id":%s,"data_hora":"ontem cedo","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), pg_temp.pid('TES-CUT')), 'inválidas');
select pg_temp.espera_erro('Número do pedido gigante é bloqueado',
  format($$select registrar_entrada('{"loja_id":%s,"numero_pedido":"%s","itens":[{"produto_id":%s,"quantidade":1}]}')$$, pg_temp.lid('ESTOQUE'), repeat('9', 61), pg_temp.pid('TES-CUT')), 'muito longo');

-- ===================== HISTÓRICO (visibilidade) =====================
select pg_temp.como('op2@teste.com');
select pg_temp.checar('Funcionário vê só os próprios lançamentos',
  (select count(*) from operacoes where usuario_id is distinct from auth.uid()) = 0 and (select count(*) from operacoes) > 0);
select pg_temp.como('op1@teste.com');
select pg_temp.checar('Gerente vê os lançamentos de todos', (select count(*) from operacoes) > (select count(*) from operacoes where usuario_id = auth.uid()));

-- ===================== LOG DE ATIVIDADES (CEO e gerente) =====================
select pg_temp.como('admin@teste.com');
select pg_temp.checar('CEO vê o log com quem fez cada mudança e o cargo',
  exists (select 1 from vw_log where usuario_nome = 'Funcionario Dois' and perfil = 'funcionario' and acao = 'Transferência')
  and exists (select 1 from vw_log where usuario_nome = 'Admin Teste' and acao like 'Criou produto%'));
select pg_temp.checar('Log mostra a baixa com plataforma, pedido e cliente',
  exists (select 1 from vw_log where acao = 'Baixa (saída)' and detalhe like '%TikTok Shop%Pedido TT-5501%Cliente Maria Souza%NF 1234%'));
select pg_temp.como('op1@teste.com');
select pg_temp.checar('Gerente também vê o log', (select count(*) from vw_log) > 0);
select pg_temp.como('op2@teste.com');
select pg_temp.checar('Funcionário NÃO vê o log de atividades', (select count(*) from vw_log) = 0);

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
