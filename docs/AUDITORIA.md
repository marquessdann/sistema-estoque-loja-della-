# Auditoria completa — DELLA Estoque

Data: 07/10/2026. Ambiente de teste: Supabase completo rodando localmente (PostgreSQL 17, login, armazenamento e tempo real) + sistema compilado em modo de produção + navegador Chromium automatizado.

Nada foi marcado como funcionando sem ter sido **executado**, conferido **no banco de dados** e, quando aplicável, testado com **dados inválidos**, **duplicidade**, **estorno** e **usuário sem permissão**.

> **Decisões do cliente durante a auditoria (aplicadas):**
> - transferência **sem aprovação**: quem tem permissão transfere e ela acontece na hora;
> - sem "em trânsito" e sem estoque reservado: só existem **DELLA ESTOQUE** e **DELLA FULL ML**;
> - **Log de atividades** só para o administrador, mostrando quem fez cada mudança;
> - ao logar, a pessoa **escolhe o estoque** e digita a **senha do estoque** (padrão `Galaxys2!`);
> - cada estoque tem seu painel, e mover mercadoria só acontece **a partir do estoque em que se está**, com confirmação reforçada;
> - usuários: **Daniel (ADM)**, **Vinicius (ADM)** e **Antonio (Operador)**.

## Atualização 3 (07/10/2026) — cargos, pedidos, kits e produtos reais

Pedidos aplicados nesta rodada (detalhe item por item em [`CHECKLIST.md`](CHECKLIST.md)):
- **Cargos fixos** no lugar das caixinhas de permissão (`04_cargos_e_baixa.sql`):
  - **Daniel = CEO** (tudo);
  - **Vinicius = Gerente** (autoriza, sem usuários, senhas dos estoques, lojas e configurações);
  - **Antonio = Funcionário** (baixa e transferência; vê só o que lançou).
- **Login por usuário:** `daniel`, `vinicius`, `antonio.gv`. Por dentro, cada um é `usuario@della.local`. Senha mínima de 6 caracteres.
- **Entrada:** nº do pedido, nº da NF que entrou, data e hora.
- **Saída = para as lojas.** Pedido com nº do pedido (obrigatório), NF, cliente, data e hora. No DELLA ESTOQUE, **"Qual plataforma?"** (Mercado Livre / TikTok Shop); no FULL, sempre Mercado Livre. **Transferência = entre estoques.**
- **Kits** e dados fiscais (NCM, CEST, origem, código do fornecedor) (`05_kits_e_fiscal.sql`).
- **Produtos reais** da DELLA (`06_produtos_della.sql`):
  - 49 produtos e 4 kits;
  - histórico das notas 16.653 e 46.780 e dos pedidos 3108 e 3136, com as vendas do ML;
  - **saldos idênticos à planilha** (2.460 unidades).
- **Celular:** 16 telas sem rolagem lateral em 375px e botões de pelo menos 40px.

Problemas encontrados e corrigidos nesta rodada:
- **Data e hora:** a hora digitada era lida no fuso do servidor. Agora vai com o fuso do aparelho.
- **Painel no celular:** o valor do estoque passava da borda do cartão.
- **Custo do kit:** aparecia R$ 0,00; agora é a soma dos componentes.
- **Botões pequenos para o toque:** menu, "Trocar de estoque", Renomear/Excluir e os títulos que abrem e fecham.
- **Prévia no celular:**
  - a tela de login ficava mais larga que o celular;
  - o topo fixo ocupava metade da tela.
- **Log:** mostrava "venda" cru; agora mostra plataforma, pedido, cliente e NF.

Resultados depois da última mudança, num banco limpo:
- **139/139** regras do banco;
- **44/44** ataques à API bloqueados (funcionário e gerente);
- **20/20** cenários no navegador, com os usuários e senhas reais;
- **21/21** verificações com os produtos reais no celular.

---

## A. Resumo

**Analisado:**
- produtos;
- estoque por loja;
- entradas (manual e XML de NF-e) e saídas;
- transferências e inventário;
- histórico e auditoria;
- relatórios;
- usuários e permissões;
- segurança da API;
- concorrência e integridade;
- interface (computador e celular).

**Já funcionava na versão 1:**
- livro-razão;
- saldo nunca negativo;
- transferência "tudo ou nada";
- validação de NF-e, chave e CNPJ;
- bloqueio de nota duplicada;
- estorno;
- limite de 3 usuários;
- tempo real;
- relatórios Excel/PDF.

**Problemas encontrados:** 22, listados na seção D. Os mais graves:
1. O operador burlava permissões pela API: cadastrava e inativava produtos, criava categorias e estornava.
2. O cadastro público de login dependia só de uma opção do painel do Supabase.
3. Era possível gravar o mesmo lançamento duas vezes (reenvio pela API).
4. Era possível estornar só "metade" de uma transferência.
5. **Bug:** o formulário do produto era apagado quando outro usuário lançava estoque.
6. **Risco:** o inventário podia apagar uma venda feita durante a contagem.

**Corrigido:** todos os itens da seção D, exceto as pendências da seção H. Depois das correções, todas as baterias rodaram de novo, do zero, num banco limpo:
- **99/99** testes do banco;
- **17/17** testes de ponta a ponta no navegador;
- **33 + 9** ataques diretos à API bloqueados;
- **concorrência** aprovada.

---

## B. Checklist completo

Legenda: ✅ Funcionando · 🔒 Bloqueado corretamente · ⚠️ Pendente/melhoria · ❌ Com erro · 🧪 Testado

### 1. Acesso e estoque atual

| Funcionalidade | Status | Teste realizado | Resultado | Problema / correção |
|---|---|---|---|---|
| Login com e-mail e senha | ✅🧪 | Navegador | OK | — |
| Escolher o estoque ao entrar | ✅🧪 | Daniel e Antonio | Tela "Em qual estoque você vai trabalhar?" | Novo |
| Senha do estoque (padrão `Galaxys2!`) | ✅🔒🧪 | Senha errada e certa | Errada recusada e registrada no log; certa entra | Novo; senha guardada só como "hash" (ninguém lê) |
| Trocar de estoque | ✅🧪 | Botão no topo | Pede a senha do outro estoque | Novo |
| Admin troca a senha do estoque | ✅🔒🧪 | Configurações; operador tenta pela API | Antiga deixa de valer; operador bloqueado | Novo |
| Faixa colorida do estoque atual | ✅🧪 | Todas as telas | Sempre visível | Novo |
| Lançar em outro estoque | 🔒🧪 | Tela e API | "Você está no estoque X. Para … troque de estoque" | Regra no banco |
| Sem escolher estoque | 🔒🧪 | API | "Escolha em qual estoque você vai trabalhar" | Regra no banco |
| Cadastro público de login | 🔒🧪 | Signup direto | Bloqueado (só com convite do admin) | Era um risco; corrigido |
| Limite de 3 usuários | 🔒🧪 | Criar o 4º | Bloqueado | — |

### 2. Produtos

| Funcionalidade | Status | Teste | Resultado | Problema / correção |
|---|---|---|---|---|
| Cadastro (só nome obrigatório), SKU automático | ✅🧪 | Banco e tela | `DELLA-00001` | — |
| SKU / EAN inválidos ou duplicados | 🔒🧪 | 6 casos | Bloqueados com mensagem | Faltava validar dígito do EAN e formato do SKU |
| Nome repetido / venda abaixo do custo | ✅🧪 | Tela | Aviso (não bloqueia) | Novo |
| Preço e mínimo negativos | 🔒🧪 | Banco | Bloqueados | Aceitava pela API |
| Edição | ✅🧪 | Tela | OK | **Bug corrigido:** formulário era apagado quando outro usuário lançava estoque |
| Inativar | ✅🔒🧪 | Admin; operador pela API | Só admin | Operador inativava pela API |
| Excluir | ✅🔒🧪 | Com e sem histórico | Só sem histórico | Não existia |
| Duplicar, foto | ✅ | Tela | OK | — |
| Busca (nome, SKU, EAN, sem acento) | ✅🧪 | "pinca reta" | OK | — |
| Filtros, ordenação, paginação | ✅🧪 | Tela | OK | Ordenação, paginação e filtro "sem estoque" eram novos |
| Lista nos formulários: só nome + SKU | ✅🧪 | Tela | Sem quantidades misturadas | Pedido do cliente |
| Histórico de alterações do cadastro (admin) | ✅🧪 | Editar produto | Mostra quem mudou o quê | Novo |
| Importar/exportar planilha | ✅🔒🧪 | Exportar; importar sem permissão | Importar exige permissão | Operador importava pela API |
| Variações (pai/filho) | ⚠️ | — | Cada variação é um SKU | Ver Pendências |

### 3. Entrada

| Funcionalidade | Status | Teste | Resultado |
|---|---|---|---|
| Teste 1: 10 + entrada 5 | ✅🧪 | Banco | **15** |
| Entrada por XML da NF-e | ✅🧪 | XML de teste | Preencheu nota e itens; item novo cadastrado |
| Entra sempre no estoque atual | ✅🔒🧪 | Tela sem seletor de loja; API em outra loja | Bloqueado fora do estoque atual |
| Nota duplicada, chave e CNPJ inválidos | 🔒🧪 | 3 casos | Bloqueados |
| Data da entrada (não futura) | ✅🔒🧪 | Data futura | Bloqueada (campo novo) |
| Custo médio | ✅🧪 | (19×12 + 5×14) / 24 | **12,4167** |
| Clique duplo / reenvio | 🔒🧪 | Mesmo formulário 2× | Grava uma vez (novo) |
| Quantidade 0, negativa, fracionada, texto; custo negativo | 🔒🧪 | 5 casos | Bloqueados |
| Estorno (cancelar entrada) | ✅🧪 | Banco | Saldo volta; original marcado |

### 4. Saída

| Funcionalidade | Status | Teste | Resultado |
|---|---|---|---|
| Teste 2: 15 − saída 3 | ✅🧪 | Banco | **12** |
| Teste 4: retirar 999 | 🔒🧪 | Banco e tela | Bloqueado: "Estoque insuficiente … disponível X, solicitado 999"; saldo intacto |
| Motivos (venda, perda, avaria, uso interno, devolução ao fornecedor, outro) | ✅🧪 | — | "Outro" exige observação; motivo inválido bloqueado |
| Teste 5: estorno | ✅🧪 | Banco | 12 → **15**, estorno registrado |
| Estornar 2×, estornar estorno, sem motivo | 🔒🧪 | 3 casos | Bloqueados |
| Estorno só no estoque do lançamento | 🔒🧪 | Banco | Bloqueado fora dele |
| Concorrência | 🔒🧪 | 2 sessões tirando 20 de 25 | Uma passa, outra bloqueada; saldo 5 |

### 5. Transferência (imediata)

| Funcionalidade | Status | Teste | Resultado |
|---|---|---|---|
| Teste 3: A=20, transferir 5 | ✅🧪 | Banco | A = **15**, B = anterior **+5** |
| Só sai do estoque em que está | ✅🔒🧪 | Daniel ESTOQUE→FULL; Antonio FULL→ESTOQUE; API tentando tirar do outro | OK; tentativa bloqueada |
| Confirmação reforçada | ✅🧪 | Navegador | "Você tem certeza que deseja mover N unidades de X para Y?" + caixa obrigatória "Conferi" |
| Vários produtos, tudo ou nada | ✅🔒🧪 | Um item sem saldo | Nenhum item gravado |
| Quantidade maior que o estoque | 🔒🧪 | 999 | Bloqueado, sem registro |
| Duplicada (mesmo formulário 2×) | 🔒🧪 | Banco | Uma só |
| Produto inexistente/inativo, loja inexistente, mesma loja | 🔒🧪 | 4 casos | Bloqueados |
| Estorno | ✅🔒🧪 | Banco e tela | Volta tudo; só no estoque de destino; 2ª vez bloqueada |
| Estornar só metade | 🔒🧪 | Banco | Bloqueado |
| Histórico de transferências | ✅🧪 | Tela | Quem fez, quando, "saiu daqui / entrou aqui" |

### 6. Estoque por loja, histórico e log

| Funcionalidade | Status | Observação |
|---|---|---|
| Estoque por loja, total, mínimo | ✅🧪 | Produtos, ficha, relatórios |
| Painel do estoque atual | ✅🧪 | Estoque atual primeiro e destacado |
| Sugestões | ✅🧪 | "Enviar daqui" só quando a sobra está no estoque atual |
| Movimentações só do estoque atual | ✅🧪 | Antonio no FULL não vê entradas do ESTOQUE |
| Histórico: produto, tipo, quantidade, loja, usuário, data/hora, data do fato, motivo, origem/destino, observação, nota | ✅🧪 | — |
| Saldo antes → saldo depois | ✅🧪 | Novo |
| Log de atividades (só ADM) | ✅🔒🧪 | Novo. Mostra quem fez entradas, saídas, transferências, ajustes, estornos, cadastros, logins, entradas nos estoques e senha errada. Filtra por usuário, tipo e período; exporta Excel. Operador recebe lista vazia até pela API. |
| Ninguém apaga/altera histórico ou saldo | 🔒🧪 | Tela, API e funções internas |
| Integridade final | ✅🧪 | Saldo = soma do livro-razão; nada negativo; só 2 lojas |

### 7. Interface

| Item | Status | Observação |
|---|---|---|
| Menu por permissão; telas 🔒 por URL direta | ✅🧪 | — |
| Botões − e + na quantidade | ✅🧪 | Substituem as setinhas do navegador (pedido do cliente) |
| Logo maior e centralizada no topo (celular) | ✅ | Pedido do cliente |
| Confirmações, mensagens claras, carregando | ✅🧪 | — |
| Celular | ✅🧪 | Antonio testado em tela de celular |

---

## C. Matriz de permissões (cargos, versão atual)

| Funcionalidade | CEO (Daniel) | Gerente (Vinicius) | Funcionário (Antonio) |
|---|---|---|---|
| Entrar num estoque (com a senha do estoque) | SIM | SIM | SIM |
| Ver produtos e estoque das duas lojas | SIM | SIM | SIM |
| Dar baixa (saída / pedidos) no estoque em que está | SIM | SIM | SIM |
| Transferir entre estoques (só a partir do estoque em que está) | SIM | SIM | SIM |
| Entrada, inventário | SIM | SIM | NÃO |
| Cadastrar / editar produtos e kits, categorias, importar, inativar | SIM | SIM | NÃO (só consulta) |
| Estornar (autorizar correções) | SIM | SIM | NÃO |
| Ver lançamentos de todos, relatórios | SIM | SIM | NÃO (vê só os dele) |
| **Log de atividades** | SIM | SIM | NÃO |
| Usuários, lojas, senhas dos estoques, configurações, excluir produto, excluir categoria | SIM | NÃO | NÃO |
| Apagar ou alterar histórico, alterar saldo direto | NÃO (ninguém) | NÃO (ninguém) | NÃO (ninguém) |

**Onde cada regra é conferida:**
1. **Na tela:** menus, botões e mensagem 🔒.
2. **No banco de dados**, em toda função de gravação: permissão, estoque atual e regras de linha.
3. **No servidor:** a API de usuários exige o CEO.

A tela é só conveniência: a proteção real está nos itens 2 e 3.

---

## D. Problemas encontrados

1. 🔒 Operador cadastrava e editava produtos pela API.
2. 🔒 Operador inativava produtos pela API.
3. 🔒 Operador criava categorias e marcas e importava produtos sem restrição.
4. 🔒 Operador estornava qualquer lançamento.
5. 🔒 Não havia permissões por operador.
6. 🔒 O cadastro público dependia só de uma opção do painel do Supabase.
7. 🔒 Tabelas novas recebiam permissão de gravação por padrão do Supabase (faltava a segunda camada de proteção).
8. Lançamento duplicado pela API (reenvio do mesmo formulário).
9. Estorno de só uma "perna" da transferência.
10. **Bug:** o formulário do produto era apagado quando outro usuário lançava estoque.
11. **Risco:** o inventário podia apagar uma venda feita durante a contagem.
12. Sem data do fato em entrada/saída.
13. Sem "saldo antes" no histórico.
14. Não dava para excluir produto cadastrado por engano.
15. Não dava para criar/desativar lojas.
16. Lista de produtos sem ordenação, paginação e filtro "sem estoque".
17. Validações faltando: dígito do EAN, formato do SKU, mínimo negativo, custo negativo, motivo inválido, "Outro" sem descrição.
18. Não havia log centralizado de quem fez cada mudança.
19. Qualquer usuário podia lançar em qualquer loja: não havia separação por estoque.
20. **Criação de usuário pelo administrador:** a primeira versão da trava de cadastro público barrava também o administrador. O serviço de login grava os metadados depois. Foi trocada por tabela de convites.
21. A criação de usuário mostrava "limite de 3 atingido" quando o erro era outro.
22. **Log com ruído:** entrar num estoque gerava um "alterou usuário" desnecessário, e havia linhas duplicadas de "Sistema".

## E. Correções realizadas

**Banco** (`supabase/03_versao2_permissoes_transferencias.sql`, roda sobre a versão 1 sem perder dados):
- **Permissões e cadastro:**
  - permissões por operador conferidas em toda gravação;
  - convite obrigatório para criar login.
- **Estoque atual:**
  - senha por estoque (padrão `Galaxys2!`, guardada como hash);
  - `entrar_loja`, `sair_loja` e `definir_senha_loja`;
  - regra `fn_exigir_loja_atual` em entrada, saída, inventário, transferência e estorno.
- **Transferências:**
  - imediatas: `registrar_transferencia`, com histórico em `transferencias` e `transferencia_itens`;
  - `estornar_transferencia`, feito no estoque de destino.
- **Log de atividades:** visão `vw_log`, que só devolve linhas para administradores.
- **Proteção e validações:**
  - anti-duplicidade por chave de formulário;
  - data do fato;
  - aviso se o saldo mudar durante o inventário;
  - validações de EAN, SKU, preços, mínimos e motivos.
- **Produtos e lojas:** excluir produto sem histórico; criar e desativar lojas.
- **Histórico:** saldo antes e depois nas visões.
- **Segurança:** gravação direta revogada nas tabelas novas; senha do estoque ilegível pelo aplicativo.

**Telas:**
- **Acesso:** escolha do estoque com senha; faixa do estoque atual; "Trocar de estoque".
- **Lançamentos:**
  - entrada, saída e inventário presos ao estoque atual;
  - transferência só a partir do estoque atual, com confirmação reforçada;
  - botões − e + nas quantidades.
- **Consultas:**
  - painel, movimentações e transferências do estoque atual;
  - produtos com ordenação, paginação, filtros, modo consulta, histórico de alterações e excluir;
  - busca de produto só com nome + SKU.
- **Administração:** Log de atividades (ADM); usuários com caixas de permissão; configurações com lojas e senha de cada estoque.

**Servidor:** a API de usuários grava o convite, as permissões (lista fechada) e o registro de quem fez.

## F. Testes realizados

| Bateria | Arquivo | Resultado |
|---|---|---|
| Regras do banco (estoque atual, senha, cargos, pedidos, plataforma, kits, NCM/CEST, transferência, validações, log, integridade) | `testes/banco.sql` | **139 / 139** ✅ |
| Ataques diretos à API, como funcionário (Antonio) | `testes/api_permissoes.sh` | **36 / 36 bloqueados** 🔒 |
| Ataques diretos à API, como gerente (Vinicius) | `testes/api_permissoes.sh` | **8 / 8 bloqueados** 🔒 |
| Ponta a ponta no navegador (Daniel e Vinicius no computador, Antonio no celular), com os usuários e senhas reais, conferindo o banco a cada passo | 20 cenários | **20 / 20** ✅ |
| Produtos reais no celular (16 telas sem rolagem lateral, botões grandes, kit, NCM, baixa de kit) | 21 verificações | **21 / 21** ✅ |
| Carga dos produtos reais (saldos × planilha, rodar 2 vezes sem duplicar) | `06_produtos_della.sql` | **49 / 49 iguais**, sem duplicar ✅ |
| Concorrência: duas saídas simultâneas do mesmo estoque | 2 sessões | Uma bloqueada, saldo correto ✅ |
| Atualização v1 → v2 com dados existentes | Banco local | Sem perda ✅ |

Os testes pedidos, com resultado conferido no banco:
- **Teste 1:** 10 + 5 = **15** ✅
- **Teste 2:** 15 − 3 = **12** ✅
- **Teste 3:** A 20 → transferir 5 → A = **15**, B = anterior **+5** ✅
- **Teste 4:** retirar 999 → **bloqueado**, saldo intacto ✅
- **Teste 5:** estorno → saldo **volta** e o histórico registra ✅

## G. Preview funcional

Link: https://claude.ai/artifact/QcEjAqXACbnCChpZeNXwEc

Roda **o mesmo banco de dados do sistema** (arquivos 01, 03, 04, 05 e 06, com as mesmas funções e regras e os **produtos reais**) num PostgreSQL dentro do navegador. Funciona no celular. Dá para:
- entrar como **Daniel (CEO)**, **Vinicius (Gerente)** ou **Antonio (Funcionário)** (na prévia, basta tocar no cartão; no sistema real, entra com usuário e senha);
- dar baixa de pedido com plataforma, pedido, NF, cliente, data e hora (inclusive de kits);
- escolher o estoque com a senha `Galaxys2!`;
- consultar e cadastrar produtos;
- fazer entrada, saída e transferência, com a confirmação "Conferi";
- estornar;
- ver as movimentações do estoque e o Log de atividades (ADM);
- rodar o **"Teste de ataque"**, que tenta burlar o banco como o usuário atual.

As telas do preview são simplificadas. As telas completas são as do sistema Next.js, publicado na Vercel conforme `docs/HOSPEDAGEM.md`.

## H. Pendências

1. **Variações de produto (pai/filho):** não implementado; cada variação é um SKU (como no Mercado Livre Full). Se quiser o agrupamento, implemento.
1. **TikTok dentro do DELLA ESTOQUE:** feito como plataforma do pedido (um saldo só). Se quiser saldos separados para o TikTok, implemento.
1. **Dados a conferir** na carga dos produtos reais: estão listados em [`CHECKLIST.md`](CHECKLIST.md), seção 7.
1. **"Esqueci minha senha" por e-mail** não vale para quem entra por usuário (sem e-mail): o CEO coloca uma senha nova em Usuários.
2. **Não testado aqui** (precisa de serviços externos reais):
   - e-mail de "Esqueci minha senha";
   - backup no GitHub Actions;
   - publicação real na Vercel e no Supabase da nuvem.

   Estão em `docs/TESTES.md`.
3. **Custo médio no estorno** de uma entrada antiga é recalculado de forma aproximada. O saldo é sempre exato.
4. **Um estoque por vez por usuário:** a escolha fica guardada no usuário. Se a mesma pessoa abrir o sistema em dois aparelhos e escolher estoques diferentes, vale o último escolhido. A faixa colorida sempre mostra qual é.
5. **Hospedagem a partir daqui:** o sistema completo não pôde ser hospedado a partir deste ambiente, porque o acesso externo está bloqueado. Por isso, o preview roda o banco real no navegador.
