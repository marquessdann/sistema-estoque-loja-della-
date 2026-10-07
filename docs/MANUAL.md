# Manual rápido de uso — DELLA Estoque

## Antes de tudo: as duas lojas

| Etiqueta | Loja | O que é |
|---|---|---|
| 🔵 **DELLA ESTOQUE** (azul) | Estoque físico próprio | O que está com vocês |
| 🟡 **DELLA FULL ML** (dourado) | Fulfillment do Mercado Livre | O que está no galpão do ML |

O **cadastro de produtos é um só**, e cada produto tem um **saldo em cada loja**. Nas telas de lançamento, a cor da loja escolhida aparece numa **faixa no topo**, para ninguém lançar na loja errada.

**Regra de ouro:** o saldo **nunca é digitado direto**. Ele só muda por:
- **Entrada**
- **Saída**
- **Transferência**
- **Inventário** (ajuste)
- **Estorno**

Tudo fica registrado com data, hora e o nome de quem fez.

---

## 1. Cadastrar um produto

1. Menu **Produtos > Novo produto**.
2. Preencha o **Nome**, que é o único campo obrigatório. Os demais, se quiser:
   - **SKU:** deixe vazio e o sistema gera um código (`DELLA-00001`).
   - **Código de barras (EAN):** pode bipar com o leitor.
   - **Categoria / Marca:** escolha da lista ou digite uma nova.
   - **Preço de custo e de venda.**
   - **Estoque mínimo** de cada loja: abaixo disso, o sistema avisa.
   - **Foto** e **observações**.
3. Clique em **Cadastrar produto**.

Na tela do produto você também pode:
- **Duplicar:** cria um produto parecido, já preenchido. Ótimo para variações.
- **Inativar:** o produto some das buscas, mas o histórico fica. Produto com histórico **nunca** é apagado.
- **Transferir / Entrada / Saída:** atalhos rápidos.
- Ver o **histórico** de tudo o que aconteceu com ele.

**Muitos produtos de uma vez:**
1. Vá em **Produtos > Importar / Exportar** e baixe a **planilha modelo**.
2. Preencha no Excel.
3. Envie a planilha. O sistema mostra uma prévia com os erros antes de gravar.

---

## 2. Dar entrada com nota fiscal

### Jeito mais rápido: com o XML da nota

1. Menu **Entrada**.
2. Toque na loja que está **recebendo** (normalmente **DELLA ESTOQUE**).
3. Clique em **Importar XML da NF-e** e escolha o arquivo `.xml` que o fornecedor mandou por e-mail.
4. O sistema preenche sozinho:
   - número, série, chave, data, fornecedor, CNPJ e valor;
   - os produtos, encontrados pelo **código de barras** ou pelo **SKU**.
5. Itens que o sistema não reconheceu aparecem em laranja. Para cada um, escolha:
   - **Vincular a produto existente:** quando o código do fornecedor é diferente do seu.
   - **Cadastrar como produto novo.**
6. **Confira as quantidades.** O fornecedor pode vender em caixa e você controlar em unidade.
7. Clique em **Registrar entrada** e confirme.

O XML fica anexado à nota automaticamente.

### Sem XML (digitando)

1. Menu **Entrada**: escolha a loja e o motivo **Compra**.
2. Abra **Nota fiscal** e preencha:
   - **número**, **série**, **data**, **fornecedor** e **CNPJ**;
   - a **chave de acesso** (44 dígitos, o sistema confere se está certa);
   - **valor total**.
3. (Opcional) Anexe o **PDF** da nota.
4. Busque cada produto (pelo nome ou bipando o código), informe a **quantidade** e o **custo unitário**.
5. **Registrar entrada** e confirmar.

O sistema:
- calcula o **custo médio** do produto a cada entrada com custo;
- **bloqueia** a mesma nota (mesma chave) lançada duas vezes.

Para achar depois: **Notas fiscais** (busca por número, fornecedor, CNPJ ou chave) ou **Movimentações** (campo "Nº da nota fiscal").

---

## 3. Transferir entre as lojas (ex.: mandar pinças para o FULL)

1. Menu **Transferir**. Ou, na tela do produto, o botão azul **Transferir**.
2. **DE** (sai da loja): ex. **DELLA ESTOQUE**. **PARA** (entra na loja): ex. **DELLA FULL ML**.
   - O botão **Inverter** troca as duas.
   - A faixa no topo mostra: **"SAI DE ... → ENTRA EM ..."**.
3. Adicione os produtos. Pode ser **vários na mesma transferência**.
4. Para cada um, digite a quantidade. Aparece como fica o saldo nas duas lojas, ex.: `ESTOQUE 40 → 35` e `FULL 2 → 7`.
5. Se a quantidade for maior que o saldo da origem, aparece **"Só há X disponível"** e o botão fica bloqueado.
6. (Opcional) Informe a nota fiscal de remessa e uma observação, como o nº do envio Full.
7. Clique em **Transferir** e confirme.

A transferência é **tudo ou nada**: sai de uma loja e entra na outra ao mesmo tempo. Se algo falhar, nada muda.

**Atalho pelo Painel:** quando um produto está abaixo do mínimo numa loja e sobra na outra, o Painel mostra **"Sugestão: transferir X de ..."**. Um toque abre a transferência já preenchida.

Histórico completo: menu **Histórico de transferências**, com quem fez e quando.

---

## 4. Fazer inventário (contagem)

1. Menu **Inventário** e escolha a loja que você está contando.
2. (Opcional) Imprima a **folha de contagem** (PDF ou Excel) para anotar no papel.
3. Digite, na coluna **Contado**, o que existe de verdade na prateleira:
   - deixe **em branco** o que você **não** contou;
   - a coluna **Diferença** mostra na hora: **OK**, **+2**, **-1**...
4. Escolha o **motivo**, que é obrigatório: Inventário geral, parcial, Saldo inicial...
5. Clique em **Conferir e gravar ajuste**. O sistema mostra o resumo das diferenças. Confirme.

Só as diferenças são lançadas.

💡 **Começando a usar o sistema?** Faça um inventário de cada loja com o motivo **"Saldo inicial"**. Assim, os saldos reais entram no sistema.

---

## 5. Saída (venda, perda, avaria, uso interno)

1. Menu **Saída**.
2. Escolha a loja e o motivo.
3. Adicione os produtos e as quantidades.
4. Clique em **Registrar saída** e confirme.

As vendas do Mercado Livre Full saem da loja **DELLA FULL ML**.

---

## 6. Errou um lançamento? Estorne

1. Menu **Movimentações** e toque no lançamento.
2. Clique em **Estornar (desfazer) este lançamento** e informe o motivo.

O sistema cria o lançamento **inverso**. O original fica no histórico marcado como "estornado": nada é apagado.

---

## 7. Painel e relatórios

- **Painel:**
  - total de produtos;
  - unidades e valor de cada loja;
  - produtos **abaixo do mínimo**, com sugestão de transferência;
  - últimas movimentações.
- **Relatórios:**
  - **Movimentações:** filtro por período, loja, tipo e produto.
  - **Posição de estoque:** saldos e valor a custo e a preço de venda.
  - **Estoque baixo.**

  Todos têm botões **Excel** e **PDF**.

As telas se atualizam **sozinhas**: se outra pessoa lançar algo, você vê na hora.

---

## 8. Usuários (só o Administrador)

- O limite é de **3 usuários ativos**: 1 administrador e 2 operadores.
- **Administrador:** faz tudo, inclusive usuários, configurações, auditoria e exportar todos os dados.
- **Operador:**
  - cadastra e edita produtos;
  - faz entradas, saídas, transferências, inventários e estornos.
- Para trocar alguém: em **Usuários > Editar**, desmarque **Usuário ativo** e depois crie o novo.
- Esqueceu a senha? Na tela de login, use **Esqueci minha senha**, ou peça ao administrador para definir uma nova em **Usuários > Editar**.
- Cada pessoa pode trocar a própria senha em **Senha**, no rodapé do menu.
