const db = require('../src/config/database');

// Receitas da loja: alugueres pagos (no levantamento) + multas pagas.
// Cada linha tem o dia e o valor.
const RECEITAS = `
    SELECT DATE(data_entrega) AS dia, valor_total AS valor
    FROM aluguer
    WHERE valor_total IS NOT NULL
      AND estado <> 'cancelado'
    UNION ALL
    SELECT DATE(data_pagamento) AS dia, valor
    FROM multa
    WHERE estado = 'paga'
      AND data_pagamento IS NOT NULL
`;

// Totais de faturação: hoje, mês atual e médias
const faturacao = async () => {
    const [[totais]] = await db.query(`
        SELECT
            COALESCE(SUM(CASE WHEN r.dia = CURDATE() THEN r.valor END), 0) AS hoje,
            COALESCE(SUM(CASE WHEN r.dia >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN r.valor END), 0) AS mes,
            COALESCE(SUM(CASE
                WHEN r.dia >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 12 MONTH)
                 AND r.dia < DATE_FORMAT(CURDATE(), '%Y-%m-01')
                THEN r.valor END), 0) AS ultimos_12_meses,
            MIN(r.dia) AS primeira_receita
        FROM (${RECEITAS}) r
    `);

    return totais;
};

// Faturação por dia (últimos N dias)
const faturacaoPorDia = async (dias) => {
    const [linhas] = await db.query(`
        SELECT DATE_FORMAT(r.dia, '%Y-%m-%d') AS dia, SUM(r.valor) AS valor
        FROM (${RECEITAS}) r
        WHERE r.dia > DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY r.dia
    `, [dias]);

    return linhas;
};

// Faturação por mês (últimos N meses, incluindo o atual)
const faturacaoPorMes = async (meses) => {
    const [linhas] = await db.query(`
        SELECT DATE_FORMAT(r.dia, '%Y-%m') AS mes, SUM(r.valor) AS valor
        FROM (${RECEITAS}) r
        WHERE r.dia >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH)
        GROUP BY DATE_FORMAT(r.dia, '%Y-%m')
    `, [meses - 1]);

    return linhas;
};

// Contadores das tarefas de hoje
const contadores = async () => {
    const [[linha]] = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM reserva WHERE estado = 'pendente') AS reservas_pendentes,
            (SELECT COUNT(*)
               FROM reserva r
               LEFT JOIN aluguer a ON a.reserva_id = r.id
              WHERE r.estado = 'confirmada'
                AND r.data_inicio = CURDATE()
                AND (a.id IS NULL OR a.estado = 'aguarda_inspecao')) AS levantamentos_hoje,
            (SELECT COUNT(*)
               FROM aluguer
              WHERE estado = 'atrasado'
                 OR (estado = 'ativo' AND DATE(data_prevista_devolucao) <= CURDATE())) AS devolucoes_hoje,
            (SELECT COUNT(*) FROM multa WHERE estado = 'pendente') AS multas_pendentes,
            (SELECT COUNT(*) FROM aluguer WHERE estado IN ('ativo', 'atrasado')) AS temas_alugados,
            (SELECT COUNT(DISTINCT r.cliente_id)
               FROM multa m
               INNER JOIN aluguer a ON m.aluguer_id = a.id
               INNER JOIN reserva r ON a.reserva_id = r.id
              WHERE m.estado = 'pendente') AS clientes_multados
    `);

    return Object.fromEntries(Object.entries(linha).map(([k, v]) => [k, Number(v)]));
};

// Clientes com multas por pagar, agrupados
const clientesMultados = async () => {
    const [linhas] = await db.query(`
        SELECT
            u.id AS cliente_id,
            u.nome AS cliente_nome,
            u.telefone AS cliente_telefone,
            u.foto AS cliente_foto,
            COUNT(m.id) AS multas,
            SUM(m.valor) AS valor_total,
            MIN(m.criado_em) AS desde,
            GROUP_CONCAT(DISTINCT t.nome ORDER BY t.nome SEPARATOR ', ') AS temas
        FROM multa m
        INNER JOIN aluguer a ON m.aluguer_id = a.id
        INNER JOIN reserva r ON a.reserva_id = r.id
        INNER JOIN utilizador u ON r.cliente_id = u.id
        INNER JOIN tema t ON r.tema_id = t.id
        WHERE m.estado = 'pendente'
        GROUP BY u.id, u.nome, u.telefone, u.foto
        ORDER BY desde ASC
    `);

    return linhas;
};

// Últimos acontecimentos da loja (feed do painel de controlo)
const atividadeRecente = async (limite = 10) => {
    const [linhas] = await db.query(`
        SELECT * FROM (
            SELECT 'reserva' AS tipo, r.criado_em AS quando,
                   CONCAT('Novo pedido de reserva: ', t.nome, ' · ', u.nome) AS texto
            FROM reserva r
            INNER JOIN tema t ON r.tema_id = t.id
            INNER JOIN utilizador u ON r.cliente_id = u.id
            UNION ALL
            SELECT 'aluguer', a.data_entrega,
                   CONCAT('Tema entregue: ', t.nome, ' · ', u.nome)
            FROM aluguer a
            INNER JOIN reserva r ON a.reserva_id = r.id
            INNER JOIN tema t ON r.tema_id = t.id
            INNER JOIN utilizador u ON r.cliente_id = u.id
            WHERE a.valor_total IS NOT NULL
            UNION ALL
            SELECT 'devolucao', a.data_devolucao_real,
                   CONCAT('Tema devolvido: ', t.nome, ' · ', u.nome)
            FROM aluguer a
            INNER JOIN reserva r ON a.reserva_id = r.id
            INNER JOIN tema t ON r.tema_id = t.id
            INNER JOIN utilizador u ON r.cliente_id = u.id
            WHERE a.data_devolucao_real IS NOT NULL
            UNION ALL
            SELECT 'multa', m.criado_em,
                   CONCAT('Multa aplicada: ', u.nome, ' · ', t.nome)
            FROM multa m
            INNER JOIN aluguer a ON m.aluguer_id = a.id
            INNER JOIN reserva r ON a.reserva_id = r.id
            INNER JOIN tema t ON r.tema_id = t.id
            INNER JOIN utilizador u ON r.cliente_id = u.id
            UNION ALL
            SELECT 'multa_paga', m.data_pagamento,
                   CONCAT('Multa paga: ', u.nome)
            FROM multa m
            INNER JOIN aluguer a ON m.aluguer_id = a.id
            INNER JOIN reserva r ON a.reserva_id = r.id
            INNER JOIN utilizador u ON r.cliente_id = u.id
            WHERE m.estado = 'paga' AND m.data_pagamento IS NOT NULL
        ) eventos
        WHERE quando IS NOT NULL
        ORDER BY quando DESC
        LIMIT ?
    `, [limite]);

    return linhas;
};

// Devoluções esperadas até ao fim de hoje (inclui atrasadas)
const devolucoesHoje = async () => {
    const [linhas] = await db.query(`
        SELECT
            a.id AS aluguer_id,
            a.estado,
            a.data_prevista_devolucao,
            TIMESTAMPDIFF(HOUR, a.data_prevista_devolucao, NOW()) AS horas_atraso,
            u.nome AS cliente_nome,
            u.telefone AS cliente_telefone,
            t.nome AS tema_nome
        FROM aluguer a
        INNER JOIN reserva r ON a.reserva_id = r.id
        INNER JOIN utilizador u ON r.cliente_id = u.id
        INNER JOIN tema t ON r.tema_id = t.id
        WHERE a.estado = 'atrasado'
           OR (a.estado = 'ativo' AND DATE(a.data_prevista_devolucao) <= CURDATE())
        ORDER BY a.data_prevista_devolucao ASC
    `);

    return linhas;
};

module.exports = {
    faturacao,
    faturacaoPorDia,
    faturacaoPorMes,
    contadores,
    clientesMultados,
    atividadeRecente,
    devolucoesHoje
};
