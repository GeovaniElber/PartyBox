
const db = require('../src/config/database');

// Listar reservas (opcionalmente por estado), com os dados do cliente
const listarTodas = async (estado = null) => {
    const [reservas] = await db.query(`
        SELECT
            r.*,
            u.nome AS cliente_nome,
            u.email AS cliente_email,
            u.telefone AS cliente_telefone,
            u.foto AS cliente_foto,
            t.nome AS tema_nome,
            t.imagem AS tema_imagem,
            t.preco AS tema_preco,
            (DATEDIFF(r.data_fim, r.data_inicio) + 1) * t.preco AS valor_previsto,
            le.id AS lista_espera_id
        FROM reserva r
        INNER JOIN utilizador u ON r.cliente_id = u.id
        INNER JOIN tema t ON r.tema_id = t.id
        LEFT JOIN lista_espera le ON le.reserva_id = r.id
        ${estado ? 'WHERE r.estado = ?' : ''}
        ORDER BY ${estado === 'pendente' ? 'r.criado_em ASC' : 'r.id DESC'}
    `, estado ? [estado] : []);

    return reservas;
};

// Consultar reserva pelo ID
const procurarPorId = async (id) => {
    const [reservas] = await db.query(`
        SELECT
            r.*,
            u.nome AS cliente_nome,
            u.email AS cliente_email,
            u.telefone AS cliente_telefone,
            t.nome AS tema_nome,
            t.preco AS tema_preco
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

// Verificar conflitos de datas para o mesmo tema.
// Conta as reservas pendentes ou confirmadas e as ofertas ativas da lista de espera
// (datas guardadas para outro cliente). clienteId exclui as ofertas feitas ao próprio cliente.
const verificarConflito = async (temaId, dataInicio, dataFim, conexao = db, clienteId = 0) => {
    const [ocupadas] = await conexao.query(`
        SELECT id
        FROM reserva
        WHERE tema_id = ?
          AND estado IN ('pendente', 'confirmada')
          AND data_inicio <= ?
          AND data_fim >= ?
        UNION ALL
        SELECT id
        FROM lista_espera
        WHERE tema_id = ?
          AND estado = 'contactado'
          AND oferta_expira_em > NOW()
          AND cliente_id <> ?
          AND data_inicio <= ?
          AND data_fim >= ?
        LIMIT 1
    `, [temaId, dataFim, dataInicio, temaId, clienteId, dataFim, dataInicio]);

    return ocupadas.length > 0;
};

// Períodos ocupados de um tema entre duas datas (calendário do tema),
// com o número de pedidos na lista de espera para cada período.
const listarOcupacao = async (temaId, dataInicio, dataFim) => {
    const [periodos] = await db.query(`
        SELECT
            o.data_inicio,
            o.data_fim,
            (
                SELECT COUNT(*)
                FROM lista_espera le
                WHERE le.tema_id = ?
                  AND le.estado IN ('aguarda', 'contactado')
                  AND le.data_inicio <= o.data_fim
                  AND le.data_fim >= o.data_inicio
            ) AS na_fila
        FROM (
            SELECT data_inicio, data_fim
            FROM reserva
            WHERE tema_id = ?
              AND estado IN ('pendente', 'confirmada')
              AND data_inicio <= ?
              AND data_fim >= ?
            UNION ALL
            SELECT data_inicio, data_fim
            FROM lista_espera
            WHERE tema_id = ?
              AND estado = 'contactado'
              AND oferta_expira_em > NOW()
              AND data_inicio <= ?
              AND data_fim >= ?
        ) o
        ORDER BY o.data_inicio
    `, [temaId, temaId, dataFim, dataInicio, temaId, dataFim, dataInicio]);

    return periodos;
};

// Temas ocupados num dia (catálogo: "Livre/Ocupado a dd/mm")
const listarTemasOcupadosNoDia = async (data) => {
    const [linhas] = await db.query(`
        SELECT DISTINCT tema_id
        FROM reserva
        WHERE estado IN ('pendente', 'confirmada')
          AND data_inicio <= ?
          AND data_fim >= ?
        UNION
        SELECT DISTINCT tema_id
        FROM lista_espera
        WHERE estado = 'contactado'
          AND oferta_expira_em > NOW()
          AND data_inicio <= ?
          AND data_fim >= ?
    `, [data, data, data, data]);

    return linhas.map((l) => Number(l.tema_id));
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
    listarOcupacao,
    listarTemasOcupadosNoDia,
    criar,
    atualizarEstado
};
