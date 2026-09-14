-- =====================================================================
-- MIGRATION: Sistema de Pedidos "PULL" de Compras
-- Baseado no documento FERRAMENTA-BM.pdf
-- =====================================================================
-- Fluxo geral:
--  1) Central (CD) cria o pedido, seleciona associados (lojas/clientes)
--     por nome/ID ou por classificação (grupo), define fornecedor,
--     condição de pagamento, percentuais e produtos.
--  2) Loja/associado preenche as quantidades que deseja daquele pedido.
--  3) Central finaliza a negociação, efetua a compra com o fornecedor
--     (impressão/e-mail) e depois confirma o recebimento.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. USUÁRIOS
-- Sempre vinculado a um associado (loja/cliente), exceto quando é
-- administrador da Central (associado_id nulo).
-- ---------------------------------------------------------------------
CREATE TABLE classificacoes (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    bmsoft_id         VARCHAR(30)  NULL,          -- ID no sistema BMSoft, se sincronizado
    nome              VARCHAR(100) NOT NULL,      -- ex: Socio, Franqueado
    criado_em         DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE associados (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    bmsoft_id         VARCHAR(30)  NOT NULL,      -- carga obrigatória do sistema BMSoft
    nome              VARCHAR(150) NOT NULL,
    classificacao_id  INT NULL,
    ativo             TINYINT(1)   NOT NULL DEFAULT 1,
    sincronizado_em   DATETIME     DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_associado_bmsoft (bmsoft_id),
    KEY idx_associado_classificacao (classificacao_id),
    CONSTRAINT fk_associado_classificacao FOREIGN KEY (classificacao_id)
        REFERENCES classificacoes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE usuarios (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    nome_completo     VARCHAR(150) NOT NULL,
    cpf               VARCHAR(14)  NOT NULL,
    email             VARCHAR(150) NOT NULL,      -- também usado como login
    senha_hash        VARCHAR(255) NOT NULL,
    tipo              ENUM('administrador','loja') NOT NULL DEFAULT 'loja',
    associado_id      INT NULL,                   -- loja/cliente vinculado (nulo p/ administrador)
    ativo             TINYINT(1)   NOT NULL DEFAULT 1,
    criado_em         DATETIME     DEFAULT CURRENT_TIMESTAMP,
    atualizado_em     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_usuario_email (email),
    CONSTRAINT fk_usuario_associado FOREIGN KEY (associado_id)
        REFERENCES associados(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 2. CADASTROS OPCIONAIS: FORNECEDORES E PRODUTOS
-- Carregados do BMSoft OU digitados manualmente (uso em cotações com
-- fornecedores novos). "origem" indica de onde veio o registro.
-- ---------------------------------------------------------------------
CREATE TABLE fornecedores (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    bmsoft_id         VARCHAR(30)  NULL,
    descricao         VARCHAR(150) NOT NULL,
    email             VARCHAR(150) NULL,          -- e-mail cadastrado p/ envio da compra
    origem            ENUM('bmsoft','manual') NOT NULL DEFAULT 'manual',
    criado_em         DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE produtos (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    bmsoft_id         VARCHAR(30)   NULL,
    descricao         VARCHAR(200)  NOT NULL,
    unidade           VARCHAR(10)   NOT NULL,     -- SC, LT, KG, etc
    qtd_embalagem     DECIMAL(12,3) NULL,         -- apenas informativo (ex: cx c/ 12 litros)
    preco_estimado    DECIMAL(12,4) NULL,
    origem            ENUM('bmsoft','manual') NOT NULL DEFAULT 'manual',
    criado_em         DATETIME      DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 3. MARCADORES (tags do pedido, ex: "PARCEIRO")
-- ---------------------------------------------------------------------
CREATE TABLE marcadores (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    nome              VARCHAR(50) NOT NULL,
    cor               VARCHAR(20) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 4. PEDIDOS
-- id é usado como "Código" do pedido (ex: 19412). Ajuste o
-- AUTO_INCREMENT inicial ao final do script conforme a numeração
-- que já está em uso hoje.
-- ---------------------------------------------------------------------
CREATE TABLE pedidos (
    id                          INT AUTO_INCREMENT PRIMARY KEY,
    nome                        VARCHAR(200) NOT NULL,
    situacao                    ENUM(
                                    'em_elaboracao',        -- criando, ainda não liberado
                                    'liberado_loja',        -- disponível para loja preencher
                                    'indisponivel',         -- "Tornar Indisponível"
                                    'aguardando_fechamento',
                                    'encerrado_com_volume',
                                    'encerrado_sem_volume'
                                ) NOT NULL DEFAULT 'em_elaboracao',
    fornecedor_id               INT NULL,
    fornecedor_manual           VARCHAR(150) NULL,     -- quando digitado sem estar cadastrado
    data_fechamento             DATETIME NOT NULL,     -- data/horário programado de fechamento
    percentual_padrao           DECIMAL(6,2) NULL,     -- acréscimo padrão (sócio x franqueado)
    observacao_associado        TEXT NULL,             -- rich text exibido à loja
    observacao_fornecedor       TEXT NULL,
    observacao_individual       TEXT NULL,             -- observação individual por fornecedor
    usar_mesma_observacao       TINYINT(1) NOT NULL DEFAULT 0,
    solicitar_avaliacao_compra  TINYINT(1) NOT NULL DEFAULT 0,
    mostrar_valor_economizado   TINYINT(1) NOT NULL DEFAULT 0,
    compra_efetuada             TINYINT(1) NOT NULL DEFAULT 0,
    data_compra_efetuada        DATETIME NULL,
    criado_por                  INT NULL,              -- usuário administrador
    duplicado_de_pedido_id      INT NULL,              -- rastreia origem de "Duplicar"
    criado_em                   DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em               DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_pedido_situacao (situacao),
    KEY idx_pedido_fechamento (data_fechamento),
    CONSTRAINT fk_pedido_fornecedor FOREIGN KEY (fornecedor_id)
        REFERENCES fornecedores(id),
    CONSTRAINT fk_pedido_criador FOREIGN KEY (criado_por)
        REFERENCES usuarios(id),
    CONSTRAINT fk_pedido_origem FOREIGN KEY (duplicado_de_pedido_id)
        REFERENCES pedidos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE pedido_marcadores (
    pedido_id     INT NOT NULL,
    marcador_id   INT NOT NULL,
    PRIMARY KEY (pedido_id, marcador_id),
    CONSTRAINT fk_pm_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_pm_marcador FOREIGN KEY (marcador_id) REFERENCES marcadores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Permite mais de uma condição de pagamento/percentual por pedido,
-- cada uma podendo valer para um grupo (classificação) diferente ou
-- para "Todos" (classificacao_id = NULL).
CREATE TABLE pedido_condicoes_pagamento (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id         INT NOT NULL,
    condicao_pagamento VARCHAR(100) NOT NULL,     -- ex: 30/60dd
    percentual        DECIMAL(6,2) NOT NULL DEFAULT 0,
    valor_minimo      DECIMAL(12,2) NULL,
    classificacao_id  INT NULL,                   -- NULL = "Todos"
    ordem             INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_pcp_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_pcp_classificacao FOREIGN KEY (classificacao_id) REFERENCES classificacoes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Quando o pedido é aberto para uma classificação inteira (família de
-- associados), guardamos aqui qual(is) classificação(ões) foi usada.
CREATE TABLE pedido_grupos (
    pedido_id         INT NOT NULL,
    classificacao_id  INT NOT NULL,
    PRIMARY KEY (pedido_id, classificacao_id),
    CONSTRAINT fk_pg_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_pg_classificacao FOREIGN KEY (classificacao_id) REFERENCES classificacoes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Associados (lojas/clientes) efetivamente vinculados ao pedido.
-- Permite que o administrador desmarque um associado individualmente
-- mesmo que ele tenha entrado via seleção de grupo/classificação.
-- Também guarda o rastro de preenchimento/rejeição pedido pela loja.
CREATE TABLE pedido_associados (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id         INT NOT NULL,
    associado_id      INT NOT NULL,
    incluido_via      ENUM('grupo','individual') NOT NULL DEFAULT 'individual',
    situacao          ENUM('pendente','preenchido','rejeitado') NOT NULL DEFAULT 'pendente',
    data_acao         DATETIME NULL,          -- data/horário do preenchimento ou rejeição
    usuario_acao_id   INT NULL,               -- usuário da loja que realizou a ação
    criado_em         DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_pedido_associado (pedido_id, associado_id),
    CONSTRAINT fk_pa_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_pa_associado FOREIGN KEY (associado_id) REFERENCES associados(id),
    CONSTRAINT fk_pa_usuario FOREIGN KEY (usuario_acao_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 5. ITENS DO PEDIDO E QUANTIDADES PREENCHIDAS PELA LOJA
-- ---------------------------------------------------------------------
CREATE TABLE pedido_itens (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id         INT NOT NULL,
    produto_id        INT NULL,               -- nulo se produto digitado sem cadastro
    descricao         VARCHAR(200) NOT NULL,  -- snapshot da descrição no momento do pedido
    unidade           VARCHAR(10) NOT NULL,
    qtd_embalagem     DECIMAL(12,3) NULL,     -- "Qtde múltiplo"
    preco_compra      DECIMAL(12,4) NOT NULL,
    limite_maximo     DECIMAL(12,3) NULL,     -- ex: "Máx: 75"
    limite_logistica  DECIMAL(12,3) NULL,     -- ex: "Logística: 75"
    ordem             INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_item_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_item_produto FOREIGN KEY (produto_id) REFERENCES produtos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Quantidade que cada loja/associado preencheu para cada item.
CREATE TABLE pedido_item_quantidades (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    pedido_item_id        INT NOT NULL,
    pedido_associado_id   INT NOT NULL,
    quantidade            DECIMAL(12,3) NOT NULL DEFAULT 0,
    atualizado_em         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_item_associado (pedido_item_id, pedido_associado_id),
    CONSTRAINT fk_piq_item FOREIGN KEY (pedido_item_id)
        REFERENCES pedido_itens(id) ON DELETE CASCADE,
    CONSTRAINT fk_piq_associado FOREIGN KEY (pedido_associado_id)
        REFERENCES pedido_associados(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 6. ARQUIVOS ANEXOS AO PEDIDO (aba "Arquivos")
-- ---------------------------------------------------------------------
CREATE TABLE pedido_arquivos (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id         INT NOT NULL,
    nome_arquivo      VARCHAR(255) NOT NULL,
    caminho_arquivo   VARCHAR(500) NOT NULL,
    enviado_por       INT NULL,
    criado_em         DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_arquivo_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_arquivo_usuario FOREIGN KEY (enviado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 7. HISTÓRICO / LOG DE AÇÕES DO PEDIDO
-- Registra fechamento programado, preenchimento, rejeição, alteração
-- de situação, compra efetuada etc — sempre com data/hora e usuário.
-- ---------------------------------------------------------------------
CREATE TABLE pedido_log (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id             INT NOT NULL,
    pedido_associado_id   INT NULL,
    acao                  VARCHAR(100) NOT NULL,  -- 'preenchimento','rejeicao','fechamento_programado', etc
    usuario_id            INT NULL,
    data_acao             DATETIME DEFAULT CURRENT_TIMESTAMP,
    observacao            TEXT NULL,
    CONSTRAINT fk_log_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_log_pa FOREIGN KEY (pedido_associado_id) REFERENCES pedido_associados(id),
    CONSTRAINT fk_log_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 8. EFETUAR COMPRA COM O FORNECEDOR
-- Registra cada envio (por e-mail cadastrado ou digitação livre,
-- quando é apenas cotação).
-- ---------------------------------------------------------------------
CREATE TABLE compras_fornecedor (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id         INT NOT NULL,
    fornecedor_id     INT NULL,
    email_envio       VARCHAR(150) NULL,
    tipo_envio        ENUM('email_cadastrado','digitacao_livre') NOT NULL DEFAULT 'email_cadastrado',
    apenas_cotacao    TINYINT(1) NOT NULL DEFAULT 0,
    data_envio        DATETIME DEFAULT CURRENT_TIMESTAMP,
    usuario_id        INT NULL,
    CONSTRAINT fk_compra_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_compra_fornecedor FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id),
    CONSTRAINT fk_compra_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 9. CONFIRMAÇÃO DE RECEBIMENTO (pelo administrador, por associado)
-- ---------------------------------------------------------------------
CREATE TABLE recebimentos (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id             INT NOT NULL,
    pedido_associado_id   INT NOT NULL,
    data_compra           DATE NULL,
    situacao_entrega      ENUM('pendente','confirmado','divergencia') NOT NULL DEFAULT 'pendente',
    observacao            TEXT NULL,          -- ex: entrega parcial, produto avariado
    confirmado_por        INT NULL,
    confirmado_em         DATETIME NULL,
    criado_em             DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_receb_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    CONSTRAINT fk_receb_pa FOREIGN KEY (pedido_associado_id) REFERENCES pedido_associados(id),
    CONSTRAINT fk_receb_usuario FOREIGN KEY (confirmado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- AJUSTE FINAL: numeração inicial dos pedidos
-- Os prints do documento mostram códigos como 19412, 19424, 19437 —
-- ajuste o valor abaixo para continuar a numeração já usada hoje.
-- =====================================================================
-- ALTER TABLE pedidos AUTO_INCREMENT = 19400;

-- =====================================================================
-- SEEDS DE APOIO (opcional, ajustar conforme sua base real)
-- =====================================================================
INSERT INTO classificacoes (nome) VALUES ('Socio'), ('Franqueado');

INSERT INTO marcadores (nome, cor) VALUES ('PARCEIRO', '#0EA5E9');
