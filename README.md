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
- **Limite de 3 usuários ativos**, "sempre 1 administrador" e cadastro só por convite do administrador: regras dentro do banco.
- **Permissões por operador** (entrada, saída, transferir, inventário, estornar, produtos, relatórios, histórico) conferidas em toda função do banco.
- **Estoque com senha:** ao entrar, a pessoa escolhe o estoque (DELLA ESTOQUE ou DELLA FULL ML) e digita a senha dele. Entradas, saídas, inventário e transferências só acontecem no estoque em que ela está (o banco confere).
- **Transferência imediata** (sai de uma loja e entra na outra na hora), sempre a partir do estoque atual, com confirmação reforçada e estorno.
- **Log de atividades** só para o administrador: quem fez cada mudança.
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
  03_versao2_permissoes_transferencias.sql ← versão 2: estoque com senha, permissões por operador,
                             transferência imediata, log de atividades, anti-duplicidade (rodar depois do 01)
  02_dados_exemplo.sql    ← produtos de exemplo (pinças, navalha...) com saldo inicial
testes/
  banco.sql               ← 99 testes automáticos das regras do banco
  api_permissoes.sh       ← 42 tentativas de burlar a API como operador
src/
  app/
    login/, redefinir-senha/     ← telas públicas
    (sistema)/                   ← telas internas (exigem login)
      page.tsx                   ← Painel
      produtos/ (lista, novo, [id], importar)
      entrada/ saida/ transferencia/ inventario/
      movimentacoes/ transferencias/ notas/ relatorios/
      usuarios/ configuracoes/   ← só administrador
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
