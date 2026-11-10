
const db = require('../src/config/database');

// Criar uma notificação
const criar = async (dados) => {
    const {
        utilizador_id,
        titulo,
        mensagem,
        canal = 'sistema',
        estado_envio = 'enviada'
    } = dados;

    const [resultado] = await db.query(
        `INSERT INTO notificacao
        (utilizador_id, titulo, mensagem, canal, estado_envio)
        VALUES (?, ?, ?, ?, ?)`,
        [utilizador_id, titulo, mensagem, canal, estado_envio]
    );

    return resultado.insertId;
};

// Listar notificações de um utilizador
const listarPorUtilizador = async (utilizadorId) => {
    const [resultado] = await db.query(
        `SELECT *
         FROM notificacao
         WHERE utilizador_id = ?
         ORDER BY data_criacao DESC`,
        [utilizadorId]
    );

    return resultado;
};

// Consultar uma notificação
const procurarPorId = async (id) => {
    const [resultado] = await db.query(
        `SELECT *
         FROM notificacao
         WHERE id = ?`,
        [id]
    );

    return resultado[0] || null;
};

// Marcar notificação como lida
const marcarComoLida = async (id, utilizadorId) => {
    const [resultado] = await db.query(
        `UPDATE notificacao
         SET lida = 1
         WHERE id = ? AND utilizador_id = ?`,
        [id, utilizadorId]
    );

    return resultado.affectedRows;
};

// Contar notificações não lidas
const contarNaoLidas = async (utilizadorId) => {
    const [resultado] = await db.query(
        `SELECT COUNT(*) AS total
         FROM notificacao
         WHERE utilizador_id = ? AND lida = 0`,
        [utilizadorId]
    );

    return resultado[0].total;
};

module.exports = {
    criar,
    listarPorUtilizador,
    procurarPorId,
    marcarComoLida,
    contarNaoLidas
};
