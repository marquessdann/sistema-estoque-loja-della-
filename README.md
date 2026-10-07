<p align="center"><img src="public/logo.png" alt="DELLA Distribuidora de Produtos" width="220"></p>

# DELLA Estoque — Controle de estoque com 2 lojas

Sistema web de controle de estoque da **DELLA Distribuidora de Produtos**, com dois estoques que conversam entre si:

- 🔵 **DELLA ESTOQUE**: estoque físico próprio.
- 🟡 **DELLA FULL ML**: estoque no Fulfillment do Mercado Livre.

Um cadastro único de produtos, saldo separado por loja, transferências "tudo ou nada", entradas com nota fiscal (inclusive pelo XML da NF-e), inventário, estorno, relatórios em Excel e PDF, até 3 usuários e auditoria completa. Tudo atualiza em **tempo real** para todos.

## 📚 Documentação

| Documento | Para quê |
|---|---|
| [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md) | Passo a passo para colocar no ar (Supabase + Vercel + backup + domínio próprio) |
| [docs/MANUAL.md](docs/MANUAL.md) | Manual rápido: cadastrar produto, entrada com NF, transferir, inventário... |
| [docs/TESTES.md](docs/TESTES.md) | Lista de testes para confirmar que tudo funciona |
| [docs/AUDITORIA.md](docs/AUDITORIA.md) | Auditoria completa: checklist, matriz de permissões, problemas, correções e resultados dos testes |
| [docs/CHECKLIST.md](docs/CHECKLIST.md) | Checklist de tudo o que foi pedido, item por item |

## Tecnologia

| Parte | Escolha | Por quê |
|---|---|---|
| Telas | **Next.js 15 + TypeScript + Tailwind** | Moderno, rápido, funciona bem no celular |
| Banco, login, arquivos e tempo real | **Supabase** (PostgreSQL) | Plano grátis, tudo num lugar só |
| Hospedagem | **Vercel** | Grátis, HTTPS automático, publica sozinho a cada mudança |
| Backup | **GitHub Actions** | Cópia diária criptografada, grátis |

## Como o estoque funciona (regras de integridade)

- **Livro-razão:** cada entrada e saída é uma linha na tabela `movimentacoes`, que nunca é alterada nem apagada. O saldo (`produto_loja.saldo`) é atualizado **somente** pelas funções do banco, na mesma transação do lançamento.
- **Funções do banco (RPC):** fazem todo lançamento numa única transação:
  - `registrar_entrada`
  - `registrar_saida`
  - `registrar_transferencia`, `estornar_transferencia`
  - `registrar_ajuste`
  - `estornar_operacao`
- **Saldo nunca negativo:** é verificado nas funções (com mensagem clara) e garantido por `CHECK (saldo >= 0)`.
- **Trava de concorrência:** `SELECT ... FOR UPDATE` evita que duas pessoas "gastem" o mesmo saldo ao mesmo tempo.
- **Segurança (RLS):**
  - só usuários logados e ativos leem dados;
  - o aplicativo não tem permissão de gravar diretamente em saldos ou movimentações;
  - auditoria, usuários e configurações são só do administrador.
- **Limite de 3 usuários ativos**, "sempre 1 CEO" e cadastro só por convite do CEO: regras dentro do banco.
- **Login por usuário** (ex.: `daniel`, `vinicius`, `antonio.gv`).
- **Cargos fixos** conferidos em toda função do banco:
  - **CEO:** tudo.
  - **Gerente:** autoriza, mas sem usuários e configurações.
  - **Funcionário:** só baixa e transferência.
- **Entrada e saída com pedido:** nº do pedido, nº da NF, cliente, data e hora. No DELLA ESTOQUE, a saída pergunta a plataforma (Mercado Livre / TikTok Shop / Shopee).
- **Kits:** a baixa de 1 kit tira cada componente do estoque.
- **Dados fiscais:** NCM, CEST, origem e código do fornecedor.
- **Estoque com senha:** ao entrar, a pessoa escolhe o estoque (DELLA ESTOQUE ou DELLA FULL ML) e digita a senha dele. Entradas, saídas, inventário e transferências só acontecem no estoque em que ela está (o banco confere).
- **Transferência imediata** (sai de uma loja e entra na outra na hora), sempre a partir do estoque atual, com confirmação reforçada e estorno.
- **Log de atividades** para o CEO e o gerente: quem fez cada mudança.
- **Anti-duplicidade:** cada formulário envia uma chave única; reenvio não grava de novo.
- **Custo médio ponderado** é recalculado a cada entrada com custo informado.
- **Nota fiscal:**
  - chave de acesso validada (44 dígitos e dígito verificador);
  - CNPJ validado, inclusive o novo CNPJ alfanumérico;
  - a mesma nota não pode ser lançada duas vezes.

## Estrutura do projeto

```
supabase/
  01_estrutura.sql        ← banco (versão 1): tabelas, regras, funções, segurança, as 2 lojas
  03_versao2_permissoes_transferencias.sql ← estoque com senha, transferência imediata, log, anti-duplicidade
  04_cargos_e_baixa.sql   ← cargos CEO/Gerente/Funcionário; pedido, NF, cliente, plataforma e data/hora
  05_kits_e_fiscal.sql    ← kits e NCM/CEST/origem/código do fornecedor
  06_produtos_della.sql   ← os 49 produtos reais + 4 kits + histórico (planilha e notas), depois de criar o CEO
  07_shopee.sql           ← plataforma Shopee na saída
  02_dados_exemplo.sql    ← SÓ PARA TESTE: produtos de exemplo (não rodar no sistema de verdade)
testes/
  banco.sql               ← 139 testes automáticos das regras do banco
  api_permissoes.sh       ← 44 tentativas de burlar a API como funcionário e gerente
src/
  app/
    login/, redefinir-senha/     ← telas públicas
    (sistema)/                   ← telas internas (exigem login)
      page.tsx                   ← Painel
      produtos/ (lista, novo, [id], importar)
      entrada/ saida/ transferencia/ inventario/
      movimentacoes/ transferencias/ notas/ relatorios/
      log/                       ← CEO e gerente
      usuarios/ configuracoes/   ← só o CEO
    api/usuarios/route.ts        ← criar/alterar usuários (servidor, chave secreta)
  components/                    ← peças reaproveitadas (etiqueta de loja, busca, lista de itens, nota fiscal...)
  lib/                           ← dados em tempo real, formatação, validações, exportação Excel/PDF, leitura do XML
  middleware.ts                  ← exige login em todas as telas
.github/workflows/backup.yml     ← backup diário criptografado
```

## Preparado para o futuro

- **Nova loja:** basta inserir uma linha na tabela `lojas` (nome, código e cor). As telas e os saldos se adaptam sozinhos.
- **Integração com o Mercado Livre:**
  - `produtos.ml_item_id` guarda o código MLB;
  - `lojas.ml_seller_id` guarda a conta;
  - `operacoes.origem` aceita `api_ml`.

  Uma futura integração só precisa chamar as mesmas funções (`registrar_saida`, `registrar_transferencia`...), mantendo todas as regras.

## Rodar localmente (técnicos)

```bash
npm install
cp .env.example .env.local   # preencha as variáveis do Supabase
npm run dev
```
