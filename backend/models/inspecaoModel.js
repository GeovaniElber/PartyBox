
const db = require('../src/config/database');

// Registar uma inspeção
const criar = async (dados, conexao = db) => {
    const {
        aluguer_id,
        funcionario_id,
        momento,
        estado,
        observacoes
    } = dados;

    const [resultado] = await conexao.query(`
        INSERT INTO inspecao (
            aluguer_id,
            funcionario_id,
            momento,
            estado,
            observacoes
        )
        VALUES (?, ?, ?, ?, ?)
    `, [
        aluguer_id,
        funcionario_id,
        momento,
        estado,
        observacoes || null
    ]);

    return resultado.insertId;
};

// Consultar inspeções de um aluguer
const listarPorAluguer = async (aluguerId, conexao = db) => {
    const [inspecoes] = await conexao.query(`
        SELECT
            i.*,
            u.nome AS funcionario_nome
        FROM inspecao i
        INNER JOIN utilizador u
            ON i.funcionario_id = u.id
        WHERE i.aluguer_id = ?
        ORDER BY i.id ASC
    `, [aluguerId]);

    return inspecoes;
};

// Listar todas as inspeções
const listarTodas = async () => {
    const [inspecoes] = await db.query(`
        SELECT
            i.*,
            u.nome AS funcionario_nome,
            a.reserva_id
        FROM inspecao i
        INNER JOIN utilizador u
            ON i.funcionario_id = u.id
        INNER JOIN aluguer a
            ON i.aluguer_id = a.id
        ORDER BY i.id DESC
    `);

    return inspecoes;
};

module.exports = {
    criar,
    listarPorAluguer,
    listarTodas
};
