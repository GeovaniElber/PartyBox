
const db = require('../src/config/database');

// Listar todos os pedidos da lista de espera
const listarTodas = async () => {
    const [pedidos] = await db.query(`
        SELECT
            le.*,
            u.nome AS cliente_nome,
            u.email AS cliente_email,
            t.nome AS tema_nome
        FROM lista_espera le
        INNER JOIN utilizador u ON le.cliente_id = u.id
        INNER JOIN tema t ON le.tema_id = t.id
        ORDER BY le.criado_em ASC
    `);

    return pedidos;
};

// Listar pedidos de um cliente
const listarPorCliente = async (clienteId) => {
    const [pedidos] = await db.query(`
        SELECT
            le.*,
            t.nome AS tema_nome,
            t.imagem AS tema_imagem,
            t.preco AS tema_preco
        FROM lista_espera le
        INNER JOIN tema t ON le.tema_id = t.id
        WHERE le.cliente_id = ?
        ORDER BY le.criado_em DESC
    `, [clienteId]);

    return pedidos;
};

// Consultar pedido pelo ID
const procurarPorId = async (id) => {
    const [pedidos] = await db.query(`
        SELECT
            le.*,
            u.nome AS cliente_nome,
            u.email AS cliente_email,
            t.nome AS tema_nome
        FROM lista_espera le
        INNER JOIN utilizador u ON le.cliente_id = u.id
        INNER JOIN tema t ON le.tema_id = t.id
        WHERE le.id = ?
        LIMIT 1
    `, [id]);

    return pedidos[0];
};

// Verificar se o cliente já tem um pedido ativo para dias em comum do mesmo tema
const existePedidoAtivo = async (clienteId, temaId, dataInicio, dataFim) => {
    const [pedidos] = await db.query(`
        SELECT id
        FROM lista_espera
        WHERE cliente_id = ?
          AND tema_id = ?
          AND data_inicio <= ?
          AND data_fim >= ?
          AND estado IN ('aguarda', 'contactado')
        LIMIT 1
    `, [clienteId, temaId, dataFim, dataInicio]);

    return pedidos.length > 0;
};

// Criar pedido na lista de espera
const criar = async (dados) => {
    const {
        cliente_id,
        tema_id,
        data_inicio,
        data_fim
    } = dados;

    const [resultado] = await db.query(`
        INSERT INTO lista_espera (
            cliente_id,
            tema_id,
            data_inicio,
            data_fim
        )
        VALUES (?, ?, ?, ?)
    `, [
        cliente_id,
        tema_id,
        data_inicio,
        data_fim
    ]);

    return resultado.insertId;
};

module.exports = {
    listarTodas,
    listarPorCliente,
    procurarPorId,
    existePedidoAtivo,
    criar
};
