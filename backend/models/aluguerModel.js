
const db = require('../src/config/database');

// Listar todos os alugueres
const listarTodas = async () => {
    const [alugueres] = await db.query(`
        SELECT
            a.*,
            r.cliente_id,
            r.tema_id,
            u.nome AS cliente_nome,
            t.nome AS tema_nome
        FROM aluguer a
        INNER JOIN reserva r ON a.reserva_id = r.id
        INNER JOIN utilizador u ON r.cliente_id = u.id
        INNER JOIN tema t ON r.tema_id = t.id
        ORDER BY a.id DESC
    `);

    return alugueres;
};

// Consultar aluguer pelo ID
const procurarPorId = async (id, conexao = db) => {
    const [alugueres] = await conexao.query(`
        SELECT
            a.*,
            r.cliente_id,
            r.tema_id,
            u.nome AS cliente_nome,
            t.nome AS tema_nome
        FROM aluguer a
        INNER JOIN reserva r ON a.reserva_id = r.id
        INNER JOIN utilizador u ON r.cliente_id = u.id
        INNER JOIN tema t ON r.tema_id = t.id
        WHERE a.id = ?
    `, [id]);

    return alugueres[0];
};

// Listar alugueres de um cliente
const listarPorCliente = async (clienteId, conexao = db) => {
    const [alugueres] = await conexao.query(`
        SELECT
            a.*,
            t.nome AS tema_nome,
            t.imagem AS tema_imagem,
            t.preco AS tema_preco
        FROM aluguer a
        INNER JOIN reserva r ON a.reserva_id = r.id
        INNER JOIN tema t ON r.tema_id = t.id
        WHERE r.cliente_id = ?
        ORDER BY a.data_entrega DESC
    `, [clienteId]);

    return alugueres;
};

// Listar alugueres ativos
const listarAtivos = async () => {
    const [alugueres] = await db.query(`
        SELECT
            a.*,
            r.cliente_id,
            r.tema_id,
            u.nome AS cliente_nome,
            u.telefone AS cliente_telefone,
            u.foto AS cliente_foto,
            t.nome AS tema_nome,
            t.pecas AS tema_pecas,
            TIMESTAMPDIFF(HOUR, a.data_prevista_devolucao, NOW()) AS horas_atraso,
            (SELECT COUNT(*) FROM lista_espera le
              WHERE le.tema_id = r.tema_id AND le.estado IN ('aguarda', 'contactado')) AS na_lista_espera
        FROM aluguer a
        INNER JOIN reserva r ON a.reserva_id = r.id
        INNER JOIN utilizador u ON r.cliente_id = u.id
        INNER JOIN tema t ON r.tema_id = t.id
        WHERE a.estado IN ('ativo', 'atrasado')
        ORDER BY a.data_prevista_devolucao ASC
    `);

    return alugueres;
};

// Procurar aluguer através da reserva
const procurarPorReserva = async (reservaId, conexao = db) => {
    const [alugueres] = await conexao.query(`
        SELECT *
        FROM aluguer
        WHERE reserva_id = ?
    `, [reservaId]);

    return alugueres[0];
};

// Criar aluguer
const criar = async (dados, conexao = db) => {
    const {
        reserva_id,
        data_entrega,
        data_prevista_devolucao
    } = dados;

    const [resultado] = await conexao.query(`
        INSERT INTO aluguer (
            reserva_id,
            data_entrega,
            data_prevista_devolucao
        )
        VALUES (?, ?, ?)
    `, [
        reserva_id,
        data_entrega,
        data_prevista_devolucao
    ]);

    return resultado.insertId;
};

// Registar devolução do aluguer
const registarDevolucao = async (id, dataDevolucao, conexao = db) => {
    const [resultado] = await conexao.query(`
        UPDATE aluguer
        SET
            data_devolucao_real = ?,
            estado = 'devolvido'
        WHERE id = ?
          AND estado = 'ativo'
    `, [dataDevolucao, id]);

    return resultado.affectedRows;
};

module.exports = {
    listarTodas,
    procurarPorId,
    listarPorCliente,
    listarAtivos,
    procurarPorReserva,
    criar,
    registarDevolucao
};
