
const db = require('../src/config/database');

// Listar todas as multas
const listarTodas = async () => {
    const [multas] = await db.query(`
        SELECT
            m.*,
            a.data_prevista_devolucao,
            a.data_devolucao_real,
            r.cliente_id,
            r.tema_id,
            u.nome AS cliente_nome,
            u.email AS cliente_email,
            t.nome AS tema_nome
        FROM multa m
        INNER JOIN aluguer a ON m.aluguer_id = a.id
        INNER JOIN reserva r ON a.reserva_id = r.id
        INNER JOIN utilizador u ON r.cliente_id = u.id
        INNER JOIN tema t ON r.tema_id = t.id
        ORDER BY m.id DESC
    `);

    return multas;
};

// Consultar uma multa pelo ID
const procurarPorId = async (id) => {
    const [multas] = await db.query(`
        SELECT
            m.*,
            a.data_prevista_devolucao,
            a.data_devolucao_real,
            r.cliente_id,
            r.tema_id,
            u.nome AS cliente_nome,
            u.email AS cliente_email,
            u.telefone AS cliente_telefone,
            t.nome AS tema_nome
        FROM multa m
        INNER JOIN aluguer a ON m.aluguer_id = a.id
        INNER JOIN reserva r ON a.reserva_id = r.id
        INNER JOIN utilizador u ON r.cliente_id = u.id
        INNER JOIN tema t ON r.tema_id = t.id
        WHERE m.id = ?
    `, [id]);

    return multas[0];
};

// Listar multas de um cliente
const listarPorCliente = async (clienteId) => {
    const [multas] = await db.query(`
        SELECT
            m.*,
            a.data_prevista_devolucao,
            a.data_devolucao_real,
            t.nome AS tema_nome
        FROM multa m
        INNER JOIN aluguer a ON m.aluguer_id = a.id
        INNER JOIN reserva r ON a.reserva_id = r.id
        INNER JOIN tema t ON r.tema_id = t.id
        WHERE r.cliente_id = ?
        ORDER BY m.id DESC
    `, [clienteId]);

    return multas;
};

// Procurar multa associada a um aluguer
const procurarPorAluguer = async (aluguerId, conexao = db) => {
    const [multas] = await conexao.query(`
        SELECT *
        FROM multa
        WHERE aluguer_id = ?
    `, [aluguerId]);

    return multas[0];
};

// Verificar se o cliente tem multas pendentes
const temMultasPendentes = async (clienteId, conexao = db) => {
    const [multas] = await conexao.query(`
        SELECT COUNT(*) AS total
        FROM multa m
        INNER JOIN aluguer a ON m.aluguer_id = a.id
        INNER JOIN reserva r ON a.reserva_id = r.id
        WHERE r.cliente_id = ?
        AND m.estado = 'pendente'
    `, [clienteId]);

    return Number(multas[0].total) > 0;
};

// Criar multa
const criar = async (dados, conexao = db) => {
    const { aluguer_id, motivo, valor } = dados;

    const [resultado] = await conexao.query(`
        INSERT INTO multa (
            aluguer_id,
            motivo,
            valor
        )
        VALUES (?, ?, ?)
    `, [aluguer_id, motivo, valor]);

    return resultado.insertId;
};

// Registar o pagamento de uma multa pendente
const registarPagamento = async (id, formaPagamento, conexao = db) => {
    const [resultado] = await conexao.query(`
        UPDATE multa
        SET estado = 'paga',
            data_pagamento = NOW(),
            forma_pagamento = ?
        WHERE id = ?
          AND estado = 'pendente'
    `, [formaPagamento, id]);

    return resultado.affectedRows;
};

// Anular uma multa pendente
const anular = async (id, conexao = db) => {
    const [resultado] = await conexao.query(`
        UPDATE multa
        SET estado = 'anulada'
        WHERE id = ?
          AND estado = 'pendente'
    `, [id]);

    return resultado.affectedRows;
};

// Listar multas pendentes com os dados do cliente (tela Pagamento de multas)
const listarPendentes = async () => {
    const [multas] = await db.query(`
        SELECT
            m.*,
            a.data_prevista_devolucao,
            a.data_devolucao_real,
            r.cliente_id,
            u.nome AS cliente_nome,
            u.email AS cliente_email,
            u.telefone AS cliente_telefone,
            u.foto AS cliente_foto,
            t.nome AS tema_nome
        FROM multa m
        INNER JOIN aluguer a ON m.aluguer_id = a.id
        INNER JOIN reserva r ON a.reserva_id = r.id
        INNER JOIN utilizador u ON r.cliente_id = u.id
        INNER JOIN tema t ON r.tema_id = t.id
        WHERE m.estado = 'pendente'
        ORDER BY m.criado_em ASC
    `);

    return multas;
};


// Identificar alugueres que devem receber multa
const buscarAlugueresParaMulta = async () => {
    const [alugueres] = await db.query(`
        SELECT
            a.id AS aluguer_id,
            a.data_prevista_devolucao,
            r.cliente_id,
            u.nome AS cliente_nome,
            t.nome AS tema_nome
        FROM aluguer a
        INNER JOIN reserva r
            ON a.reserva_id = r.id
        INNER JOIN utilizador u
            ON r.cliente_id = u.id
        INNER JOIN tema t
            ON r.tema_id = t.id
        LEFT JOIN multa m
            ON m.aluguer_id = a.id
        WHERE a.estado IN ('ativo', 'atrasado')
          AND a.data_devolucao_real IS NULL
          AND a.data_prevista_devolucao <= DATE_SUB(NOW(), INTERVAL 48 HOUR)
          AND m.id IS NULL
    `);

    return alugueres;
};


module.exports = {
    listarTodas,
    procurarPorId,
    listarPorCliente,
    procurarPorAluguer,
    temMultasPendentes,
    criar,
    registarPagamento,
    anular,
    listarPendentes,
    buscarAlugueresParaMulta

};
