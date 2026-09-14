# ComprasWeb — Central de Compras

Pedidos de compra no modelo **PULL**: a Central (CD) abre o pedido, libera para as lojas
preencherem suas quantidades, negocia com o fornecedor e envia o pedido consolidado.

Mesmo layout e stack do **Admin B2B** (`b2bweb/admin`): Express + Vite (middleware) +
React 19 + Tailwind 4 + mysql2, fonte Jost, tema claro/escuro, sidebar + header.

## Rodando

```bash
npm install
cp .env.example .env      # preencha MYSQL_USER / MYSQL_PASSWORD
npm run db:setup          # cria o banco compras_pull com schema + dados de exemplo
npm run dev               # http://localhost:3002
```

`npm run db:setup -- --reset` **apaga** o banco `MYSQL_DATABASE` e recria tudo (útil para
recomeçar o teste). As datas dos pedidos de exemplo são relativas ao dia em que o setup roda.

## Acessos de teste

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador (CD) | admin@central.com | admin123 |
| Loja — Boa Safra Matriz (Sócio) | loja1001@boasafra.com | loja123 |
| Loja — Boa Safra Centro (Sócio) | loja1002@boasafra.com | loja123 |
| Loja — Franquia Varginha (Franqueado) | varginha@agromais.com | loja123 |
| Loja — Cooperativa (Conveniado) | cooperativa@valesapucai.com | loja123 |

## Roteiro de teste ponta a ponta

1. **Central cria o pedido** — `admin@central.com` → *Novo Pedido*: nome, fechamento,
   marcadores; aba *Produtos* (fornecedor + *Selecionar Produtos*); *Cond. de Pagamento*
   (ex.: `28dd` 0% p/ Socio, `28dd` 3% p/ Franqueado); *Associados* → *Carregar todos* de
   um grupo e desmarque alguém; **Gravar e liberar para as lojas**.
   (Ou use o pedido de exemplo **19400**, já liberado.)
2. **Loja preenche** — `loja1001@boasafra.com` → abra o pedido, escolha a condição, busque
   produtos pelo autocomplete, passe o mouse no ícone de imagem, digite quantidades e
   **Gravar** (ou **Rejeitar pedido**). Data, hora e usuário ficam em `pedido_associados`
   e `pedido_log`.
3. **Central efetua a compra** — em *Abertos*, menu `...` do pedido → *Tornar Indisponível*
   → *Efetuar Compra Fornecedor* (e-mail cadastrado ou digitação livre). O pedido vai para
   *Encerrados* como "Enviado para compra" e gera um recebimento por loja que preencheu.
   O pedido **19402** (fechamento vencido) já está pronto para esse passo.
4. **Confirmar recebimento** — aba *Confirmar Recebimento*: informe a data e, se houver,
   a divergência (entrega parcial, avaria). O pedido **19403** já tem entregas pendentes.

*Confirmação de E-mail* lista as ordens/cotações enviadas para registrar a confirmação do
fornecedor. *Impressão/Envio* oferece os 3 layouts (sintético, grade por associado e
detalhado por associado).

## Banco de dados

- `database/001_migration_pedidos_pull.sql` — schema base (cópia de `extras/`).
- `database/002_complemento.sql` — colunas que as telas exigem e o schema base não tem:
  GTIN/marca/classe/imagem em `produtos`, dados de entrega em `pedidos`, condição escolhida
  e avaliação em `pedido_associados`, status/confirmação em `compras_fornecedor`, e
  `AUTO_INCREMENT = 19400` para a numeração dos pedidos.
- `scripts/setup-db.ts` — aplica os dois arquivos e insere os dados de exemplo.

## Regras implementadas

- A **situação** do pedido controla o preenchimento: a loja só grava/rejeita com
  `liberado_loja` e antes de `data_fechamento`. Quando o fechamento passa, o pedido vira
  `aguardando_fechamento` automaticamente.
- **Faltam X dias** é calculado de `data_fechamento`, para a Central e para a loja.
- **Condições de pagamento** por grupo: a loja só vê as do seu grupo (ou "Todos"); o
  percentual é somado ao preço dos itens e o valor mínimo é exigido ao gravar.
- **Permissão de Compra**: máximo por loja e limite de logística (total entre lojas) por item.
- Alterar um pedido já preenchido preserva as quantidades; excluir produto ou desmarcar
  associado com preenchimento pede confirmação.
- **Associados** só entram pela sincronização com o BMSoft (colar exportação); produtos e
  fornecedores podem ser carregados do BMSoft ou digitados.

## Integrações opcionais (.env)

- **SMTP_*** — sem `SMTP_HOST`, os e-mails (compra, cotação, notificação) são registrados
  como *simulado*, e o fluxo funciona normalmente.
- **BLOB_READ_WRITE_TOKEN** — anexos dos pedidos no Vercel Blob (mesmo store do b2bweb), na
  pasta `comprasweb/pedidos/<nº do pedido>/`. Sem token, ficam na pasta local `uploads/`.
- **SERPER_API_KEY** — necessária para *Buscar imagens dos produtos* (Google Imagens via serper.dev).
