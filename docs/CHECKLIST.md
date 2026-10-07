# Checklist de tudo o que foi pedido — DELLA Estoque

Atualizado em 07/10/2026. Legenda:
- ✅ feito e testado;
- ⚠️ feito com uma observação;
- ⏳ depende de você (contas e serviços externos).

Os testes automáticos rodaram do zero num banco limpo, depois da última mudança:
- **139/139** regras do banco;
- **44/44** ataques à API bloqueados;
- **20/20** cenários no navegador (computador e celular);
- **21/21** verificações com os produtos reais no celular;
- prévia funcional testada no celular.

## 1. Base do sistema (pedido inicial)

| # | Pedido | Situação |
|---|---|---|
| 1 | Sistema web de estoque da DELLA com 2 estoques: **DELLA ESTOQUE** (azul) e **DELLA FULL ML** (dourado) | ✅ |
| 2 | Next.js + TypeScript + Tailwind, Supabase (banco, login, arquivos, tempo real), Vercel, backup no GitHub | ✅ |
| 3 | Tudo em português, explicado para quem não é programador | ✅ |
| 4 | Cadastro de produtos (SKU, código de barras, categoria, marca, foto, custo, venda, mínimo por loja) | ✅ |
| 5 | Unidade, kit etc. ("todos são por unidade, kit") | ✅ UN/KIT/CX… e **kits de verdade** (item 7.4) |
| 6 | Custo médio ponderado | ✅ |
| 7 | Entrada com nota fiscal, inclusive pelo XML da NF-e; nota duplicada bloqueada; chave e CNPJ validados | ✅ |
| 8 | Saída, transferência, inventário, estorno; histórico que nunca é apagado | ✅ |
| 9 | Até 3 usuários, cadastro só pelo responsável | ✅ |
| 10 | Painel, relatórios em Excel e PDF, tempo real | ✅ |
| 11 | Marca DELLA (logo, cores, favicon) | ✅ |
| 12 | Sem integração: tudo lançado à mão (preparado para integrar depois) | ✅ |
| 13 | Dados de exemplo, guia de hospedagem, manual e lista de testes | ✅ `docs/` |

## 2. Auditoria (seções 1 a 17 do pedido)

| # | Pedido | Situação |
|---|---|---|
| 14 | Analisar, testar, corrigir e testar de novo tudo | ✅ `docs/AUDITORIA.md` |
| 15 | Matriz de permissões, checklist, problemas, correções, testes, preview funcional e pendências | ✅ `docs/AUDITORIA.md` |
| 16 | Permissões garantidas no servidor/banco, não só na tela | ✅ 44 ataques bloqueados |
| 17 | Testes de estoque 1 a 5 (10+5=15, 15−3=12, transferência 20→15/+5, 999 bloqueado, estorno) | ✅ |

## 3. Transferências e lojas

| # | Pedido | Situação |
|---|---|---|
| 18 | Tirar "aguardando aprovação", "envio" e "em trânsito" | ✅ |
| 19 | Transferência sem aprovação: o usuário solicita e vai na hora | ✅ |
| 20 | Tirar a loja "EM TRÂNSITO": só DELLA ESTOQUE e DELLA FULL ML | ✅ |
| 21 | Na escolha do produto, só **nome + SKU** (sem as quantidades das lojas) | ✅ |
| 22 | Setas de contagem personalizadas e bonitas (botões − e +) | ✅ |
| 23 | Histórico mostra só a movimentação do estoque em que se está | ✅ |
| 24 | Mover do FULL para o DELLA ESTOQUE só dentro do painel do FULL (e vice-versa) | ✅ o banco recusa o contrário |
| 25 | Avisos "Você tem certeza que deseja mover … para …?" | ✅ com a caixa "Conferi" obrigatória |
| 26 | **Transferência = entre estoques; Saída = para as lojas** | ✅ a Saída tem um aviso que leva à Transferência |

## 4. Acesso, estoques e visual

| # | Pedido | Situação |
|---|---|---|
| 27 | Ao logar, escolher em qual estoque entrar | ✅ |
| 28 | Senha de cada estoque, padrão `Galaxys2!` (o CEO troca em Configurações) | ✅ guardada como código, ninguém lê |
| 29 | Cada configuração dentro de cada loja, "bem regrado" | ✅ entrada, saída, inventário e transferência só no estoque atual |
| 30 | Logo DELLA no meio do topo e maior | ✅ |
| 31 | **Bem acessível por celular** | ✅ sem rolagem para o lado em nenhuma tela, botões de 40px ou mais, barra inferior com Saída e Transferir |

## 5. Usuários e cargos

| # | Pedido | Situação |
|---|---|---|
| 32 | Log de atividades só para quem administra, mostrando qual usuário fez cada mudança | ✅ CEO e gerente |
| 33 | **Daniel = CEO**, tem tudo | ✅ usuários, senhas dos estoques, lojas, configurações, excluir produto |
| 34 | **Vinicius = Gerente**: pode autorizar, mas sem permissões de criador | ✅ estorna, cadastra, entrada, inventário, log; **não** mexe em usuários, senhas, lojas e configurações |
| 35 | **Antonio = Funcionário** "que não tem nada": só trocar de estoque, transferir e dar baixa, sem cadastro de produto | ✅ e vê só os lançamentos dele |
| 36 | Tirar o campo de permissões (caixinhas) | ✅ agora é só escolher o cargo |
| 36b | **Login por usuário:** `daniel`, `vinicius`, `antonio.gv`, com as senhas que você escolheu | ✅ testado com essas senhas; a senha mínima passou a ser 6 (por causa do Vinicius). As senhas **não** ficam no GitHub: você as digita ao criar cada usuário (passo a passo em `HOSPEDAGEM.md`) |

## 6. Entrada e saída

| # | Pedido | Situação |
|---|---|---|
| 37 | Os três podem dar baixa no FULL (ex.: "SAÍDA PINÇA") | ✅ |
| 38 | Baixa com **nº do pedido, nº da NF e dia** | ✅ e também **hora** e **nome do cliente** |
| 39 | **Entrada**: nº do pedido, nº da NF que entrou, **data e hora** | ✅ (o nº da NF vem sozinho ao importar o XML) |
| 40 | **Saída "Pedido"** (nº do pedido, NF, cliente), no FULL ou no DELLA ESTOQUE | ✅ nº do pedido obrigatório |
| 41 | No DELLA ESTOQUE, campo **"Qual plataforma?" Mercado Livre / TikTok Shop** | ✅ obrigatório no DELLA ESTOQUE; no FULL é sempre Mercado Livre |
| 42 | DELLA ESTOQUE atende o próprio estoque **e o TikTok** | ⚠️ feito como **campo de plataforma** no pedido (o saldo continua um só; o relatório filtra por plataforma). Se quiser **saldos separados** para o TikTok, me avise |
| 43 | Outras saídas (perda, avaria, uso interno) | ✅ na aba "Outra saída" |

## 7. Produtos reais (planilhas + notas fiscais)

| # | Pedido | Situação |
|---|---|---|
| 44 | Cadastrar os produtos da planilha pelos **SKUs** | ✅ **49 produtos** (`supabase/06_produtos_della.sql`) |
| 45 | Quantidade, fornecedor e datas de entrada e saída | ✅ 8 lançamentos com as datas reais, sem repetir planilha e nota; **os 49 saldos batem com a planilha (2.460 unidades)** |
| 46 | Custo, NCM, CEST (Tabela Fiscal) | ✅ custo de todos; NCM/CEST/origem de 29 produtos |
| 47 | Kits da planilha (Kit 3 Pinças…) | ✅ **4 kits**: a baixa de 1 kit tira cada pinça do estoque; mostra "quantos kits dá para montar" |
| 48 | NF 16.653 (Itapema), NF 46.780 (Vermonth), Pedido 3136 (Elementar) | ✅ com chave de acesso conferida, lotes/validades na observação, custos com desconto |

**Para você conferir** (dados que faltaram ou divergiram nos arquivos):
- ⚠️ **Linha Hidra (20 produtos):** a Tabela Fiscal não tem NCM/CEST deles. O custo veio do Pedido 3136. Falta a NF do pedido 3136.
- ⚠️ **Enaldinho (pedido 3108):** a planilha diz "Pedido 3108 / Elementar"; a Tabela Fiscal diz "NF Novara 3.680". Lancei pedido 3108 + NF 3.680 (Novara). Se o certo for outro, é só me dizer.
- ⚠️ **Preço de venda:** não estava nas planilhas (ficou R$ 0,00). Preencha na tela do produto ou pela planilha de importação.
- ⚠️ **Duas vendas da planilha sem número do pedido** (30/09 e 02/10): lançadas como "não informado".
- ⚠️ **Cola Emerald:** a NF não traz lote/validade (conferir na embalagem).
- ⚠️ **Pinças e navalha:** não têm código de barras (EAN) nas notas. Ficou o código do fornecedor (ex.: 2311.303), que também serve na busca.

## 8. Entrega

| # | Pedido | Situação |
|---|---|---|
| 49 | Código no GitHub (branch `claude/zen-maxwell-iujchd`) | ✅ |
| 50 | Prévia funcional para testar | ✅ link em `docs/AUDITORIA.md`, já com os produtos reais |
| 51 | Ensinar a hospedar na Vercel + Supabase | ✅ `docs/HOSPEDAGEM.md`, passo a passo atualizado |
| 52 | Publicar de verdade na Vercel e no Supabase | ⏳ precisa das suas contas (40 minutos seguindo o guia) |
| 53 | E-mail de "Esqueci minha senha" e backup diário | ⏳ só dá para testar depois de publicado (`docs/TESTES.md`) |
