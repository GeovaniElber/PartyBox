
const db = require('../src/config/database');

// Listar todas as reservas
const listarTodas = async () => {
    const [reservas] = await db.query(`
        SELECT
            r.*,
            u.nome AS cliente_nome,
            t.nome AS tema_nome
        FROM reserva r
        INNER JOIN utilizador u ON r.cliente_id = u.id
        INNER JOIN tema t ON r.tema_id = t.id
        ORDER BY r.id DESC
    `);

    return reservas;
};

// Consultar reserva pelo ID
const procurarPorId = async (id) => {
    const [reservas] = await db.query(`
        SELECT
            r.*,
            u.nome AS cliente_nome,
            t.nome AS tema_nome
        FROM reserva r
        INNER JOIN utilizador u ON r.cliente_id = u.id
        INNER JOIN tema t ON r.tema_id = t.id
        WHERE r.id = ?
    `, [id]);

    return reservas[0];
};

// Listar reservas de um cliente
const listarPorCliente = async (clienteId) => {
    const [reservas] = await db.query(`
        SELECT
            r.*,
            t.nome AS tema_nome,
            t.imagem AS tema_imagem,
            t.preco AS tema_preco
        FROM reserva r
        INNER JOIN tema t ON r.tema_id = t.id
        WHERE r.cliente_id = ?
        ORDER BY r.data_inicio DESC
    `, [clienteId]);

    return reservas;
};

// Verificar conflitos de datas para o mesmo tema
const verificarConflito = async (temaId, dataInicio, dataFim, conexao = db) => {
    const [reservas] = await conexao.query(`
        SELECT id
        FROM reserva
        WHERE tema_id = ?
          AND estado IN ('pendente', 'confirmada')
          AND data_inicio <= ?
          AND data_fim >= ?
        LIMIT 1
    `, [temaId, dataFim, dataInicio]);

    return reservas.length > 0;
};

// Criar reserva
const criar = async (dados, conexao = db) => {
    const {
        cliente_id,
        tema_id,
        data_inicio,
        data_fim
    } = dados;

    const [resultado] = await conexao.query(`
        INSERT INTO reserva (
            cliente_id,
            tema_id,
            data_inicio,
            data_fim
        )
        VALUES (?, ?, ?, ?)
    `, [cliente_id, tema_id, data_inicio, data_fim]);

    return resultado.insertId;
};

// Atualizar estado da reserva
const atualizarEstado = async (id, estado, conexao = db) => {
    const [resultado] = await conexao.query(`
        UPDATE reserva
        SET estado = ?
        WHERE id = ?
    `, [estado, id]);

    return resultado.affectedRows;
};

module.exports = {
    listarTodas,
    procurarPorId,
    listarPorCliente,
    verificarConflito,
    criar,
    atualizarEstado
};
