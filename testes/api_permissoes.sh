#!/usr/bin/env bash
# =====================================================================
# Testes de ataque direto à API (sem passar pela tela), como OPERADOR.
# Prova que as permissões estão protegidas no servidor/banco, não só nos botões.
#
# Uso (num ambiente de TESTE):
#   SUPABASE_URL=http://127.0.0.1:54321 ANON_KEY=... APP_URL=http://localhost:3000 \
#   OPERADOR_EMAIL=antonio@della.com OPERADOR_SENHA=... bash testes/api_permissoes.sh
# Para testar um operador com TODAS as permissões desligadas, rode também com
#   RESTRITO_EMAIL=... RESTRITO_SENHA=...  (pode ser o mesmo usuário, depois de desligar tudo na tela Usuários)
# =====================================================================
A=${SUPABASE_URL:?}; AN=${ANON_KEY:?}; APP=${APP_URL:-http://localhost:3000}
ok=0; falhou=0
token(){ curl -s "$A/auth/v1/token?grant_type=password" -H "apikey: $AN" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))"; }
OP=""; RE=""
[ -n "$OPERADOR_EMAIL" ] && OP=$(token "$OPERADOR_EMAIL" "$OPERADOR_SENHA")
[ -n "$RESTRITO_EMAIL" ] && RE=$(token "$RESTRITO_EMAIL" "$RESTRITO_SENHA")
[ -n "$OP$RE" ] || { echo "Informe OPERADOR_EMAIL/OPERADOR_SENHA e/ou RESTRITO_EMAIL/RESTRITO_SENHA"; exit 1; }
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
espera "Operador NÃO cria produto (RPC)"                 "$OP" "Sem permissão"      -X POST $R/rpc/salvar_produto -d '{"p":{"nome":"Hack"}}'
espera "Operador NÃO edita produto existente (RPC)"      "$OP" "Sem permissão"      -X POST $R/rpc/salvar_produto -d '{"p":{"id":1,"nome":"Hack","preco_venda":0}}'
espera "Operador NÃO inativa produto"                    "$OP" "Somente o administrador" -X POST $R/rpc/definir_produto_ativo -d '{"p_id":1,"p_ativo":false}'
espera "Operador NÃO exclui produto"                     "$OP" "Somente o administrador" -X POST $R/rpc/excluir_produto -d '{"p_id":1}'
espera "Operador NÃO apaga produto por DELETE direto"    "$OP" "permission denied|42501" -X DELETE "$R/produtos?id=eq.1"
espera "Operador NÃO altera preço por PATCH direto"      "$OP" "permission denied|42501" -X PATCH "$R/produtos?id=eq.1" -d '{"preco_venda":0.01}'
espera "Operador NÃO importa planilha"                   "$OP" "Sem permissão"      -X POST $R/rpc/importar_produtos -d '{"p_linhas":[{"nome":"X"}]}'
espera "Operador NÃO cria categoria"                     "$OP" "row-level security|42501" -X POST $R/categorias -d '{"nome":"Hack"}'
espera "Operador NÃO cria/edita loja"                    "$OP" "Somente o administrador" -X POST $R/rpc/salvar_loja -d '{"p":{"nome":"HACK"}}'
espera "Operador NÃO altera loja por PATCH direto"       "$OP" "permission denied|42501" -X PATCH "$R/lojas?id=eq.1" -d '{"nome":"X"}'
espera "Operador NÃO vira administrador"                 "$OP" "permission denied|42501" -X PATCH "$R/usuarios?email=eq.$OPERADOR_EMAIL" -d '{"perfil":"admin"}'
espera "Operador NÃO se dá permissões"                   "$OP" "permission denied|42501" -X PATCH "$R/usuarios?email=eq.$OPERADOR_EMAIL" -d '{"perm_estornar":true}'
espera "Operador NÃO altera saldo direto"                "$OP" "permission denied|42501" -X PATCH "$R/produto_loja?produto_id=eq.1" -d '{"saldo":999}'
espera "Operador NÃO apaga movimentação"                 "$OP" "permission denied|42501" -X DELETE "$R/movimentacoes?id=gt.0"
espera "Operador NÃO altera histórico (operacoes)"       "$OP" "permission denied|42501" -X PATCH "$R/operacoes?id=gt.0" -d '{"motivo":"x"}'
espera "Operador NÃO cria transferência direto na tabela" "$OP" "permission denied|42501" -X POST $R/transferencias -d '{"loja_origem_id":1,"loja_destino_id":2}'
espera "Operador NÃO chama função interna fn_movimentar" "$OP" "permission denied|42501|Could not find" -X POST $R/rpc/fn_movimentar -d '{"p_operacao":1,"p_produto":1,"p_loja":1,"p_qtd":100,"p_custo":0}'
espera "Operador NÃO estorna (sem permissão)"            "$OP" "Sem permissão"      -X POST $R/rpc/estornar_operacao -d '{"p_operacao_id":1,"p_motivo":"x"}'
espera "Operador NÃO lê auditoria (lista vazia)"         "$OP" '^\[\] \[HTTP 200\]' "$R/auditoria?select=id&limit=5"
espera "Operador NÃO lê convites"                        "$OP" "permission denied|42501" "$R/usuarios_convites"
espera "Operador NÃO cria usuário pela API do sistema"   "$OP" "Apenas o administrador|HTTP 403" -X POST $APP/api/usuarios -H "Cookie: x=y" -d '{"nome":"x","email":"x@x.com","senha":"12345678"}'
espera "Operador NÃO altera usuário pela API do sistema" "$OP" "Apenas o administrador|HTTP 403" -X PATCH $APP/api/usuarios -d '{"id":"x","perfil":"admin"}'
espera "Operador NÃO muda situação de transferência na tabela" "$OP" "permission denied|42501" -X PATCH "$R/transferencias?id=gt.0" -d '{"status":"estornada"}'
espera "Operador NÃO lê a senha dos estoques"            "$OP" "permission denied|42501" "$R/lojas?select=senha_hash"
espera "Operador NÃO troca a senha de um estoque"        "$OP" "Somente o administrador" -X POST $R/rpc/definir_senha_loja -d '{"p_loja":1,"p_senha":"hack123"}'
espera "Senha errada do estoque não entra (devolve false)" "$OP" '^false \[HTTP 200\]' -X POST $R/rpc/entrar_loja -d '{"p_loja":2,"p_senha":"chute"}'
espera "Operador NÃO se coloca em outro estoque sem senha" "$OP" "permission denied|42501" -X PATCH "$R/usuarios?email=eq.$OPERADOR_EMAIL" -d '{"loja_atual":2}'
espera "Operador NÃO tira mercadoria de outro estoque pela API" "$OP" "Você está no estoque" -X POST $R/rpc/registrar_transferencia -d '{"p":{"origem_id":2,"destino_id":1,"itens":[{"produto_id":1,"quantidade":1}]}}'
espera "Operador NÃO lê o log de atividades (lista vazia)" "$OP" '^\[\] \[HTTP 200\]' "$R/vw_log?select=acao&limit=5"
fi
if [ -n "$RE" ]; then
RID=$(sub "$RE")
espera "Restrito NÃO registra entrada"                   "$RE" "Sem permissão"      -X POST $R/rpc/registrar_entrada -d '{"p":{"loja_id":1,"itens":[{"produto_id":1,"quantidade":1}]}}'
espera "Restrito NÃO registra saída"                     "$RE" "Sem permissão"      -X POST $R/rpc/registrar_saida -d '{"p":{"loja_id":1,"motivo":"venda","itens":[{"produto_id":1,"quantidade":1}]}}'
espera "Restrito NÃO transfere"                          "$RE" "Sem permissão"      -X POST $R/rpc/registrar_transferencia -d '{"p":{"origem_id":1,"destino_id":2,"itens":[{"produto_id":1,"quantidade":1}]}}'
espera "Restrito NÃO faz inventário"                     "$RE" "Sem permissão"      -X POST $R/rpc/registrar_ajuste -d '{"p":{"loja_id":1,"motivo":"x","itens":[{"produto_id":1,"quantidade_contada":0}]}}'
espera "Restrito (sem histórico) NÃO lê lançamentos de outros" "$RE" '^\[\] \[HTTP 200\]' "$R/movimentacoes?select=id&usuario_id=neq.$RID&limit=5"
fi
espera "Visitante sem login NÃO lê produtos"             ""    "permission denied|42501|401" "$R/produtos?select=id&limit=1"
espera "Visitante sem login NÃO chama funções"           ""    "permission denied|42501|401" -X POST $R/rpc/registrar_saida -d '{"p":{}}'
espera "Cadastro público pelo login é bloqueado"         ""    "Database error|bloqueado|HTTP 500|HTTP 422|not allowed|disabled" -X POST "$A/auth/v1/signup" -d '{"email":"intruso@x.com","password":"Senha@12345"}'
espera "Token falso é recusado"                          "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.falso" "JWT|invalid|401|PGRST" "$R/produtos?select=id&limit=1"
echo; echo "RESULTADO: $ok bloqueado(s) corretamente, $falhou falha(s)"
[ $falhou -eq 0 ]
