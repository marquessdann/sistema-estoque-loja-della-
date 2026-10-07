#!/usr/bin/env bash
# =====================================================================
# Testes de ataque direto à API (sem passar pela tela), como FUNCIONÁRIO e como GERENTE.
# Prova que os cargos estão protegidos no servidor/banco, não só nos botões.
#
# Uso (num ambiente de TESTE):
#   SUPABASE_URL=http://127.0.0.1:54321 ANON_KEY=... APP_URL=http://localhost:3000 \
#   FUNCIONARIO_EMAIL=antonio@della.com FUNCIONARIO_SENHA=... \
#   GERENTE_EMAIL=vinicius@della.com GERENTE_SENHA=... bash testes/api_permissoes.sh
# =====================================================================
A=${SUPABASE_URL:?}; AN=${ANON_KEY:?}; APP=${APP_URL:-http://localhost:3000}
ok=0; falhou=0
token(){ curl -s "$A/auth/v1/token?grant_type=password" -H "apikey: $AN" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))"; }
OP=""; GE=""
[ -n "$FUNCIONARIO_EMAIL" ] && OP=$(token "$FUNCIONARIO_EMAIL" "$FUNCIONARIO_SENHA")
[ -n "$GERENTE_EMAIL" ] && GE=$(token "$GERENTE_EMAIL" "$GERENTE_SENHA")
[ -n "$OP$GE" ] || { echo "Informe FUNCIONARIO_EMAIL/FUNCIONARIO_SENHA e/ou GERENTE_EMAIL/GERENTE_SENHA"; exit 1; }
sub(){ python3 -c "import sys,json,base64;p=sys.argv[1].split('.')[1];p+='='*(-len(p)%4);print(json.loads(base64.urlsafe_b64decode(p))['sub'])" "$1"; }

# espera(descrição, token, trecho esperado na resposta, curl args...)
espera(){
  local desc="$1" tk="$2" trecho="$3"; shift 3
  local resp; resp=$(curl -s -w ' [HTTP %{http_code}]' "$@" -H "apikey: $AN" ${tk:+-H "Authorization: Bearer $tk"} -H 'Content-Type: application/json')
  if echo "$resp" | grep -qiE "$trecho"; then ok=$((ok+1)); echo "🔒 OK      $desc"
  else falhou=$((falhou+1)); echo "❌ FALHOU  $desc -> ${resp:0:200}"; fi
}
R=$A/rest/v1
if [ -n "$OP" ]; then
OID=$(sub "$OP")
espera "Funcionário NÃO cria produto (RPC)"                 "$OP" "Sem permissão"      -X POST $R/rpc/salvar_produto -d '{"p":{"nome":"Hack"}}'
espera "Funcionário NÃO edita produto existente (RPC)"      "$OP" "Sem permissão"      -X POST $R/rpc/salvar_produto -d '{"p":{"id":1,"nome":"Hack","preco_venda":0}}'
espera "Funcionário NÃO monta/desmonta kit"                 "$OP" "Sem permissão"      -X POST $R/rpc/salvar_kit -d '{"p_kit":1,"p_itens":[]}'
espera "Funcionário NÃO inativa produto"                    "$OP" "Somente o CEO ou o gerente" -X POST $R/rpc/definir_produto_ativo -d '{"p_id":1,"p_ativo":false}'
espera "Funcionário NÃO exclui produto"                     "$OP" "Somente o CEO"      -X POST $R/rpc/excluir_produto -d '{"p_id":1}'
espera "Funcionário NÃO apaga produto por DELETE direto"    "$OP" "permission denied|42501" -X DELETE "$R/produtos?id=eq.1"
espera "Funcionário NÃO altera preço por PATCH direto"      "$OP" "permission denied|42501" -X PATCH "$R/produtos?id=eq.1" -d '{"preco_venda":0.01}'
espera "Funcionário NÃO importa planilha"                   "$OP" "Sem permissão"      -X POST $R/rpc/importar_produtos -d '{"p_linhas":[{"nome":"X"}]}'
espera "Funcionário NÃO cria categoria"                     "$OP" "row-level security|42501" -X POST $R/categorias -d '{"nome":"Hack"}'
espera "Funcionário NÃO cria/edita loja"                    "$OP" "Somente o CEO"      -X POST $R/rpc/salvar_loja -d '{"p":{"nome":"HACK"}}'
espera "Funcionário NÃO altera loja por PATCH direto"       "$OP" "permission denied|42501" -X PATCH "$R/lojas?id=eq.1" -d '{"nome":"X"}'
espera "Funcionário NÃO vira CEO"                           "$OP" "permission denied|42501" -X PATCH "$R/usuarios?email=eq.$FUNCIONARIO_EMAIL" -d '{"cargo":"ceo"}'
espera "Funcionário NÃO altera saldo direto"                "$OP" "permission denied|42501" -X PATCH "$R/produto_loja?produto_id=eq.1" -d '{"saldo":999}'
espera "Funcionário NÃO apaga movimentação"                 "$OP" "permission denied|42501" -X DELETE "$R/movimentacoes?id=gt.0"
espera "Funcionário NÃO altera histórico (operacoes)"       "$OP" "permission denied|42501" -X PATCH "$R/operacoes?id=gt.0" -d '{"numero_pedido":"x"}'
espera "Funcionário NÃO cria transferência direto na tabela" "$OP" "permission denied|42501" -X POST $R/transferencias -d '{"loja_origem_id":1,"loja_destino_id":2}'
espera "Funcionário NÃO chama função interna fn_movimentar" "$OP" "permission denied|42501|Could not find" -X POST $R/rpc/fn_movimentar -d '{"p_operacao":1,"p_produto":1,"p_loja":1,"p_qtd":100,"p_custo":0}'
espera "Funcionário NÃO chama a entrada interna (sem regras)" "$OP" "permission denied|42501|Could not find" -X POST $R/rpc/registrar_entrada_interno -d '{"p":{}}'
espera "Funcionário NÃO dá entrada"                         "$OP" "Sem permissão"      -X POST $R/rpc/registrar_entrada -d '{"p":{"loja_id":1,"itens":[{"produto_id":1,"quantidade":1}]}}'
espera "Funcionário NÃO faz inventário"                     "$OP" "Sem permissão"      -X POST $R/rpc/registrar_ajuste -d '{"p":{"loja_id":1,"motivo":"x","itens":[{"produto_id":1,"quantidade_contada":0}]}}'
espera "Funcionário NÃO estorna"                            "$OP" "Sem permissão"      -X POST $R/rpc/estornar_operacao -d '{"p_operacao_id":1,"p_motivo":"x"}'
espera "Funcionário NÃO lê lançamentos de outros"           "$OP" '^\[\] \[HTTP 200\]' "$R/movimentacoes?select=id&usuario_id=neq.$OID&limit=5"
espera "Funcionário NÃO lê auditoria (lista vazia)"         "$OP" '^\[\] \[HTTP 200\]' "$R/auditoria?select=id&limit=5"
espera "Funcionário NÃO lê convites"                        "$OP" "permission denied|42501" "$R/usuarios_convites"
espera "Funcionário NÃO cria usuário pela API do sistema"   "$OP" "Apenas o CEO|HTTP 403" -X POST $APP/api/usuarios -H "Cookie: x=y" -d '{"nome":"x","email":"x@x.com","senha":"12345678"}'
espera "Funcionário NÃO altera usuário pela API do sistema" "$OP" "Apenas o CEO|HTTP 403" -X PATCH $APP/api/usuarios -d '{"id":"x","cargo":"gerente"}'
espera "Funcionário NÃO muda situação de transferência"     "$OP" "permission denied|42501" -X PATCH "$R/transferencias?id=gt.0" -d '{"status":"estornada"}'
espera "Funcionário NÃO lê a senha dos estoques"            "$OP" "permission denied|42501" "$R/lojas?select=senha_hash"
espera "Funcionário NÃO troca a senha de um estoque"        "$OP" "Somente o CEO"      -X POST $R/rpc/definir_senha_loja -d '{"p_loja":1,"p_senha":"hack123"}'
espera "Senha errada do estoque não entra (devolve false)"  "$OP" '^false \[HTTP 200\]' -X POST $R/rpc/entrar_loja -d '{"p_loja":2,"p_senha":"chute"}'
espera "Funcionário NÃO se coloca em outro estoque sem senha" "$OP" "permission denied|42501" -X PATCH "$R/usuarios?email=eq.$FUNCIONARIO_EMAIL" -d '{"loja_atual":2}'
espera "Funcionário NÃO lê o log de atividades (lista vazia)" "$OP" '^\[\] \[HTTP 200\]' "$R/vw_log?select=acao&limit=5"
fi
if [ -n "$GE" ]; then
espera "Gerente NÃO exclui produto (só o CEO)"              "$GE" "Somente o CEO"      -X POST $R/rpc/excluir_produto -d '{"p_id":1}'
espera "Gerente NÃO cria/edita loja (só o CEO)"             "$GE" "Somente o CEO"      -X POST $R/rpc/salvar_loja -d '{"p":{"nome":"HACK"}}'
espera "Gerente NÃO troca a senha de um estoque (só o CEO)" "$GE" "Somente o CEO"      -X POST $R/rpc/definir_senha_loja -d '{"p_loja":1,"p_senha":"hack123"}'
espera "Gerente NÃO vira CEO"                               "$GE" "permission denied|42501" -X PATCH "$R/usuarios?email=eq.$GERENTE_EMAIL" -d '{"cargo":"ceo"}'
espera "Gerente NÃO cria usuário pela API do sistema"       "$GE" "Apenas o CEO|HTTP 403" -X POST $APP/api/usuarios -d '{"nome":"x","email":"x@x.com","senha":"12345678"}'
espera "Gerente NÃO altera usuário pela API do sistema"     "$GE" "Apenas o CEO|HTTP 403" -X PATCH $APP/api/usuarios -d '{"id":"x","cargo":"gerente"}'
espera "Gerente NÃO altera saldo direto"                    "$GE" "permission denied|42501" -X PATCH "$R/produto_loja?produto_id=eq.1" -d '{"saldo":999}'
espera "Gerente NÃO apaga movimentação"                     "$GE" "permission denied|42501" -X DELETE "$R/movimentacoes?id=gt.0"
fi
espera "Visitante sem login NÃO lê produtos"             ""    "permission denied|42501|401" "$R/produtos?select=id&limit=1"
espera "Visitante sem login NÃO chama funções"           ""    "permission denied|42501|401" -X POST $R/rpc/registrar_saida -d '{"p":{}}'
espera "Cadastro público pelo login é bloqueado"         ""    "Database error|bloqueado|HTTP 500|HTTP 422|not allowed|disabled" -X POST "$A/auth/v1/signup" -d '{"email":"intruso@x.com","password":"Senha@12345"}'
espera "Token falso é recusado"                          "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.falso" "JWT|invalid|401|PGRST" "$R/produtos?select=id&limit=1"
echo; echo "RESULTADO: $ok bloqueado(s) corretamente, $falhou falha(s)"
[ $falhou -eq 0 ]
