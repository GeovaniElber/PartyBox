

-- utilizador: "Cliente desde ..." (a autenticação lê esta coluna)
ALTER TABLE utilizador
    ADD COLUMN criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD INDEX idx_utilizador_reset (reset_token_hash);

-- tema: faixa etária e peças incluídas (usadas na inspeção)
ALTER TABLE tema
    ADD COLUMN categoria VARCHAR(50) NOT NULL DEFAULT 'Crianças' AFTER nome,
    ADD COLUMN pecas TEXT NULL AFTER descricao;

-- reserva: a loja confirma ou recusa (com motivo)
ALTER TABLE reserva
    MODIFY estado ENUM('pendente', 'confirmada', 'recusada', 'cancelada', 'concluida')
        NOT NULL DEFAULT 'pendente',
    ADD COLUMN motivo_recusa VARCHAR(255) NULL,
    ADD COLUMN decidida_em DATETIME NULL;

-- aluguer: o pagamento é registado no fim do levantamento, depois da inspeção.
-- Até lá (estado 'aguarda_inspecao') o valor e a forma de pagamento ficam vazios.
-- 'concluido' sai: um aluguer termina em 'devolvido'.
ALTER TABLE aluguer
    MODIFY valor_total DECIMAL(10, 2) NULL,
    MODIFY forma_pagamento ENUM('numerario', 'multibanco', 'mbway') NULL,
    MODIFY estado ENUM('aguarda_inspecao', 'ativo', 'atrasado', 'devolvido', 'cancelado')
        NOT NULL DEFAULT 'aguarda_inspecao',
    ADD INDEX idx_aluguer_entrega (data_entrega);

-- inspecao: tema devolvido com peças em falta
ALTER TABLE inspecao
    MODIFY estado ENUM('bom', 'danificado', 'incompleto') NOT NULL;

-- multa: uq_multa_aluguer (uma multa por aluguer) já cobre esta chave
ALTER TABLE multa
    DROP INDEX uq_multa_aluguer_motivo,
    MODIFY estado ENUM('pendente', 'paga', 'anulada') NOT NULL DEFAULT 'pendente',
    ADD INDEX idx_multa_pagamento (estado, data_pagamento);

-- lista_espera: a reserva criada quando o cliente aceita a oferta
ALTER TABLE lista_espera
    ADD COLUMN reserva_id INT NULL AFTER oferta_expira_em,
    ADD CONSTRAINT fk_lista_espera_reserva
        FOREIGN KEY (reserva_id) REFERENCES reserva(id),
    ADD INDEX idx_lista_espera_oferta (estado, oferta_expira_em);
