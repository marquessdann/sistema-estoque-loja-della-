-- =====================================================================
--  DELLA — Arquivo 6: PRODUTOS REAIS DA DELLA (cadastro + histórico)
--
--  Rode DEPOIS do 05 e DEPOIS de criar o primeiro usuário (o CEO, passo 1.3
--  do guia de hospedagem). NÃO rode o 02 (produtos de exemplo) junto.
--
--  O que este arquivo faz (pode rodar de novo: nada é lançado em dobro):
--   1. Cadastra 49 produtos com SKU, código de barras, categoria, marca,
--      código do fornecedor, custo, estoque mínimo, NCM, CEST e origem.
--   2. Cadastra os 4 kits de pinças com seus componentes.
--   3. Lança o histórico real no DELLA ESTOQUE, uma vez cada (planilha e
--      notas fiscais são os mesmos lançamentos):
--        23/09/2026  Entrada  Pedido 3108 (Elementar) .......... Enaldinho
--        24/09/2026  Entrada  NF 16.653 Itapema ................ pinças e navalha
--        30/09/2026  Entrada  NF 46.780 Vermonth (pedido 33494) . colas e hennas
--        30/09/2026  Saída    Mercado Livre .................... 1 Body Splash Treta Cítrica
--        02/10/2026  Saída    Mercado Livre .................... navalhas e 1 kit de pinças
--        02/10/2026  Entrada  Pedido 3136 (Elementar) .......... linha Hidra
--      Tudo fica no nome do CEO, pelas mesmas funções e regras do sistema.
--
--  Fontes: Controle_de_Estoque.xlsx, Tabela_Fiscal_por_Estado.xlsx,
--  DANFE 16.653 (Itapema), DANFE 46.780 (Vermonth) e Pedido_Della.pdf (3136).
-- =====================================================================

do $$
declare
  v_ceo uuid;
  v_loja_antes smallint;
  v_estoque smallint := (select id from public.lojas where codigo = 'ESTOQUE');
  v_p jsonb;
  v_k jsonb;
  v_id bigint;
  v_catalogo jsonb := '[
    {"sku": "BLP-001-7899661779133", "nome": "Body Splash Explosão Cósmica 120ml", "categoria": "Body Splash", "marca": "Enaldinho", "codigo_fornecedor": "7899661779133", "ean": "7899661779133", "preco_custo": 25.9, "ncm": "33072010", "cest": "2002700", "origem_fiscal": 0, "minimo": 20},
    {"sku": "BLP-002-7899661779126", "nome": "Body Splash Chiclete Irado 120ml", "categoria": "Body Splash", "marca": "Enaldinho", "codigo_fornecedor": "7899661779126", "ean": "7899661779126", "preco_custo": 25.9, "ncm": "33072010", "cest": "2002700", "origem_fiscal": 0, "minimo": 20},
    {"sku": "BLP-003-7899661779157", "nome": "Body Splash Treta Cítrica 120ml", "categoria": "Body Splash", "marca": "Enaldinho", "codigo_fornecedor": "7899661779157", "ean": "7899661779157", "preco_custo": 25.9, "ncm": "33072010", "cest": "2002700", "origem_fiscal": 0, "minimo": 20},
    {"sku": "BLP-004-7899661779140", "nome": "Body Splash Gelo Sinistro 120ml", "categoria": "Body Splash", "marca": "Enaldinho", "codigo_fornecedor": "7899661779140", "ean": "7899661779140", "preco_custo": 25.9, "ncm": "33072010", "cest": "2002700", "origem_fiscal": 0, "minimo": 20},
    {"sku": "GEL-001-7899661779171", "nome": "Gel de Cabelo Controle Mental 170g", "categoria": "Gel de Cabelo", "marca": "Enaldinho", "codigo_fornecedor": "7899661779171", "ean": "7899661779171", "preco_custo": 22.9, "ncm": "33059000", "cest": "2002000", "origem_fiscal": 0, "minimo": 20},
    {"sku": "HLB-001-7899661779065", "nome": "Hidratante Labial Chocomenta Subzero 10g", "categoria": "Hidratante Labial", "marca": "Enaldinho", "codigo_fornecedor": "7899661779065", "ean": "7899661779065", "preco_custo": 15.9, "ncm": "33049990", "cest": "2001500", "origem_fiscal": 0, "minimo": 20},
    {"sku": "HLB-002-7899661779058", "nome": "Hidratante Labial Chiclete Congelante 10g", "categoria": "Hidratante Labial", "marca": "Enaldinho", "codigo_fornecedor": "7899661779058", "ean": "7899661779058", "preco_custo": 15.9, "ncm": "33049990", "cest": "2001500", "origem_fiscal": 0, "minimo": 20},
    {"sku": "HLB-003-7899661779072", "nome": "Hidratante Labial Milk Shake Morango 10g", "categoria": "Hidratante Labial", "marca": "Enaldinho", "codigo_fornecedor": "7899661779072", "ean": "7899661779072", "preco_custo": 15.9, "ncm": "33049990", "cest": "2001500", "origem_fiscal": 0, "minimo": 20},
    {"sku": "PIN-CAN-OBL-001-2311303", "nome": "Pinça Depil 9cm Canelada Obliqua", "categoria": "Depilação", "marca": "Solingen", "codigo_fornecedor": "2311.303", "preco_custo": 11.48, "ncm": "82032090", "cest": "2005300", "origem_fiscal": 0, "minimo": 10},
    {"sku": "PIN-CAN-RET-002-2341303", "nome": "Pinça Depil 9cm Canelada Reta Estreita", "categoria": "Depilação", "marca": "Solingen", "codigo_fornecedor": "2341.303", "preco_custo": 11.48, "ncm": "82032090", "cest": "2005300", "origem_fiscal": 0, "minimo": 10},
    {"sku": "PIN-CAN-PFI-003-2321303", "nome": "Pinça Depil 9cm Canelada Ponta Fina", "categoria": "Depilação", "marca": "Solingen", "codigo_fornecedor": "2321.303", "preco_custo": 12.46, "ncm": "82032090", "cest": "2005300", "origem_fiscal": 0, "minimo": 10},
    {"sku": "PIN-INX-OBL-004-2260504", "nome": "Pinça Dep Aço Inox Obliqua", "categoria": "Depilação", "marca": "Solingen", "codigo_fornecedor": "2260.504", "preco_custo": 10.36, "ncm": "82032090", "cest": "2005300", "origem_fiscal": 0, "minimo": 10},
    {"sku": "PIN-INX-RET-005-2264504", "nome": "Pinça Dep Aço Inox Reta", "categoria": "Depilação", "marca": "Solingen", "codigo_fornecedor": "2264.504", "preco_custo": 10.36, "ncm": "82032090", "cest": "2005300", "origem_fiscal": 0, "minimo": 10},
    {"sku": "PIN-INX-PFI-006-2271504", "nome": "Pinça Dep Aço Inox Ponta Fina", "categoria": "Depilação", "marca": "Solingen", "codigo_fornecedor": "2271.504", "preco_custo": 11.62, "ncm": "82032090", "cest": "2005300", "origem_fiscal": 0, "minimo": 10},
    {"sku": "PIN-LAQ-OBL-007-2280504", "nome": "Pinça Dep Laqueada Obliqua", "categoria": "Depilação", "marca": "Solingen", "codigo_fornecedor": "2280.504", "preco_custo": 13.09, "ncm": "82032090", "cest": "2005300", "origem_fiscal": 0, "minimo": 10},
    {"sku": "PIN-LAQ-RED-008-2284504", "nome": "Pinça Dep Laqueada Redonda", "categoria": "Depilação", "marca": "Solingen", "codigo_fornecedor": "2284.504", "preco_custo": 13.09, "ncm": "82032090", "cest": "2005300", "origem_fiscal": 0, "minimo": 10},
    {"sku": "PIN-LAQ-PFI-009-2291504", "nome": "Pinça Dep Laqueada Ponta Fina", "categoria": "Depilação", "marca": "Solingen", "codigo_fornecedor": "2291.504", "preco_custo": 13.09, "ncm": "82032090", "cest": "2005300", "origem_fiscal": 0, "minimo": 10},
    {"sku": "NAV-INX-STD-001-3011548", "nome": "Navalha Aço Inox Standard", "categoria": "Barbeiro", "marca": "Solingen", "codigo_fornecedor": "3011.548", "preco_custo": 30.18, "ncm": "82121010", "origem_fiscal": 0, "minimo": 10},
    {"sku": "COL-MEL-RUB-001-404124", "nome": "Cola Master Elite Ruby 3ml", "categoria": "Cílios", "marca": "Master Elite", "codigo_fornecedor": "404124", "ean": "7908366404124", "preco_custo": 35.12, "ncm": "35061010", "origem_fiscal": 2, "minimo": 10},
    {"sku": "COL-MEL-DIA-002-404148", "nome": "Cola Master Elite Diamond 3ml", "categoria": "Cílios", "marca": "Master Elite", "codigo_fornecedor": "404148", "ean": "7908366404148", "preco_custo": 35.12, "ncm": "35061010", "origem_fiscal": 2, "minimo": 10},
    {"sku": "COL-MEL-EME-003-405220", "nome": "Cola Master Elite Emerald 3ml", "categoria": "Cílios", "marca": "Master Elite", "codigo_fornecedor": "405220", "ean": "7908366405220", "preco_custo": 35.12, "ncm": "35061010", "origem_fiscal": 2, "minimo": 10},
    {"sku": "COL-MEL-PKD-004-406968", "nome": "Cola Master Elite Pink Diamond 3ml", "categoria": "Cílios", "marca": "Master Elite", "codigo_fornecedor": "406968", "ean": "7908366406968", "preco_custo": 28.72, "ncm": "35061010", "origem_fiscal": 2, "minimo": 10},
    {"sku": "COL-MEL-PRD-005-406975", "nome": "Cola Master Elite Purple Diamond 3ml", "categoria": "Cílios", "marca": "Master Elite", "codigo_fornecedor": "406975", "ean": "7908366406975", "preco_custo": 28.72, "ncm": "35061010", "origem_fiscal": 2, "minimo": 10},
    {"sku": "COL-MEL-CHA-006-407057", "nome": "Cola Master Elite Charm 3ml", "categoria": "Cílios", "marca": "Master Elite", "codigo_fornecedor": "407057", "ean": "7908366407057", "preco_custo": 27.92, "ncm": "35061010", "origem_fiscal": 2, "minimo": 10},
    {"sku": "HEN-MAS-CCL-001-406647", "nome": "Henna Master Castanho Claro", "categoria": "Sobrancelhas", "marca": "Master", "codigo_fornecedor": "406647", "ean": "7908366406647", "preco_custo": 17.01, "ncm": "12119090", "cest": "2000100", "origem_fiscal": 0, "minimo": 10},
    {"sku": "HEN-MAS-CES-002-406661", "nome": "Henna Master Castanho Escuro", "categoria": "Sobrancelhas", "marca": "Master", "codigo_fornecedor": "406661", "ean": "7908366406661", "preco_custo": 17.01, "ncm": "12119090", "cest": "2000100", "origem_fiscal": 0, "minimo": 10},
    {"sku": "HEN-MAS-CMD-003-406654", "nome": "Henna Master Castanho Médio", "categoria": "Sobrancelhas", "marca": "Master", "codigo_fornecedor": "406654", "ean": "7908366406654", "preco_custo": 17.01, "ncm": "12119090", "cest": "2000100", "origem_fiscal": 0, "minimo": 10},
    {"sku": "HEN-MAS-PRE-004-406678", "nome": "Henna Master Preto", "categoria": "Sobrancelhas", "marca": "Master", "codigo_fornecedor": "406678", "ean": "7908366406678", "preco_custo": 17.01, "ncm": "12119090", "cest": "2000100", "origem_fiscal": 0, "minimo": 10},
    {"sku": "HEN-MAS-LES-005-406685", "nome": "Henna Master Loiro Escuro", "categoria": "Sobrancelhas", "marca": "Master", "codigo_fornecedor": "406685", "ean": "7908366406685", "preco_custo": 17.01, "ncm": "12119090", "cest": "2000100", "origem_fiscal": 0, "minimo": 10},
    {"sku": "HIDRA-001-7896868605678", "nome": "Spray Condicionante Tônico Antiqueda Fortalecedor 120ml", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868605678", "ean": "7896868605678", "preco_custo": 17.9, "minimo": 3},
    {"sku": "HIDRA-002-7896868605647", "nome": "Spray Condicionante Tônico Antiqueda Engrossador 120ml", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868605647", "ean": "7896868605647", "preco_custo": 17.9, "minimo": 3},
    {"sku": "HIDRA-003-7896868605852", "nome": "Máscara Antiqueda Fortalecedor 450g", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868605852", "ean": "7896868605852", "preco_custo": 25.3, "minimo": 3},
    {"sku": "HIDRA-004-7896868605845", "nome": "Máscara Antiqueda Engrossador 450g", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868605845", "ean": "7896868605845", "preco_custo": 25.3, "minimo": 3},
    {"sku": "HIDRA-005-7896868607009", "nome": "Leave-in Antiqueda Fortalecedor 285g", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868607009", "ean": "7896868607009", "preco_custo": 19.9, "minimo": 3},
    {"sku": "HIDRA-006-7896868606996", "nome": "Leave-in Antiqueda Engrossador 285g", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868606996", "ean": "7896868606996", "preco_custo": 19.9, "minimo": 3},
    {"sku": "HIDRA-007-7896868605623", "nome": "Shampoo Antiqueda Engrossador 500ml", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868605623", "ean": "7896868605623", "preco_custo": 23.3, "minimo": 3},
    {"sku": "HIDRA-008-7896868605654", "nome": "Shampoo Antiqueda Fortalecedor 500ml", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868605654", "ean": "7896868605654", "preco_custo": 23.3, "minimo": 3},
    {"sku": "HIDRA-009-7896868605661", "nome": "Condicionador Antiqueda Fortalecedor 400g", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868605661", "ean": "7896868605661", "preco_custo": 23.3, "minimo": 3},
    {"sku": "HIDRA-010-7896868605630", "nome": "Condicionador Antiqueda Engrossador 400g", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868605630", "ean": "7896868605630", "preco_custo": 23.3, "minimo": 3},
    {"sku": "HIDRA-011-7896868604930", "nome": "Shampoo Caviar Bylunnahair 350ml", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868604930", "ean": "7896868604930", "preco_custo": 23.9, "minimo": 3},
    {"sku": "HIDRA-012-7896868604190", "nome": "Máscara Colágeno Bylunnahair 250g", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868604190", "ean": "7896868604190", "preco_custo": 23.9, "minimo": 3},
    {"sku": "HIDRA-013-7896868604954", "nome": "Máscara Caviar Bylunnahair 250g", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868604954", "ean": "7896868604954", "preco_custo": 23.9, "minimo": 3},
    {"sku": "HIDRA-014-7896868605821", "nome": "Spray Condicionante Caviar Bylunnahair 120ml", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868605821", "ean": "7896868605821", "preco_custo": 18.9, "minimo": 3},
    {"sku": "HIDRA-015-7896868604961", "nome": "Leave-in Condicionante Caviar Bylunnahair 200ml", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868604961", "ean": "7896868604961", "preco_custo": 20.9, "minimo": 3},
    {"sku": "HIDRA-016-7896868604947", "nome": "Condicionador Caviar Bylunnahair 350ml", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868604947", "ean": "7896868604947", "preco_custo": 23.9, "minimo": 3},
    {"sku": "HIDRA-017-7896868604206", "nome": "Leave-in Condicionante Colágeno 200ml", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868604206", "ean": "7896868604206", "preco_custo": 20.9, "minimo": 3},
    {"sku": "HIDRA-018-7896868605944", "nome": "Spray Condicionante Colágeno Bylunnahair 120ml", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868605944", "ean": "7896868605944", "preco_custo": 18.9, "minimo": 3},
    {"sku": "HIDRA-019-7896868604176", "nome": "Shampoo Colágeno Bylunnahair 350ml", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868604176", "ean": "7896868604176", "preco_custo": 23.9, "minimo": 3},
    {"sku": "HIDRA-020-7896868604183", "nome": "Condicionador Colágeno Bylunnahair 350ml", "categoria": "Cabelos", "marca": "Hidra", "codigo_fornecedor": "7896868604183", "ean": "7896868604183", "preco_custo": 23.9, "minimo": 3}
  ]';
  v_kits jsonb := '[
    {"sku": "KIT-PIN-CAN-3", "nome": "Kit 3 Pinças Caneladas 9cm", "componentes": [{"sku": "PIN-CAN-PFI-003-2321303", "quantidade": 1}, {"sku": "PIN-CAN-OBL-001-2311303", "quantidade": 1}, {"sku": "PIN-CAN-RET-002-2341303", "quantidade": 1}]},
    {"sku": "KIT-PIN-INX-3", "nome": "Kit 3 Pinças Aço Inox", "componentes": [{"sku": "PIN-INX-PFI-006-2271504", "quantidade": 1}, {"sku": "PIN-INX-RET-005-2264504", "quantidade": 1}, {"sku": "PIN-INX-OBL-004-2260504", "quantidade": 1}]},
    {"sku": "KIT-PIN-LAQ-3", "nome": "Kit 3 Pinças Laqueadas", "componentes": [{"sku": "PIN-LAQ-PFI-009-2291504", "quantidade": 1}, {"sku": "PIN-LAQ-OBL-007-2280504", "quantidade": 1}, {"sku": "PIN-LAQ-RED-008-2284504", "quantidade": 1}]},
    {"sku": "KIT-PIN-INX-PF", "nome": "Kit 3 Pinças Inox Ponta Fina", "componentes": [{"sku": "PIN-INX-PFI-006-2271504", "quantidade": 3}]}
  ]';
begin
  select id, loja_atual into v_ceo, v_loja_antes from public.usuarios where cargo = 'ceo' and ativo order by criado_em limit 1;
  if v_ceo is null then
    raise exception 'Crie primeiro o usuário CEO (passo 1.3 do guia) e rode este arquivo de novo.';
  end if;
  if v_estoque is null then raise exception 'Loja DELLA ESTOQUE não encontrada.'; end if;

  -- age como o CEO, dentro do DELLA ESTOQUE (as funções conferem tudo isso)
  perform set_config('request.jwt.claim.sub', v_ceo::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  update public.usuarios set loja_atual = v_estoque where id = v_ceo;

  -- fornecedores
  insert into public.fornecedores (nome, cnpj)
  select x.nome, x.cnpj from (values
    ('ELEMENTAR COMERCIO DE PRODUTOS LTDA', '43694156000122'),
    ('Itapema Com Artigos Plasticos Ltda', '05432055000194'),
    ('VERMONTH IMPORTACAO E COMERCIO EIRELI', '78467669000185')) as x (nome, cnpj)
  where not exists (select 1 from public.fornecedores f where f.cnpj = x.cnpj);

  -- 1. produtos
  for v_p in select * from jsonb_array_elements(v_catalogo) loop
    v_id := (select id from public.produtos where sku = v_p ->> 'sku');
    perform public.salvar_produto(
      (v_p - 'minimo') || jsonb_build_object('id', v_id, 'unidade', 'UN',
        'minimos', jsonb_build_object(v_estoque::text, (v_p ->> 'minimo')::int)));
  end loop;

  -- 2. kits
  for v_k in select * from jsonb_array_elements(v_kits) loop
    v_id := (select id from public.produtos where sku = v_k ->> 'sku');
    v_id := public.salvar_produto(jsonb_build_object('id', v_id, 'sku', v_k ->> 'sku', 'nome', v_k ->> 'nome',
      'categoria', 'Kits', 'marca', 'Solingen', 'unidade', 'KIT'));
    perform public.salvar_kit(v_id, (
      select jsonb_agg(jsonb_build_object('produto_id', p.id, 'quantidade', (c ->> 'quantidade')::int))
        from jsonb_array_elements(v_k -> 'componentes') c join public.produtos p on p.sku = c ->> 'sku'));
  end loop;

  -- 3. histórico (a "chave" impede lançar duas vezes se o arquivo for rodado de novo)
  perform public.registrar_entrada(jsonb_build_object(
    'chave', 'della-carga-01', 'loja_id', v_estoque, 'motivo', 'compra',
    'numero_pedido', '3108', 'data_hora', '2026-09-23T12:00',
    'nota', jsonb_build_object('numero', '3680', 'fornecedor_nome', 'Novara'),
    'observacao', 'Pedido 3108 da Elementar. NF de compra Novara 3.680 (conforme tabela fiscal) – conferir',
    'itens', (select jsonb_agg(jsonb_build_object('produto_id', p.id, 'quantidade', x.q, 'custo_unitario', x.c))
                from (values ('BLP-001-7899661779133', 120, 25.90), ('BLP-002-7899661779126', 120, 25.90),
                             ('BLP-003-7899661779157', 120, 25.90), ('BLP-004-7899661779140', 120, 25.90),
                             ('GEL-001-7899661779171', 120, 22.90), ('HLB-001-7899661779065', 128, 15.90),
                             ('HLB-002-7899661779058', 128, 15.90), ('HLB-003-7899661779072', 128, 15.90)) x (sku, q, c)
                join public.produtos p on p.sku = x.sku)));

  perform public.registrar_entrada(jsonb_build_object(
    'chave', 'della-carga-02', 'loja_id', v_estoque, 'motivo', 'compra',
    'numero_pedido', '61026', 'data_hora', '2026-09-24T08:31',
    'nota', jsonb_build_object('numero', '16653', 'serie', '1', 'data_emissao', '2026-09-24',
      'chave_acesso', '41260905432055000194550010000166531004640320',
      'fornecedor_nome', 'Itapema Com Artigos Plasticos Ltda', 'fornecedor_cnpj', '05432055000194',
      'valor_total', 11762.16, 'cfop', '5102', 'natureza_operacao', 'VENDA DE MERCADORIA'),
    'observacao', 'Orçamento Itapema 61026',
    'itens', (select jsonb_agg(jsonb_build_object('produto_id', p.id, 'quantidade', x.q, 'custo_unitario', x.c))
                from (values ('PIN-CAN-OBL-001-2311303', 120, 11.48), ('PIN-CAN-RET-002-2341303', 120, 11.48),
                             ('PIN-CAN-PFI-003-2321303', 168, 12.46), ('PIN-INX-OBL-004-2260504', 60, 10.36),
                             ('PIN-INX-RET-005-2264504', 60, 10.36), ('PIN-INX-PFI-006-2271504', 120, 11.62),
                             ('PIN-LAQ-OBL-007-2280504', 48, 13.09), ('PIN-LAQ-RED-008-2284504', 48, 13.09),
                             ('PIN-LAQ-PFI-009-2291504', 120, 13.09), ('NAV-INX-STD-001-3011548', 48, 30.18)) x (sku, q, c)
                join public.produtos p on p.sku = x.sku)));

  perform public.registrar_entrada(jsonb_build_object(
    'chave', 'della-carga-03', 'loja_id', v_estoque, 'motivo', 'compra',
    'numero_pedido', '33494', 'data_hora', '2026-09-30T12:52',
    'nota', jsonb_build_object('numero', '46780', 'serie', '1', 'data_emissao', '2026-09-30',
      'chave_acesso', '41260978467669000185550010000467801281181423',
      'fornecedor_nome', 'VERMONTH IMPORTACAO E COMERCIO EIRELI', 'fornecedor_cnpj', '78467669000185',
      'valor_total', 11394.88, 'natureza_operacao', 'Vendas de merc. adquiridas e/ou recebidas de terceiros'),
    'observacao', 'Custos com o desconto da nota. Lotes/validade: Ruby 36VN03 24/01/2028 · Diamond 36VN33 24/01/2028 · '
      || 'Emerald sem lote na NF (conferir na embalagem) · Pink Diamond VM260703 27/01/2028 · Purple Diamond VM260206 13/10/2027 · '
      || 'Charm VM260703 27/01/2028 · Henna Cast. Claro CC210132, Cast. Escuro CE230334, Cast. Médio CM220233, '
      || 'Preto P240435, Loiro Escuro 250536 (todas val. 01/11/2027)',
    'itens', (select jsonb_agg(jsonb_build_object('produto_id', p.id, 'quantidade', x.q, 'custo_unitario', x.c))
                from (values ('COL-MEL-RUB-001-404124', 100, 35.12), ('COL-MEL-DIA-002-404148', 50, 35.12),
                             ('COL-MEL-EME-003-405220', 50, 35.12), ('COL-MEL-PKD-004-406968', 36, 28.72),
                             ('COL-MEL-PRD-005-406975', 36, 28.72), ('COL-MEL-CHA-006-407057', 24, 27.92),
                             ('HEN-MAS-CCL-001-406647', 24, 17.01), ('HEN-MAS-CES-002-406661', 24, 17.01),
                             ('HEN-MAS-CMD-003-406654', 24, 17.01), ('HEN-MAS-PRE-004-406678', 12, 17.01),
                             ('HEN-MAS-LES-005-406685', 12, 17.01)) x (sku, q, c)
                join public.produtos p on p.sku = x.sku)));

  perform public.registrar_saida(jsonb_build_object(
    'chave', 'della-carga-04', 'loja_id', v_estoque, 'motivo', 'venda', 'plataforma', 'mercado_livre',
    'numero_pedido', 'não informado', 'data_hora', '2026-09-30T18:00',
    'observacao', 'Venda anotada na planilha sem número do pedido',
    'itens', jsonb_build_array(jsonb_build_object('produto_id', (select id from public.produtos where sku = 'BLP-003-7899661779157'), 'quantidade', 1))));

  perform public.registrar_saida(jsonb_build_object(
    'chave', 'della-carga-05', 'loja_id', v_estoque, 'motivo', 'venda', 'plataforma', 'mercado_livre',
    'numero_pedido', '2000015313553717', 'data_hora', '2026-10-02T10:00',
    'itens', jsonb_build_array(jsonb_build_object('produto_id', (select id from public.produtos where sku = 'NAV-INX-STD-001-3011548'), 'quantidade', 3))));

  perform public.registrar_saida(jsonb_build_object(
    'chave', 'della-carga-06', 'loja_id', v_estoque, 'motivo', 'venda', 'plataforma', 'mercado_livre',
    'numero_pedido', '2000015295484913', 'data_hora', '2026-10-02T10:05',
    'itens', jsonb_build_array(jsonb_build_object('produto_id', (select id from public.produtos where sku = 'KIT-PIN-CAN-3'), 'quantidade', 1))));

  perform public.registrar_saida(jsonb_build_object(
    'chave', 'della-carga-07', 'loja_id', v_estoque, 'motivo', 'venda', 'plataforma', 'mercado_livre',
    'numero_pedido', 'não informado', 'data_hora', '2026-10-02T10:10',
    'observacao', 'Venda anotada na planilha sem número do pedido',
    'itens', jsonb_build_array(jsonb_build_object('produto_id', (select id from public.produtos where sku = 'NAV-INX-STD-001-3011548'), 'quantidade', 1))));

  perform public.registrar_entrada(jsonb_build_object(
    'chave', 'della-carga-08', 'loja_id', v_estoque, 'motivo', 'compra',
    'numero_pedido', '3136', 'data_hora', '2026-10-02T12:00',
    'observacao', 'Pedido de venda Bling 3136 da ELEMENTAR COMERCIO DE PRODUTOS LTDA (CNPJ 43.694.156/0001-22), total R$ 3.970,80. NF ainda não lançada',
    'itens', (select jsonb_agg(jsonb_build_object('produto_id', p.id, 'quantidade', x.q, 'custo_unitario', p.preco_custo))
                from (values ('HIDRA-001-7896868605678', 12), ('HIDRA-002-7896868605647', 12), ('HIDRA-003-7896868605852', 12),
                             ('HIDRA-004-7896868605845', 12), ('HIDRA-005-7896868607009', 12), ('HIDRA-006-7896868606996', 12),
                             ('HIDRA-007-7896868605623', 12), ('HIDRA-008-7896868605654', 12), ('HIDRA-009-7896868605661', 12),
                             ('HIDRA-010-7896868605630', 12), ('HIDRA-011-7896868604930', 6), ('HIDRA-012-7896868604190', 6),
                             ('HIDRA-013-7896868604954', 6), ('HIDRA-014-7896868605821', 6), ('HIDRA-015-7896868604961', 6),
                             ('HIDRA-016-7896868604947', 6), ('HIDRA-017-7896868604206', 6), ('HIDRA-018-7896868605944', 6),
                             ('HIDRA-019-7896868604176', 6), ('HIDRA-020-7896868604183', 6)) x (sku, q)
                join public.produtos p on p.sku = x.sku)));

  update public.usuarios set loja_atual = v_loja_antes where id = v_ceo;
end $$;

-- Conferência: saldo de cada produto no DELLA ESTOQUE (deve bater com a planilha)
select p.sku, p.nome, pl.saldo
  from public.produtos p
  join public.produto_loja pl on pl.produto_id = p.id
  join public.lojas l on l.id = pl.loja_id and l.codigo = 'ESTOQUE'
 where not p.eh_kit
 order by p.sku;
