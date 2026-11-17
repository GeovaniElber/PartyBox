-- =====================================================================
-- PartyBox · Esquema completo (instalação nova)
-- Para uma base de dados que já existe, usa ajuste_v3.sql.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS partybox
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE partybox;

CREATE TABLE utilizador (
    id INT NOT NULL AUTO_INCREMENT,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    senha_hash VARCHAR(100) NOT NULL,
    tipo ENUM('cliente', 'funcionario', 'administrador') NOT NULL,
    telefone VARCHAR(20) DEFAULT NULL,
    foto VARCHAR(255) DEFAULT NULL,
    ativo TINYINT(1) DEFAULT 1,
    reset_token_hash VARCHAR(255) DEFAULT NULL,
    reset_expira_em DATETIME DEFAULT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY email (email),
    KEY idx_utilizador_reset (reset_token_hash),
    -- Os clientes têm sempre fotografia (confirma a identidade no levantamento)
    CONSTRAINT chk_cliente_foto CHECK (tipo <> 'cliente' OR foto IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tema (
    id INT NOT NULL AUTO_INCREMENT,
    nome VARCHAR(100) NOT NULL,
    categoria VARCHAR(50) NOT NULL DEFAULT 'Crianças',
    descricao TEXT,
    pecas TEXT,
    preco DECIMAL(10, 2) NOT NULL,
    imagem VARCHAR(255) DEFAULT NULL,
    estado ENUM('ativo', 'alugado', 'reservado', 'manutencao', 'inativo') NOT NULL DEFAULT 'ativo',
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tema_imagem (
    id INT NOT NULL AUTO_INCREMENT,
    tema_id INT NOT NULL,
    caminho VARCHAR(255) NOT NULL,
    ordem INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY tema_id (tema_id),
    CONSTRAINT tema_imagem_ibfk_1 FOREIGN KEY (tema_id) REFERENCES tema (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reserva (
    id INT NOT NULL AUTO_INCREMENT,
    cliente_id INT NOT NULL,
    tema_id INT NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    estado ENUM('pendente', 'confirmada', 'recusada', 'cancelada', 'concluida') NOT NULL DEFAULT 'pendente',
    motivo_recusa VARCHAR(255) DEFAULT NULL,
    decidida_em DATETIME DEFAULT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_reserva_cliente (cliente_id),
    KEY idx_reserva_tema_datas (tema_id, estado, data_inicio, data_fim),
    CONSTRAINT fk_reserva_cliente FOREIGN KEY (cliente_id) REFERENCES utilizador (id),
    CONSTRAINT fk_reserva_tema FOREIGN KEY (tema_id) REFERENCES tema (id),
    CONSTRAINT chk_reserva_datas CHECK (data_fim >= data_inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE aluguer (
    id INT NOT NULL AUTO_INCREMENT,
    reserva_id INT NOT NULL,
    -- Preenchidos no levantamento, depois da inspeção aprovada
    valor_total DECIMAL(10, 2) DEFAULT NULL,
    forma_pagamento ENUM('numerario', 'multibanco', 'mbway') DEFAULT NULL,
    data_entrega DATETIME DEFAULT NULL,
    data_prevista_devolucao DATETIME NOT NULL,
    data_devolucao_real DATETIME DEFAULT NULL,
    estado ENUM('aguarda_inspecao', 'ativo', 'atrasado', 'devolvido', 'cancelado') NOT NULL DEFAULT 'aguarda_inspecao',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY reserva_id (reserva_id),
    KEY idx_aluguer_estado_prazo (estado, data_prevista_devolucao),
    KEY idx_aluguer_entrega (data_entrega),
    CONSTRAINT fk_aluguer_reserva FOREIGN KEY (reserva_id) REFERENCES reserva (id),
    CONSTRAINT chk_aluguer_datas CHECK (data_prevista_devolucao >= data_entrega)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inspecao (
    id INT NOT NULL AUTO_INCREMENT,
    aluguer_id INT NOT NULL,
    funcionario_id INT NOT NULL,
    momento ENUM('entrega', 'devolucao') NOT NULL,
    estado ENUM('bom', 'danificado', 'incompleto') NOT NULL,
    observacoes TEXT,
    fotos JSON DEFAULT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY aluguer_id (aluguer_id, momento),
    KEY fk_inspecao_funcionario (funcionario_id),
    CONSTRAINT fk_inspecao_aluguer FOREIGN KEY (aluguer_id) REFERENCES aluguer (id),
    CONSTRAINT fk_inspecao_funcionario FOREIGN KEY (funcionario_id) REFERENCES utilizador (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE multa (
    id INT NOT NULL AUTO_INCREMENT,
    aluguer_id INT NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    valor DECIMAL(10, 2) NOT NULL,
    estado ENUM('pendente', 'paga', 'anulada') NOT NULL DEFAULT 'pendente',
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_pagamento DATETIME DEFAULT NULL,
    forma_pagamento ENUM('numerario', 'multibanco', 'mbway') DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_multa_aluguer (aluguer_id),
    KEY idx_multa_pagamento (estado, data_pagamento),
    CONSTRAINT fk_multa_aluguer FOREIGN KEY (aluguer_id) REFERENCES aluguer (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lista_espera (
    id INT NOT NULL AUTO_INCREMENT,
    cliente_id INT NOT NULL,
    tema_id INT NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    estado ENUM('aguarda', 'contactado', 'expirado', 'convertido', 'cancelado') NOT NULL DEFAULT 'aguarda',
    oferta_expira_em DATETIME DEFAULT NULL,
    reserva_id INT DEFAULT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_lista_espera_cliente (cliente_id),
    KEY idx_fila (tema_id, estado, criado_em),
    KEY idx_lista_espera_oferta (estado, oferta_expira_em),
    CONSTRAINT lista_espera_ibfk_1 FOREIGN KEY (cliente_id) REFERENCES utilizador (id),
    CONSTRAINT lista_espera_ibfk_2 FOREIGN KEY (tema_id) REFERENCES tema (id),
    CONSTRAINT fk_lista_espera_reserva FOREIGN KEY (reserva_id) REFERENCES reserva (id),
    CONSTRAINT lista_espera_chk_1 CHECK (data_fim >= data_inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
