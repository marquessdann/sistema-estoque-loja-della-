# Manual rápido de uso — DELLA Estoque

## Antes de tudo: entrar no estoque

Na tela de login, digite o seu **usuário** (ex.: `daniel`, `vinicius`, `antonio.gv`) e a sua senha. Depois, o sistema pergunta **"Em qual estoque você vai trabalhar?"**:

1. Toque em **DELLA ESTOQUE** ou **DELLA FULL ML**.
2. Digite a **senha do estoque**. A senha padrão é `Galaxys2!`, e o CEO pode trocá-la em **Configurações**.
3. Pronto: uma **faixa colorida no topo** mostra em qual estoque você está.

Tudo o que você lançar (entrada, saída, inventário, transferência) acontece **dentro desse estoque**. Para trabalhar no outro, use o botão **Trocar de estoque**, na faixa do topo. Ele pede a senha do outro estoque.

## As duas lojas

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
   - **Cód. do fornecedor, NCM, CEST e Origem** (dados fiscais).
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

**Kits (ex.: Kit 3 Pinças):**
1. Cadastre o kit como um produto novo (unidade **KIT**).
2. Na tela dele, clique em **Transformar em kit** e adicione os produtos que formam o kit, com a quantidade de cada um.
3. Clique em **Salvar composição**.

O kit não tem estoque próprio:
- a tela mostra **quantos kits dá para montar**, limitado pelo componente que acabar primeiro;
- ao dar baixa em 1 kit (ou transferir), o sistema tira cada componente do estoque;
- kit não recebe entrada nem inventário: lance os componentes.

**Muitos produtos de uma vez:**
1. Vá em **Produtos > Importar / Exportar** e baixe a **planilha modelo**.
2. Preencha no Excel.
3. Envie a planilha. O sistema mostra uma prévia com os erros antes de gravar.

---

## 2. Dar entrada com nota fiscal

### Jeito mais rápido: com o XML da nota

1. Menu **Entrada**.
2. Confira na faixa do topo que você está no estoque que está **recebendo** (normalmente **DELLA ESTOQUE**).
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

1. Menu **Entrada** (a mercadoria entra no estoque em que você está). No topo, preencha:
   - **Número do pedido** (pedido de compra ao fornecedor);
   - **Número da NF que entrou**;
   - **Data e hora** em que a mercadoria chegou.

   Depois escolha o motivo **Compra**.
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

## 3. Transferir entre as lojas

A mercadoria **sempre sai do estoque em que você está** e entra no outro **na mesma hora**:
- para **mandar do DELLA ESTOQUE para o FULL**, entre no DELLA ESTOQUE;
- para **trazer do FULL para o DELLA ESTOQUE**, entre no FULL.

**Passo a passo:**
1. Menu **Transferir** (ou botão azul **Transferir** na tela do produto).
2. A tela mostra **SAI DE** (o seu estoque) e **ENTRA EM** (o outro).
3. Adicione os produtos (vários na mesma transferência). Use os botões **−** e **+** para a quantidade. O sistema bloqueia quantidade maior que o estoque.
4. Clique em **Transferir para ...**.
5. Leia a pergunta "**Você tem certeza que deseja mover N unidades de X para Y?**".
6. Marque **"Conferi"** e clique em **Sim, mover agora**. O botão só libera depois de marcar.

A transferência é **tudo ou nada**: sai de uma loja e entra na outra ao mesmo tempo.

**Errou?** O CEO ou o gerente entra no estoque de **destino** (de onde a mercadoria vai sair de volta) e usa **Estornar** na tela da transferência.

**Histórico:** menu **Histórico de transferências**, mostrando o que "saiu daqui" e o que "entrou aqui", com quem fez e quando.

**Sugestões no Painel:** quando falta um produto na outra loja e sobra no seu estoque, aparece **"Enviar X daqui para ..."**. Se a sobra estiver na outra loja, o Painel avisa que a transferência é feita dentro do estoque dela.

---

## 4. Fazer inventário (contagem)

1. Entre no estoque que vai contar e abra o menu **Inventário**.
2. (Opcional) Imprima a **folha de contagem** (PDF ou Excel) para anotar no papel.
3. Digite, na coluna **Contado**, o que existe de verdade na prateleira:
   - deixe **em branco** o que você **não** contou;
   - a coluna **Diferença** mostra na hora: **OK**, **+2**, **-1**...
4. Escolha o **motivo**, que é obrigatório: Inventário geral, parcial, Saldo inicial...
5. Clique em **Conferir e gravar ajuste**. O sistema mostra o resumo das diferenças. Confirme.

Só as diferenças são lançadas.

💡 **Começando a usar o sistema?** Faça um inventário de cada loja com o motivo **"Saldo inicial"**. Assim, os saldos reais entram no sistema.

---

## 5. Saída (baixa de pedidos)

A **Saída** é a mercadoria indo para as **lojas** (pedidos de clientes). Mandar mercadoria de um estoque para o outro é **Transferir** (item 3).

**Pedido (venda):**
1. Menu **Saída (pedidos)** e aba **Pedido (venda)**.
2. **Qual plataforma?**
   - no **DELLA ESTOQUE**: toque em **Mercado Livre** ou **TikTok Shop**;
   - no **DELLA FULL ML**: é sempre **Mercado Livre** (não precisa escolher).
3. Preencha:
   - **Número do pedido** (obrigatório);
   - **Número da NF**;
   - **Nome do cliente**;
   - **Data e hora** (já vem com agora).
4. Adicione os produtos ou kits e as quantidades.
5. Clique em **Dar baixa do pedido** e confirme.

**Outra saída** (perda, avaria, uso interno, devolução ao fornecedor): use a segunda aba e escolha o motivo.

Para achar depois: **Movimentações** tem filtros por **Nº do pedido**, **Nº da nota** e **Plataforma**. Em **Relatórios**, dá para filtrar por plataforma e exportar com pedido, NF e cliente.

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

## 8. Usuários e cargos (só o CEO)

Limite de **3 usuários ativos**. Não existem caixinhas de permissão: cada pessoa tem um **cargo**.

| Usuário (login) | Pessoa | Cargo |
|---|---|---|
| `daniel` | Daniel | **CEO** |
| `vinicius` | Vinicius | **Gerente** |
| `antonio.gv` | Antonio | **Funcionário** |

| O que pode fazer | CEO | Gerente | Funcionário |
|---|---|---|---|
| Entrar nos estoques (com a senha do estoque) | ✅ | ✅ | ✅ |
| Dar baixa (saída / pedidos) | ✅ | ✅ | ✅ |
| Transferir entre estoques | ✅ | ✅ | ✅ |
| Entrada, inventário | ✅ | ✅ | ❌ |
| Cadastrar e editar produtos e kits, inativar | ✅ | ✅ | ❌ (só consulta) |
| Estornar (autorizar correções) | ✅ | ✅ | ❌ |
| Ver lançamentos de todos, relatórios, Log de atividades | ✅ | ✅ | ❌ (vê só o que ele lançou) |
| Usuários, senhas dos estoques, lojas, configurações, excluir produto | ✅ | ❌ | ❌ |

- Os cargos são conferidos pelo **banco de dados**: mesmo que alguém tente "burlar" pela tela ou por chamada direta, o banco recusa.
- **Criar um usuário:** **Usuários > Novo usuário**. Preencha o nome, o **usuário** (letras minúsculas, sem espaço, ex.: `antonio.gv`), o cargo e a senha (mínimo de 6 caracteres).
- **Trocar alguém:** em **Editar**, desmarque **Usuário ativo** e depois crie o novo.
- **Esqueceu a senha?** O CEO coloca uma nova em **Usuários > Editar**.
- Cada pessoa pode trocar a própria senha em **Senha**, no rodapé do menu.

## 9. Log de atividades (CEO e gerente)

Menu **Log de atividades**: uma lista de **quem fez cada mudança**, por exemplo:
- "Antonio · Funcionário · Baixa (saída) · DELLA ESTOQUE · TikTok Shop · Pedido 5501 · Cliente Maria";
- "Antonio · Funcionário · Transferência · DELLA FULL ML → DELLA ESTOQUE · Navalha +2";
- "Daniel · CEO · Entrou no estoque · DELLA ESTOQUE";
- "Antonio · Errou a senha do estoque".

Filtre por usuário, tipo e período e exporte em Excel. O funcionário não vê esta tela, nem pela API.

## No celular

O sistema foi feito para funcionar bem no celular:
- todas as telas cabem na tela, sem arrastar para o lado;
- os botões são grandes para o dedo;
- a barra de baixo tem **Painel, Saída, Transferir, Histórico** e **Mais**.

Para usar como aplicativo: no Chrome (Android) ou no Safari (iPhone), abra o endereço do sistema e toque em **Adicionar à tela inicial**.

## 10. Outras novidades

- **Data do fato** em entradas e saídas (para lançar algo de ontem, por exemplo).
- Histórico com **saldo antes → depois** em cada movimento.
- **Excluir produto** cadastrado por engano (só se nunca teve movimentação; senão, use Inativar).
- **Inventário seguro:** se alguém lançar algo enquanto você conta, o sistema avisa em vez de apagar o lançamento do colega.
- **Proteção contra clique duplo:** o mesmo lançamento nunca é gravado duas vezes.
