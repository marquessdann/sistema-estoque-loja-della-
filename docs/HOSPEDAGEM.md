# Passo a passo de hospedagem (para quem não é programador)

Tempo estimado: **40 minutos**. Custo: **R$ 0** (planos gratuitos).

**Resumo da ordem (não pule nenhuma):**
1. Passo 0 – juntar o código na branch `main` do GitHub.
2. Passo 1 – Supabase: rodar os arquivos **01 → 03 → 04 → 05**, fechar o cadastro público, criar o **Daniel (CEO)**, rodar o **06** (produtos reais) e copiar as chaves.
3. Passo 2 – Vercel: importar o repositório, colar as 3 chaves e publicar.
4. Passo 3 – Backup diário (opcional, recomendado).
5. Passo 4 – Endereço próprio (opcional).

Você vai usar 3 serviços:

| Serviço | Para que serve |
|---|---|
| **GitHub** (você já tem) | Guarda o código do sistema e faz o backup diário |
| **Supabase** | Banco de dados, login e arquivos (fotos e notas) |
| **Vercel** | Deixa o sistema no ar, com endereço `https://...` |

> Dica: anote tudo num papel ou num bloco de notas seguro: senhas e endereços.

---

## Passo 0 — Colocar o código na branch principal

O código foi entregue na branch `claude/zen-maxwell-iujchd`. Para a Vercel publicar, ele precisa estar na branch principal (`main`):

1. Abra o repositório no GitHub.
2. Clique no aviso amarelo **"Compare & pull request"** (ou vá em **Pull requests > New pull request**, escolha `base: main` e `compare: claude/zen-maxwell-iujchd`).
3. Clique em **Create pull request** e depois em **Merge pull request > Confirm merge**.

> Se o repositório ainda não tiver a branch `main`, basta ir em **Settings > Branches** e definir `claude/zen-maxwell-iujchd` como branch padrão.

---

## Passo 1 — Criar o banco de dados no Supabase

1. Acesse **https://supabase.com** e clique em **Start your project**. Entre com sua conta do GitHub.
2. Clique em **New project**:
   - **Name:** `della-estoque`
   - **Database Password:** clique em **Generate a password** e **GUARDE essa senha** (vai precisar no backup).
   - **Region:** `South America (São Paulo)`
   - Plano: **Free**
3. Espere uns 2 minutos até o projeto ficar pronto.

### 1.1 — Criar as tabelas (4 arquivos, nesta ordem)

1. No menu da esquerda, clique em **SQL Editor**.
2. Clique em **New query** (ou no **+**).
3. No GitHub, abra o arquivo [`supabase/01_estrutura.sql`](../supabase/01_estrutura.sql), clique no botão **Copy raw file** (ícone de copiar), volte ao Supabase e cole na área de texto.
4. Clique em **Run** (ou Ctrl+Enter). Deve aparecer **"Success. No rows returned"**.
5. Clique em **New query** de novo e repita com cada arquivo abaixo, **um de cada vez e nesta ordem**:

   | Ordem | Arquivo | O que faz |
   |---|---|---|
   | 2º | [`03_versao2_permissoes_transferencias.sql`](../supabase/03_versao2_permissoes_transferencias.sql) | Estoque com senha, transferência na hora, log de atividades |
   | 3º | [`04_cargos_e_baixa.sql`](../supabase/04_cargos_e_baixa.sql) | Cargos CEO / Gerente / Funcionário; pedido, NF, cliente, plataforma e data/hora na entrada e saída |
   | 4º | [`05_kits_e_fiscal.sql`](../supabase/05_kits_e_fiscal.sql) | Kits e NCM / CEST / origem / código do fornecedor |

> ⚠️ **Não rode o `02_dados_exemplo.sql`** no sistema de verdade: ele só tem produtos de teste. Os produtos reais da DELLA entram pelo arquivo `06` (passo 1.4).
>
> **Já usa uma versão anterior?** Rode só os arquivos que faltam, na ordem (ex.: quem já rodou 01 e 03 roda 04 e 05). Nenhum dado é apagado.

As duas lojas, **DELLA ESTOQUE** (azul) e **DELLA FULL ML** (dourado), já são criadas pelo primeiro arquivo.

### 1.2 — Fechar o cadastro público (segurança)

Só o administrador cria usuários, pelo próprio sistema. O banco já recusa qualquer cadastro sem "convite" do administrador, mas feche também a porta no painel (segurança em dobro):

1. Menu **Authentication > Sign In / Providers** (em algumas versões: **Authentication > Providers**, ou **Settings**).
2. **Desligue** a opção **"Allow new users to sign up"** e clique em **Save**.

### 1.3 — Criar o primeiro usuário (Daniel, o CEO)

O sistema entra por **usuário** (ex.: `daniel`), não por e-mail. Por dentro, o usuário `daniel` é guardado como o e-mail `daniel@della.local`.

1. Menu **Authentication > Users > Add user > Create new user**.
2. Em **Email**, digite exatamente `daniel@della.local`. Em **Password**, digite a senha do Daniel.
3. Marque **Auto Confirm User** e clique em **Create user**.

> A senha mínima do Supabase é de 6 caracteres. Se ele recusar uma senha curta, veja em **Authentication > Sign In / Providers > Email > Minimum password length** (deixe 6).

✅ O **primeiro** usuário criado vira **CEO** automaticamente. Vinicius e Antonio você cria depois, dentro do sistema (tela **Usuários**).

### 1.4 — Cadastrar os produtos reais da DELLA

Precisa ser **depois** do passo 1.3, porque os lançamentos ficam no nome do CEO.

1. **SQL Editor > New query**.
2. Copie e cole o arquivo [`supabase/06_produtos_della.sql`](../supabase/06_produtos_della.sql) e clique em **Run**.
3. Embaixo aparece uma tabela com o **saldo de cada produto no DELLA ESTOQUE**. Confira com a sua planilha: por exemplo, a Navalha Aço Inox Standard deve ter **44**.

O arquivo cadastra:
- os 49 produtos e os 4 kits;
- as entradas das notas 16.653 (Itapema) e 46.780 (Vermonth), dos pedidos 3108 e 3136 (Elementar);
- as vendas do Mercado Livre.

Se rodar duas vezes, não duplica nada.

### 1.4b — Arquivo 07 (plataforma Shopee)

Rode também o [`supabase/07_shopee.sql`](../supabase/07_shopee.sql) no **SQL Editor** (**+** → colar → **Run**). Ele acrescenta a **Shopee** como plataforma de saída. Pode rodar a qualquer momento depois do 05; não apaga nada.

### 1.4c — Arquivo 08 (prova de envio com fotos)

Rode também o [`supabase/08_provas_envio.sql`](../supabase/08_provas_envio.sql) no **SQL Editor** (**+** → colar → **Run**), depois do 07. Ele cria a pasta privada **envios** (onde ficam as fotos) e a tela **Envio com fotos**. Não apaga nada e pode rodar de novo.

### 1.5 — Copiar as chaves de acesso

1. Clique em **Project Settings** (engrenagem) e depois em **API Keys** (ou **API**).
2. Anote:
   - **Project URL**, algo como `https://abcdefgh.supabase.co`. Ela também aparece no botão **Connect** do topo, ou em **Settings > Data API**.
   - A chave **anon / public**, ou a **Publishable key** (`sb_publishable_...`).
   - A chave **service_role**, ou a **Secret key** (`sb_secret_...`). ⚠️ **Esta é secreta**: nunca mande por WhatsApp ou e-mail e não coloque em lugar público.

---

## Passo 2 — Publicar o sistema na Vercel

1. Acesse **https://vercel.com** e clique em **Sign Up**. Escolha o plano **Hobby** (grátis) e entre com o **GitHub**.
2. Clique em **Add New... > Project**.
3. Na lista, encontre o repositório **sistema-estoque-loja-della-** e clique em **Import**. Se ele não aparecer, clique em **Adjust GitHub App Permissions** e libere o repositório.
4. Abra a seção **Environment Variables** e cadastre as 3 variáveis abaixo (nome à esquerda, valor à direita):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | a Project URL do passo 1.5 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a chave anon/publishable |
   | `SUPABASE_SERVICE_ROLE_KEY` | a chave service_role/secret |

5. Clique em **Deploy** e espere de 2 a 3 minutos.
6. Ao terminar, aparece o endereço do sistema, por exemplo `https://sistema-estoque-della.vercel.app`. **Anote.**

### 2.1 — Avisar o Supabase sobre o endereço do sistema

Isso é necessário para o link de "Esqueci minha senha" funcionar.

1. No Supabase, abra **Authentication > URL Configuration**.
2. Em **Site URL**, coloque o endereço da Vercel (ex.: `https://sistema-estoque-della.vercel.app`).
3. Em **Redirect URLs**, clique em **Add URL** e adicione o mesmo endereço com `/**` no final (ex.: `https://sistema-estoque-della.vercel.app/**`).
4. Clique em **Save**.

### 2.2 — Primeiro acesso

1. Abra o endereço da Vercel no navegador (computador ou celular).
2. Entre com o usuário `daniel` e a senha do passo 1.3. Escolha o estoque e digite a **senha do estoque**: `Galaxys2!`.
3. **Troque as senhas dos estoques:** **Configurações > Lojas > Trocar senha** (uma para cada estoque).
4. Vá em **Usuários** (menu da esquerda, ou **Mais** no celular):
   - corrija o seu nome em **Editar** (ex.: Daniel);
   - em **Novo usuário**, crie o **Vinicius**: usuário `vinicius`, cargo **Gerente** e a senha dele;
   - crie o **Antonio**: usuário `antonio.gv`, cargo **Funcionário** e a senha dele.

   Cada um troca a própria senha em **Senha**, no rodapé do menu. Esqueceu? O CEO coloca uma nova em **Usuários > Editar** (o "Esqueci minha senha" por e-mail só vale para quem foi cadastrado com e-mail de verdade).

💡 **No celular:** abra o endereço no Chrome (Android) ou no Safari (iPhone) e toque em **"Adicionar à tela inicial"** (no iPhone: botão **Compartilhar** > **Adicionar à Tela de Início**). O sistema ganha um ícone igual a um aplicativo. A barra de baixo tem **Painel, Saída, Transferir, Histórico** e **Mais**.

---

## Passo 3 — Backup automático diário (GitHub, grátis)

O arquivo `.github/workflows/backup.yml` já está no projeto. Ele faz uma cópia do banco todo dia às 03:17, protegida com senha, e guarda por 90 dias. Só falta configurar:

1. No Supabase, clique no botão **Connect** (no topo da tela).
2. Escolha **Session pooler** e copie o endereço, que tem este formato: `postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`.
3. Troque `[YOUR-PASSWORD]` pela senha do banco do passo 1 (sem os colchetes).
4. No GitHub, abra o repositório e vá em **Settings > Secrets and variables > Actions > New repository secret**. Crie dois segredos:
   - **Name:** `SUPABASE_DB_URL`. **Secret:** o endereço do item 3.
   - **Name:** `BACKUP_SENHA`. **Secret:** invente uma senha forte e **guarde** (sem ela o backup não abre).
5. Para testar agora: aba **Actions > Backup diário do banco > Run workflow**. Em uns 2 minutos aparece um ✅ verde e o arquivo do backup em **Artifacts**.

> ⚠️ Deixe o repositório **privado**: **Settings > General > Danger Zone > Change visibility > Private**.

### Como abrir um backup (se um dia precisar)

1. Baixe o arquivo `.gpg` na aba **Actions**, dentro da execução do dia desejado.
2. Num computador com o GnuPG instalado, rode:
   ```
   gpg -d della-backup-AAAA-MM-DD_HHMM.tar.gz.gpg | tar -xz
   ```
   Digite a `BACKUP_SENHA`.
3. A pasta `backup/` terá:
   - o banco em formato `.dump` (para restaurar com `pg_restore`);
   - o banco em `.sql.gz` (texto);
   - a lista de logins.

   Para restaurar, peça ajuda a um técnico: o arquivo é padrão PostgreSQL.

Além disso, o administrador pode, a qualquer momento, ir em **Configurações > Exportar tudo** e baixar uma planilha Excel com todos os dados.

> As **fotos de produto** e os **PDF/XML das notas** ficam no Storage do Supabase (menu **Storage**) e podem ser baixados por lá.

---

## Passo 4 (opcional) — Usar um endereço próprio: `estoque.dellastore.com.br`

1. Na Vercel, abra o projeto e vá em **Settings > Domains > Add**. Digite `estoque.dellastore.com.br` e clique em **Add**.
2. A Vercel mostra um registro **CNAME** para criar, normalmente `cname.vercel-dns.com`. Os valores exatos aparecem na tela da Vercel.
3. No painel onde o domínio `dellastore.com.br` é administrado (Registro.br, Cloudflare, Hostinger, ou a empresa que cuida do site), crie um registro DNS com:
   - **Tipo:** `CNAME`
   - **Nome:** `estoque`
   - **Valor:** `cname.vercel-dns.com`

   > No Registro.br: **Domínios > dellastore.com.br > Editar zona > Nova entrada**. Se o DNS estiver em outra empresa, peça a quem cuida do site para criar esse registro.
4. Espere de alguns minutos a algumas horas. A Vercel mostra ✅ e já ativa o HTTPS sozinha.
5. Volte ao **passo 2.1** e troque o endereço pelo novo `https://estoque.dellastore.com.br`.

---

## Custos e limites do plano gratuito

| Item | Limite grátis | Para a DELLA |
|---|---|---|
| Supabase: banco | 500 MB | Dá para muitos anos de movimentações |
| Supabase: arquivos | 1 GB | Cerca de 5.000 PDFs de nota ou fotos |
| Vercel Hobby | Uso pessoal, tráfego generoso | Sobra |
| GitHub Actions | 2.000 min/mês (repo privado) | O backup usa cerca de 60 min/mês |

⚠️ **Pausa por inatividade:** no plano grátis, se o sistema ficar **7 dias seguidos sem uso**, o Supabase pausa o projeto. Os dados não se perdem: basta entrar em supabase.com e clicar em **Restore project**. Com o uso diário (e o backup diário), isso não deve acontecer.

Se um dia precisar de mais segurança, o **Supabase Pro** (cerca de US$ 25/mês) tem backup diário gerenciado e nunca pausa.

---

## Atualizações futuras

Sempre que o código mudar na branch `main` do GitHub, a Vercel publica a nova versão sozinha, em uns 2 minutos.

Se uma atualização trouxer mudanças no banco, ela virá com um novo arquivo `.sql` (o próximo número da sequência) e instruções para rodar no **SQL Editor**.

## Se algo der errado

| Problema | O que fazer |
|---|---|
| "Crie primeiro o usuário CEO" ao rodar o 06 | Faça o passo 1.3 e rode o 06 de novo |
| Erro "relation/function does not exist" ao rodar um arquivo | Um arquivo anterior não foi rodado: siga a ordem 01 → 03 → 04 → 05 → 06 |
| A página da Vercel mostra erro ao abrir | Confira as 3 variáveis do passo 2 (sem espaços sobrando) e clique em **Deployments > Redeploy** |
| "Esqueci minha senha" não chega ou o link não abre | Confira o passo 2.1 (Site URL e Redirect URLs) |
| Alguém esqueceu a senha do estoque | O CEO define uma nova em **Configurações > Lojas** |

## Rodar no seu computador (opcional, para técnicos)

```bash
npm install
cp .env.example .env.local   # preencha as 3 variáveis
npm run dev                  # abre em http://localhost:3000
```
