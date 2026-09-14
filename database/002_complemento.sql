-- =====================================================================
-- COMPLEMENTO da migration_pedidos_pull.sql
-- Colunas exigidas pelas telas que o schema base não cobre:
--  - produtos: GTIN (busca por código de barras), marca/classe (seleção de
--    produtos) e imagem (prévia no hover / "Buscar imagens dos produtos");
--  - pedido_itens: snapshot do GTIN e da imagem;
--  - pedidos: dados da aba "Entrega";
--  - pedido_associados: condição de pagamento escolhida pela loja e avaliação
--    do processo de compra;
--  - compras_fornecedor: situação do envio do e-mail e confirmação do fornecedor
--    (tela "Confirmação de E-mail").
-- =====================================================================

ALTER TABLE produtos
    ADD COLUMN gtin        VARCHAR(20)  NULL AFTER bmsoft_id,
    ADD COLUMN marca       VARCHAR(80)  NULL AFTER unidade,
    ADD COLUMN classe      VARCHAR(80)  NULL AFTER marca,
    ADD COLUMN imagem_url  VARCHAR(500) NULL AFTER preco_estimado,
    ADD KEY idx_produto_gtin (gtin);

ALTER TABLE fornecedores
    ADD UNIQUE KEY uq_fornecedor_bmsoft (bmsoft_id);

ALTER TABLE produtos
    ADD UNIQUE KEY uq_produto_bmsoft (bmsoft_id);

ALTER TABLE pedido_itens
    ADD COLUMN gtin        VARCHAR(20)  NULL AFTER produto_id,
    ADD COLUMN imagem_url  VARCHAR(500) NULL AFTER limite_logistica;

ALTER TABLE pedidos
    ADD COLUMN tipo_frete        ENUM('CIF','FOB') NULL AFTER percentual_padrao,
    ADD COLUMN prazo_entrega     VARCHAR(100) NULL AFTER tipo_frete,
    ADD COLUMN local_entrega     VARCHAR(200) NULL AFTER prazo_entrega;

ALTER TABLE pedido_associados
    ADD COLUMN condicao_pagamento_id INT NULL AFTER incluido_via,
    ADD COLUMN avaliacao_nota        TINYINT NULL AFTER usuario_acao_id,
    ADD COLUMN avaliacao_comentario  VARCHAR(500) NULL AFTER avaliacao_nota,
    ADD CONSTRAINT fk_pa_condicao FOREIGN KEY (condicao_pagamento_id)
        REFERENCES pedido_condicoes_pagamento(id) ON DELETE SET NULL;

ALTER TABLE compras_fornecedor
    ADD COLUMN assunto              VARCHAR(200) NULL AFTER apenas_cotacao,
    ADD COLUMN status_envio         ENUM('enviado','simulado','falha') NOT NULL DEFAULT 'simulado' AFTER assunto,
    ADD COLUMN mensagem_erro        VARCHAR(500) NULL AFTER status_envio,
    ADD COLUMN confirmado_fornecedor_em DATETIME NULL AFTER usuario_id,
    ADD COLUMN confirmado_por       INT NULL AFTER confirmado_fornecedor_em,
    ADD COLUMN observacao_confirmacao VARCHAR(500) NULL AFTER confirmado_por;

-- Um recebimento por associado do pedido
ALTER TABLE recebimentos
    ADD UNIQUE KEY uq_recebimento_pa (pedido_associado_id);

-- Log e recebimentos não podem impedir a remoção de um associado do pedido
ALTER TABLE pedido_log DROP FOREIGN KEY fk_log_pa;
ALTER TABLE pedido_log
    ADD CONSTRAINT fk_log_pa FOREIGN KEY (pedido_associado_id)
        REFERENCES pedido_associados(id) ON DELETE SET NULL;

ALTER TABLE recebimentos DROP FOREIGN KEY fk_receb_pa;
ALTER TABLE recebimentos
    ADD CONSTRAINT fk_receb_pa FOREIGN KEY (pedido_associado_id)
        REFERENCES pedido_associados(id) ON DELETE CASCADE;

-- Numeração dos pedidos continuando a usada hoje (ver final da migration base)
ALTER TABLE pedidos AUTO_INCREMENT = 19400;
