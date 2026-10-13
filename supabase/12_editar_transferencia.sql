-- =====================================================================
--  DELLA — Arquivo 12: EDITAR UMA TRANSFERÊNCIA JÁ FEITA (só o CEO)
--
--  Rode depois dos anteriores. Não apaga nenhum dado. Pode rodar de novo.
--
--  O histórico nunca é apagado: editar = desfazer a transferência antiga
--  (fica marcada como "estornada", com o motivo da edição) e gravar uma nova
--  com os dados corrigidos, tudo de uma vez (ou tudo, ou nada).
--  A nota fiscal e o anexo da transferência antiga continuam valendo.
-- =====================================================================

-- p = {"transferencia_id", "itens":[{"produto_id","quantidade"}], "observacao", "motivo"}
create or replace function public.editar_transferencia(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  t public.transferencias;
  v_id bigint := nullif(p ->> 'transferencia_id', '')::bigint;
  v_motivo text := nullif(trim(coalesce(p ->> 'motivo', '')), '');
  v_item record;
  v_op bigint;
  v_novo jsonb;
  v_novo_id bigint;
  v_custo numeric;
begin
  perform public.fn_exigir_ceo();
  if v_motivo is null then raise exception 'Informe o motivo da edição.'; end if;
  select * into t from public.transferencias where id = v_id for update;
  if not found then raise exception 'Transferência não encontrada.'; end if;
  if t.status = 'estornada' then raise exception 'Esta transferência já foi estornada ou editada.'; end if;
  -- como numa transferência nova: só a partir do estoque de origem
  perform public.fn_exigir_loja_atual(t.loja_origem_id, 'editar esta transferência');
  if jsonb_typeof(p -> 'itens') <> 'array' or jsonb_array_length(p -> 'itens') = 0 then
    raise exception 'Adicione pelo menos um produto.';
  end if;

  -- 1) desfaz a antiga: a mercadoria volta do destino para a origem
  insert into public.operacoes (tipo, motivo, loja_origem_id, loja_destino_id, nota_fiscal_id, observacao, transferencia_id,
                                estorno_de, usuario_id)
  select 'estorno', 'Edição: ' || v_motivo, t.loja_destino_id, t.loja_origem_id, t.nota_fiscal_id,
         'Edição da transferência nº ' || t.id, t.id, o.id, auth.uid()
    from public.operacoes o where o.transferencia_id = t.id and o.tipo = 'transferencia'
  returning id into v_op;
  for v_item in select * from public.transferencia_itens where transferencia_id = t.id order by produto_id loop
    perform 1 from public.produto_loja where produto_id = v_item.produto_id and loja_id = t.loja_destino_id for update;
    perform public.fn_exigir_disponivel(v_item.produto_id, t.loja_destino_id, v_item.quantidade);
    perform public.fn_movimentar(v_op, v_item.produto_id, t.loja_destino_id, -v_item.quantidade, null);
    perform public.fn_movimentar(v_op, v_item.produto_id, t.loja_origem_id, v_item.quantidade, null);
  end loop;
  update public.operacoes set estornada_por = v_op where transferencia_id = t.id and tipo = 'transferencia';
  update public.transferencias set status = 'estornada', estornado_por = auth.uid(), estornado_em = now(),
         motivo_estorno = 'Editada: ' || v_motivo where id = t.id;

  -- 2) grava a nova, com os dados corrigidos (kits viram as peças, como sempre)
  v_novo := public.fn_trocar_kits(jsonb_build_object('itens', p -> 'itens',
              'observacao', nullif(trim(coalesce(p ->> 'observacao', '')), '')));
  insert into public.transferencias (loja_origem_id, loja_destino_id, observacao, nota_fiscal_id, usuario_id)
  values (t.loja_origem_id, t.loja_destino_id,
          concat_ws(' · ', nullif(v_novo ->> 'observacao', ''), 'Correção da transferência nº ' || t.id),
          t.nota_fiscal_id, auth.uid())
  returning id into v_novo_id;
  insert into public.operacoes (tipo, motivo, loja_origem_id, loja_destino_id, nota_fiscal_id, observacao, transferencia_id, usuario_id)
  select 'transferencia', 'transferencia', n.loja_origem_id, n.loja_destino_id, n.nota_fiscal_id, n.observacao, n.id, auth.uid()
    from public.transferencias n where n.id = v_novo_id
  returning id into v_op;
  for v_item in select * from public.fn_ler_itens(v_novo -> 'itens') loop
    perform 1 from public.produto_loja where produto_id = v_item.produto_id and loja_id = t.loja_origem_id for update;
    perform public.fn_exigir_disponivel(v_item.produto_id, t.loja_origem_id, v_item.quantidade);
    select custo_medio into v_custo from public.produtos where id = v_item.produto_id;
    perform public.fn_movimentar(v_op, v_item.produto_id, t.loja_origem_id, -v_item.quantidade, v_custo);
    perform public.fn_movimentar(v_op, v_item.produto_id, t.loja_destino_id, v_item.quantidade, v_custo);
    insert into public.transferencia_itens (transferencia_id, produto_id, quantidade)
    values (v_novo_id, v_item.produto_id, v_item.quantidade);
  end loop;
  return v_novo_id;
end $$;

revoke execute on function public.editar_transferencia(jsonb) from public, anon;
grant execute on function public.editar_transferencia(jsonb) to authenticated;
