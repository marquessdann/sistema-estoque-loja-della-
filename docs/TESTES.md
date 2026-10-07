# Testes para confirmar que tudo funciona

Faça estes testes depois de publicar. Marque cada um ✅.

> Já testei todos os itens marcados com 🤖 automaticamente, num Supabase local com um navegador de verdade, antes da entrega. Mesmo assim, vale repetir no seu ambiente.

## Acesso e segurança
- [ ] 🤖 Abrir o endereço do sistema sem estar logado leva para a tela de **login** com a logo DELLA.
- [ ] 🤖 Entrar com o **usuário** `daniel` (sem e-mail) e a senha dele abre a escolha do estoque.
- [ ] 🤖 Usuário ou senha errados mostram **"Usuário ou senha incorretos."**
- [ ] O ícone da aba do navegador (favicon) é a logo DELLA.
- [ ] **Esqueci minha senha:** chega um e-mail, o link abre "Criar nova senha" e a nova senha funciona.
- [ ] Na tela de login do Supabase não é possível se cadastrar sozinho (cadastro público desligado, passo 1.2).

## Usuários e cargos (limite de 3)
- [ ] 🤖 Em **Usuários**, criar `vinicius` (Gerente) e `antonio.gv` (Funcionário). Não há caixinhas de permissão. Aparece "3 de 3 usuários ativos".
- [ ] 🤖 Tentar criar o 4º: aparece **"Limite de 3 usuários atingido"**.
- [ ] Desativar um usuário: ele não consegue mais entrar. Depois disso já é possível criar outro.
- [ ] 🤖 Entrar como **antonio.gv**: o menu tem Saída e Transferir, mas **não** tem Entrada, Inventário, Log, Usuários nem Configurações. Digitando o endereço, aparece 🔒.
- [ ] 🤖 Entrar como **vinicius**: tem Log de atividades e estorna, mas **não** tem Usuários nem Configurações.
- [ ] O cargo do CEO não pode ser trocado.

## Produtos
- [ ] 🤖 Cadastrar um produto só com o nome: o SKU é gerado (`DELLA-00001`).
- [ ] Cadastrar outro com o **mesmo SKU** ou **mesmo EAN**: aparece aviso de duplicado.
- [ ] 🤖 Busca instantânea por **nome** (sem acento também: "pinca"), por **SKU** e por **código de barras**.
- [ ] Adicionar foto, salvar e ver a foto na lista.
- [ ] **Duplicar** um produto: abre o formulário preenchido com "(cópia)".
- [ ] **Inativar**: some da busca de lançamentos. **Reativar** volta.
- [ ] **Exportar** produtos em Excel e CSV e abrir no Excel (acentos corretos).
- [ ] **Importar** a planilha modelo preenchida com 2 produtos: a prévia mostra "Novo" e os produtos aparecem.
- [ ] Importar uma planilha com uma linha **sem nome**: a prévia acusa erro e nada é gravado.

## Entrada com nota fiscal
- [ ] 🤖 **Importar XML** de uma NF-e real: número, chave, fornecedor e itens são preenchidos. Os itens não encontrados permitem vincular ou cadastrar.
- [ ] 🤖 Registrar a entrada: o saldo da loja escolhida aumenta e o custo médio é recalculado.
- [ ] 🤖 Lançar **a mesma nota de novo**: aparece **"Esta nota fiscal já foi lançada"**.
- [ ] Digitar uma chave com um dígito errado: aparece **"Chave inválida"**.
- [ ] Digitar um CNPJ errado: aparece **"CNPJ inválido"**.
- [ ] Anexar um PDF e depois abrir o anexo em **Notas fiscais**.
- [ ] 🤖 Em **Movimentações**, buscar pelo **número da nota**: o lançamento aparece.

## Transferência entre lojas
- [ ] 🤖 Na tela de um produto, clicar em **Transferir**: abre com a origem sugerida e a faixa "SAI DE ... → ENTRA EM ...".
- [ ] 🤖 Transferir 5 unidades de DELLA ESTOQUE para DELLA FULL ML: −5 numa loja e +5 na outra.
- [ ] 🤖 Pedir mais do que o saldo: aparece **"Só há X disponível"** e o botão fica bloqueado.
- [ ] Transferência com **vários produtos** de uma vez.
- [ ] Botão **Inverter** troca origem e destino.
- [ ] 🤖 **Histórico de transferências** mostra quem fez e quando. Tocar abre os detalhes.
- [ ] Painel: produto abaixo do mínimo no FULL com sobra no ESTOQUE mostra **"Sugestão: transferir X"**, e o botão abre a transferência preenchida.

## Saída (pedidos), inventário e estorno
- [ ] 🤖 No **DELLA ESTOQUE**, a saída de pedido pergunta **"Qual plataforma?"** (Mercado Livre / TikTok Shop). Sem plataforma ou sem nº do pedido, não grava.
- [ ] 🤖 No **DELLA FULL ML**, a plataforma é sempre Mercado Livre.
- [ ] 🤖 A baixa grava nº do pedido, NF, cliente, data e hora, e aparece em Movimentações e no Log.
- [ ] 🤖 Baixa de **1 kit** tira 1 de cada pinça do kit.
- [ ] 🤖 Entrada grava nº do pedido, nº da NF e data e hora.
- [ ] Saída maior que o saldo: bloqueada.
- [ ] 🤖 Inventário: contar um produto com diferença, informar o motivo e confirmar. O saldo fica igual ao contado.
- [ ] Inventário onde tudo bate: aparece "nenhuma diferença, nada foi alterado".
- [ ] Imprimir a **folha de contagem** em PDF.
- [ ] 🤖 **Estornar** uma saída: o saldo volta e o original fica marcado "estornada".
- [ ] Tentar estornar de novo: aparece **"Este lançamento já foi estornado"**.

## Tempo real e celular
- [ ] 🤖 Abrir o sistema em **dois aparelhos** (ou duas abas). Fazer uma transferência em um: o saldo muda **sozinho** no outro em 1 ou 2 segundos.
- [ ] 🤖 No **celular**: a barra inferior tem Painel, Produtos, Transferir, Entrada e Mais. Os botões são grandes e a leitura é boa.

## Relatórios, backup e auditoria
- [ ] 🤖 **Relatórios > Movimentações**: filtrar por período e loja e exportar **Excel** e **PDF** (o PDF tem a logo).
- [ ] **Posição de estoque** e **Estoque baixo**: conferir os totais e exportar.
- [ ] 🤖 **Configurações > Exportar tudo**: baixa um Excel com todas as tabelas.
- [ ] 🤖 **Configurações > Auditoria** mostra logins, cadastros e alterações com o nome de quem fez.
- [ ] **GitHub > Actions > Backup diário do banco > Run workflow** termina com ✅ e gera o arquivo em Artifacts.
- [ ] Mudar a cor de uma loja em **Configurações**: as etiquetas mudam em todas as telas.

## Estoque com senha, transferência e log
- [ ] 🤖 Depois do login aparece "Em qual estoque você vai trabalhar?". Senha errada é recusada; `Galaxys2!` entra.
- [ ] 🤖 A faixa colorida no topo mostra o estoque atual; "Trocar de estoque" pede a senha do outro.
- [ ] 🤖 Entrada, saída e inventário acontecem no estoque atual (não há escolha de loja na tela).
- [ ] 🤖 Transferir: a origem é sempre o estoque atual; o botão "Sim, mover agora" só libera depois de marcar "Conferi".
- [ ] 🤖 No FULL, o histórico mostra só movimentações do FULL.
- [ ] 🤖 Estorno de transferência só aparece no estoque de destino.
- [ ] 🤖 Log de atividades (CEO e gerente) mostra quem fez cada coisa, com o cargo, e filtra por usuário; o funcionário não vê o menu nem acessa pelo endereço.
- [ ] 🤖 O CEO troca a senha de um estoque em Configurações: a antiga deixa de funcionar.

## Produtos reais (arquivo 06)
- [ ] 🤖 Depois de rodar o `06_produtos_della.sql`: 49 produtos + 4 kits, e os saldos do DELLA ESTOQUE batem com a planilha (total de 2.460 unidades).
- [ ] 🤖 A Navalha Aço Inox Standard mostra 44; o Kit 3 Pinças Caneladas mostra 119 kits possíveis.
- [ ] 🤖 A tela do produto mostra NCM, CEST e código do fornecedor.

## Celular
- [ ] 🤖 Nenhuma tela precisa arrastar para o lado (16 telas conferidas em 375px de largura).
- [ ] 🤖 Os botões têm pelo menos 40px de altura.

## Testes automáticos (para técnicos)
- `testes/banco.sql`: 139 testes das regras do banco (rode num banco de TESTE com 01+03+04+05+02; tudo é desfeito no fim).
- `testes/api_permissoes.sh`: 44 tentativas de burlar a API como funcionário e como gerente (devem ser todas bloqueadas).
- Detalhes e resultados: [`docs/AUDITORIA.md`](AUDITORIA.md).

## Teste de "atomicidade" (avançado, opcional)
No Supabase, **SQL Editor**, rode:
```sql
select produto_id, loja_id, saldo from produto_loja where saldo < 0;
```
O resultado deve ser **vazio**: o banco não permite saldo negativo.
