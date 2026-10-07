-- =====================================================================
--  DELLA — Arquivo 7: PLATAFORMA SHOPEE NA SAÍDA
--
--  Rode DEPOIS do 06 (ou do 05, numa instalação sem os produtos reais).
--  Não apaga nenhum dado. Pode rodar de novo sem problema.
--
--  A saída para PEDIDO no DELLA ESTOQUE passa a aceitar 3 plataformas:
--  Mercado Livre, TikTok Shop e Shopee. No DELLA FULL ML continua sempre
--  Mercado Livre.
-- =====================================================================

alter table public.operacoes drop constraint if exists operacoes_plataforma_valida;
alter table public.operacoes add constraint operacoes_plataforma_valida
  check (plataforma in ('mercado_livre', 'tiktok_shop', 'shopee'));

-- a baixa (sem kits) que o arquivo 05 chamou de "registrar_saida_componentes"
create or replace function public.registrar_saida_componentes(p jsonb)
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
      raise exception 'Escolha a plataforma do pedido (Mercado Livre, TikTok Shop ou Shopee).';
    elsif v_plat not in ('mercado_livre', 'tiktok_shop', 'shopee') then
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
         case o.plataforma when 'mercado_livre' then 'Mercado Livre' when 'tiktok_shop' then 'TikTok Shop' when 'shopee' then 'Shopee' end,
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

