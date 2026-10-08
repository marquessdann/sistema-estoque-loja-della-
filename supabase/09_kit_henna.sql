-- =====================================================================
--  DELLA — Arquivo 9: KIT HENNA (KIT-HEN-CAS-3)
--
--  Rode DEPOIS do 06. Pode rodar de novo: não duplica nada.
--
--  Kit Henna Castanho Claro, Médio e Escuro = 1 de cada henna Master
--  da NF 46.780 (Vermonth). A NF trouxe 24 de cada cor, que já estão no
--  estoque; por isso o kit NÃO lança estoque novo: ele mostra quantos kits
--  dá para montar (24) e, ao dar baixa em 1 kit, tira 1 henna de cada cor.
-- =====================================================================
do $$
declare
  v_ceo uuid;
  v_id bigint;
begin
  select id into v_ceo from public.usuarios where cargo = 'ceo' and ativo order by criado_em limit 1;
  if v_ceo is null then raise exception 'Crie primeiro o usuário CEO.'; end if;
  perform set_config('request.jwt.claim.sub', v_ceo::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);

  if (select count(*) from public.produtos
       where sku in ('HEN-MAS-CCL-001-406647', 'HEN-MAS-CMD-003-406654', 'HEN-MAS-CES-002-406661')) <> 3 then
    raise exception 'As hennas da NF 46.780 não foram encontradas. Rode antes o arquivo 06.';
  end if;

  v_id := public.salvar_produto(jsonb_build_object(
    'id', (select id from public.produtos where sku = 'KIT-HEN-CAS-3'),
    'sku', 'KIT-HEN-CAS-3', 'nome', 'Kit Henna Castanho Claro, Médio e Escuro',
    'categoria', 'Kits', 'marca', 'Master', 'unidade', 'KIT'));
  perform public.salvar_kit(v_id, (
    select jsonb_agg(jsonb_build_object('produto_id', p.id, 'quantidade', 1))
      from public.produtos p
     where p.sku in ('HEN-MAS-CCL-001-406647', 'HEN-MAS-CMD-003-406654', 'HEN-MAS-CES-002-406661')));
end $$;

-- Conferência: componentes do kit e saldo de cada um (kits possíveis = o menor saldo)
select k.sku as kit, c.sku as componente, c.nome, ki.quantidade, pl.saldo
  from public.produtos k
  join public.kit_itens ki on ki.kit_id = k.id
  join public.produtos c on c.id = ki.produto_id
  join public.produto_loja pl on pl.produto_id = c.id
  join public.lojas l on l.id = pl.loja_id and l.codigo = 'ESTOQUE'
 where k.sku = 'KIT-HEN-CAS-3'
 order by c.nome;
