-- =====================================================================
--  DELLA — Arquivo 2 de 2: DADOS DE EXEMPLO (opcional)
--
--  Cria categorias, marcas e alguns produtos (pinças, navalha...) com
--  saldo inicial nas duas lojas, para você testar o sistema.
--  Rode DEPOIS do arquivo 01_estrutura.sql.
--
--  Para começar "do zero" sem os exemplos, simplesmente não rode este
--  arquivo (ou inative os produtos de exemplo depois).
-- =====================================================================

do $$
declare
  v_estoque smallint := (select id from public.lojas where codigo = 'ESTOQUE');
  v_full    smallint := (select id from public.lojas where codigo = 'FULL_ML');
  v_op      bigint;
  v_p       record;
begin
  insert into public.categorias (nome) values ('Pinças'), ('Navalhas'), ('Tesouras'), ('Kits')
  on conflict do nothing;
  insert into public.marcas (nome) values ('Edel Solingen'), ('DELLA')
  on conflict do nothing;

  -- produtos: nome, sku, categoria, marca, unidade, custo, venda,
  --           mínimo ESTOQUE, mínimo FULL, saldo ESTOQUE, saldo FULL
  create temp table _exemplo (
    nome text, sku text, categoria text, marca text, unidade text,
    custo numeric, venda numeric, min_e int, min_f int, saldo_e int, saldo_f int
  ) on commit drop;
  insert into _exemplo values
    ('Pinça Ponta Fina Edel Solingen',        'PIN-FINA',  'Pinças',   'Edel Solingen', 'UN', 18.50, 49.90, 10, 5, 40,  2),
    ('Pinça Ponta Oblíqua Edel Solingen',     'PIN-OBLQ',  'Pinças',   'Edel Solingen', 'UN', 18.50, 49.90, 10, 5, 35, 12),
    ('Pinça Ponta Reta Edel Solingen',        'PIN-RETA',  'Pinças',   'Edel Solingen', 'UN', 18.50, 49.90, 10, 5,  6, 15),
    ('Kit 3 Pinças Edel Solingen (Fina, Oblíqua e Reta)', 'KIT-PIN3', 'Kits', 'Edel Solingen', 'KIT', 52.00, 129.90, 5, 8, 20,  3),
    ('Navalha Profissional Aço Inox',         'NAV-INOX',  'Navalhas', 'DELLA',         'UN', 12.00, 34.90,  8, 4, 25,  9),
    ('Lâminas para Navalha - caixa c/ 100',   'LAM-CX100', 'Navalhas', 'DELLA',         'CX', 21.00, 54.90,  5, 3,  0,  4),
    ('Tesoura de Cutícula Curva Edel Solingen','TES-CUT',  'Tesouras', 'Edel Solingen', 'UN', 22.00, 59.90,  5, 3, 14,  6);

  insert into public.operacoes (tipo, motivo, observacao, origem)
  values ('ajuste', 'Saldo inicial (dados de exemplo)', 'Carga inicial de exemplo nas duas lojas', 'importacao')
  returning id into v_op;

  for v_p in select * from _exemplo loop
    insert into public.produtos (nome, sku, categoria_id, marca_id, unidade, preco_custo, preco_venda)
    values (v_p.nome, v_p.sku,
            (select id from public.categorias where nome = v_p.categoria),
            (select id from public.marcas where nome = v_p.marca),
            v_p.unidade, v_p.custo, v_p.venda)
    on conflict (sku) do nothing;

    update public.produto_loja pl set estoque_minimo = case pl.loja_id when v_estoque then v_p.min_e else v_p.min_f end
     where pl.produto_id = (select id from public.produtos where sku = v_p.sku);

    perform public.fn_movimentar(v_op, (select id from public.produtos where sku = v_p.sku), v_estoque, v_p.saldo_e, v_p.custo);
    perform public.fn_movimentar(v_op, (select id from public.produtos where sku = v_p.sku), v_full,    v_p.saldo_f, v_p.custo);
  end loop;
end $$;
