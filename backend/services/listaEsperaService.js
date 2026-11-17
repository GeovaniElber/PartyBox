// Lista de espera sem conflitos.
//
// Regras:
// 1. A fila segue a ordem dos pedidos (criado_em), tema a tema.
// 2. Quando há datas livres, só UMA pessoa de cada vez recebe a oferta
//    (estado 'contactado'). Enquanto a oferta está ativa, essas datas contam
//    como ocupadas para todos os outros clientes.
// 3. A oferta dura 24h (LISTA_ESPERA_PRAZO_HORAS), mas nunca passa do início da festa.
// 4. Se o cliente recusa ou não responde a tempo, as datas passam ao pedido seguinte.
// 5. Clientes com multa por pagar são saltados, mas mantêm o lugar na fila.
// 6. Pedidos para dias diferentes do mesmo tema podem ter ofertas ao mesmo tempo.
//
// Todas as decisões sobre um tema bloqueiam a linha desse tema (SELECT ... FOR UPDATE),
// tal como a criação de reservas. Assim duas operações nunca entregam o mesmo dia.

const db = require('../src/config/database');
const notificacao = require('./notificacaoService');
const tempoReal = require('../src/socket');
const multaModel = require('../models/multaModel');
const { ErroNegocio } = require('../utils/erros');
const { paraData, formatarPeriodo, formatarDataHora } = require('../utils/datas');

const PRAZO_HORAS = Number(process.env.LISTA_ESPERA_PRAZO_HORAS || 24);

// Margem mínima para valer a pena oferecer as datas (30 minutos)
const MARGEM_MINIMA_MS = 30 * 60 * 1000;

// Fim da oferta: 24h a partir de agora, mas nunca depois do início do dia da festa
const calcularExpiracao = (dataInicio) => {
    const agora = Date.now();
    const limite = new Date(agora + PRAZO_HORAS * 60 * 60 * 1000);

    const inicioFesta = paraData(dataInicio);
    inicioFesta.setHours(0, 0, 0, 0);

    const expira = limite < inicioFesta ? limite : inicioFesta;

    return expira.getTime() - agora >= MARGEM_MINIMA_MS ? expira : null;
};

// Bloquear o tema para serializar reservas e ofertas desse tema
const bloquearTema = async (conexao, temaId) => {
    const [temas] = await conexao.query(
        'SELECT id, nome, estado FROM tema WHERE id = ? FOR UPDATE',
        [temaId]
    );

    return temas[0];
};

// As datas estão livres? (sem reservas pendentes/confirmadas e sem ofertas ativas)
const datasLivres = async (conexao, temaId, dataInicio, dataFim) => {
    const [ocupadas] = await conexao.query(`
        SELECT id FROM reserva
        WHERE tema_id = ?
          AND estado IN ('pendente', 'confirmada')
          AND data_inicio <= ?
          AND data_fim >= ?
        UNION ALL
        SELECT id FROM lista_espera
        WHERE tema_id = ?
          AND estado = 'contactado'
          AND oferta_expira_em > NOW()
          AND data_inicio <= ?
          AND data_fim >= ?
        LIMIT 1
    `, [temaId, dataFim, dataInicio, temaId, dataFim, dataInicio]);

    return ocupadas.length === 0;
};

// Avisar o cliente que chegou a sua vez
const avisarOferta = (oferta) => {
    notificacao.notificarPorId(oferta.cliente_id, {
        assunto: 'Chegou a sua vez na lista de espera',
        mensagem:
            `O tema ${oferta.tema_nome} ficou livre para ${formatarPeriodo(oferta.data_inicio, oferta.data_fim)}.\n` +
            `As datas estão guardadas só para si até ${formatarDataHora(oferta.oferta_expira_em)}. ` +
            'Confirme na sua área de cliente, em Lista de espera. Se não confirmar a tempo, passam para a pessoa seguinte.',
        ligacao: process.env.CLIENT_URL
            ? { texto: 'Abrir a lista de espera', url: `${process.env.CLIENT_URL}/conta/lista-espera` }
            : undefined
    });

    tempoReal.avisarAlteracao({
        area: 'lista_espera',
        temaId: oferta.tema_id,
        clienteId: oferta.cliente_id
    });
};

// Oferecer as datas livres de um tema aos pedidos da fila, por ordem de chegada.
// Devolve o número de ofertas feitas.
const distribuirDatasLivres = async (temaId) => {
    const conexao = await db.getConnection();
    const ofertas = [];

    try {
        await conexao.beginTransaction();

        const tema = await bloquearTema(conexao, temaId);

        // Temas inativos ou em manutenção não recebem ofertas
        if (!tema || ['inativo', 'manutencao'].includes(tema.estado)) {
            await conexao.commit();
            return 0;
        }

        const [pedidos] = await conexao.query(`
            SELECT le.*
            FROM lista_espera le
            INNER JOIN utilizador u ON le.cliente_id = u.id
            WHERE le.tema_id = ?
              AND le.estado = 'aguarda'
              AND le.data_inicio >= CURDATE()
              AND u.ativo = 1
            ORDER BY le.criado_em ASC, le.id ASC
            FOR UPDATE
        `, [temaId]);

        for (const pedido of pedidos) {
            // Regra 5: salta quem tem multa, sem perder o lugar
            if (await multaModel.temMultasPendentes(pedido.cliente_id, conexao)) continue;

            // Regras 2 e 6: só oferece se todas as datas do pedido estiverem livres
            if (!(await datasLivres(conexao, temaId, pedido.data_inicio, pedido.data_fim))) continue;

            const expira = calcularExpiracao(pedido.data_inicio);
            if (!expira) continue;

            await conexao.query(`
                UPDATE lista_espera
                SET estado = 'contactado', oferta_expira_em = ?
                WHERE id = ?
            `, [expira, pedido.id]);

            ofertas.push({ ...pedido, tema_nome: tema.nome, oferta_expira_em: expira });
        }

        await conexao.commit();

    } catch (erro) {
        await conexao.rollback();
        throw erro;

    } finally {
        conexao.release();
    }

    ofertas.forEach(avisarOferta);

    return ofertas.length;
};

// Versão para usar depois de uma operação: regista o erro sem o propagar
const distribuirSemFalhar = (temaId) => {
    distribuirDatasLivres(temaId).catch((erro) => {
        console.error(`Erro ao distribuir datas livres do tema ${temaId}:`, erro);
    });
};

// Procurar e bloquear o pedido de um cliente
const obterPedidoDoCliente = async (conexao, pedidoId, clienteId) => {
    const [pedidos] = await conexao.query(`
        SELECT le.*, t.nome AS tema_nome, t.estado AS tema_estado
        FROM lista_espera le
        INNER JOIN tema t ON le.tema_id = t.id
        WHERE le.id = ?
        FOR UPDATE
    `, [pedidoId]);

    const pedido = pedidos[0];

    if (!pedido) {
        throw new ErroNegocio(404, 'Pedido não encontrado.');
    }

    if (clienteId && Number(pedido.cliente_id) !== Number(clienteId)) {
        throw new ErroNegocio(403, 'Este pedido não te pertence.');
    }

    return pedido;
};

// O cliente aceita a oferta: cria uma reserva pendente com as datas guardadas
const aceitarOferta = async (pedidoId, clienteId) => {
    const conexao = await db.getConnection();
    let pedido;
    let reservaId;

    try {
        await conexao.beginTransaction();

        // Ler o tema do pedido sem bloquear, para bloquear primeiro o tema
        const [[base]] = await conexao.query('SELECT tema_id FROM lista_espera WHERE id = ?', [pedidoId]);
        if (!base) throw new ErroNegocio(404, 'Pedido não encontrado.');

        await bloquearTema(conexao, base.tema_id);
        pedido = await obterPedidoDoCliente(conexao, pedidoId, clienteId);

        if (pedido.estado !== 'contactado') {
            throw new ErroNegocio(400, 'Este pedido não tem nenhuma oferta para confirmar.');
        }

        if (new Date(pedido.oferta_expira_em) <= new Date()) {
            throw new ErroNegocio(410, 'O prazo para confirmar já terminou. As datas passaram para a pessoa seguinte.');
        }

        if (await multaModel.temMultasPendentes(clienteId, conexao)) {
            throw new ErroNegocio(403, 'Tens uma multa por pagar. Paga-a na loja antes de reservar.');
        }

        // Confirmação final: nenhuma reserva ocupou estas datas
        const [conflitos] = await conexao.query(`
            SELECT id FROM reserva
            WHERE tema_id = ?
              AND estado IN ('pendente', 'confirmada')
              AND data_inicio <= ?
              AND data_fim >= ?
            LIMIT 1
        `, [pedido.tema_id, pedido.data_fim, pedido.data_inicio]);

        if (conflitos.length > 0) {
            throw new ErroNegocio(409, 'Estas datas já não estão disponíveis.');
        }

        const [resultado] = await conexao.query(`
            INSERT INTO reserva (cliente_id, tema_id, data_inicio, data_fim)
            VALUES (?, ?, ?, ?)
        `, [clienteId, pedido.tema_id, pedido.data_inicio, pedido.data_fim]);

        reservaId = resultado.insertId;

        await conexao.query(`
            UPDATE lista_espera
            SET estado = 'convertido', reserva_id = ?
            WHERE id = ?
        `, [reservaId, pedidoId]);

        await conexao.commit();

    } catch (erro) {
        await conexao.rollback();
        throw erro;

    } finally {
        conexao.release();
    }

    notificacao.notificarPorId(clienteId, {
        assunto: 'Recebemos o seu pedido de reserva',
        mensagem:
            `Pedido n.º ${reservaId}: tema ${pedido.tema_nome}, ${formatarPeriodo(pedido.data_inicio, pedido.data_fim)}.\n` +
            'As datas continuam guardadas para si enquanto a loja confirma o pedido. Avisamos assim que estiver confirmado. ' +
            'O pagamento é feito na loja, quando levantar o tema.'
    });

    tempoReal.avisarAlteracao({ area: 'reservas', temaId: pedido.tema_id, clienteId });

    return { reservaId, pedido };
};

// O cliente recusa a oferta, ou sai da fila (o funcionário também pode retirar um pedido)
const cancelarPedido = async (pedidoId, clienteId = null) => {
    const conexao = await db.getConnection();
    let pedido;

    try {
        await conexao.beginTransaction();

        pedido = await obterPedidoDoCliente(conexao, pedidoId, clienteId);

        if (!['aguarda', 'contactado'].includes(pedido.estado)) {
            throw new ErroNegocio(400, 'Este pedido já não está na fila.');
        }

        await conexao.query(`
            UPDATE lista_espera
            SET estado = 'cancelado', oferta_expira_em = NULL
            WHERE id = ?
        `, [pedidoId]);

        await conexao.commit();

    } catch (erro) {
        await conexao.rollback();
        throw erro;

    } finally {
        conexao.release();
    }

    tempoReal.avisarAlteracao({
        area: 'lista_espera',
        temaId: pedido.tema_id,
        clienteId: pedido.cliente_id
    });

    // Se tinha uma oferta, as datas passam para a pessoa seguinte
    if (pedido.estado === 'contactado') {
        distribuirSemFalhar(pedido.tema_id);
    }

    return pedido;
};

// Tarefa periódica: terminar ofertas fora de prazo e pedidos de festas que já passaram
const expirarOfertas = async () => {
    const [expiradas] = await db.query(`
        SELECT le.id, le.cliente_id, le.tema_id, le.data_inicio, le.data_fim, t.nome AS tema_nome
        FROM lista_espera le
        INNER JOIN tema t ON le.tema_id = t.id
        WHERE le.estado = 'contactado'
          AND le.oferta_expira_em <= NOW()
    `);

    if (expiradas.length > 0) {
        await db.query(
            `UPDATE lista_espera SET estado = 'expirado'
             WHERE estado = 'contactado' AND id IN (?)`,
            [expiradas.map((p) => p.id)]
        );

        for (const p of expiradas) {
            notificacao.notificarPorId(p.cliente_id, {
                assunto: 'O prazo da lista de espera terminou',
                mensagem:
                    `Não recebemos a confirmação para o tema ${p.tema_nome} (${formatarPeriodo(p.data_inicio, p.data_fim)}), ` +
                    'por isso as datas passaram para a pessoa seguinte da fila.'
            });

            tempoReal.avisarAlteracao({ area: 'lista_espera', clienteId: p.cliente_id });
        }
    }

    // Pedidos à espera de festas que já começaram
    await db.query(`
        UPDATE lista_espera
        SET estado = 'expirado'
        WHERE estado = 'aguarda'
          AND data_inicio < CURDATE()
    `);

    const temas = [...new Set(expiradas.map((p) => p.tema_id))];

    for (const temaId of temas) {
        await distribuirDatasLivres(temaId);
    }

    return expiradas.length;
};

// Lugar na fila para um período: pedidos ativos do mesmo tema, para dias em comum,
// feitos antes (ou todos, quando ainda não existe pedido).
const calcularPosicao = async ({ temaId, dataInicio, dataFim, criadoEm = null, excluirId = 0 }) => {
    const [linhas] = await db.query(`
        SELECT COUNT(*) AS frente
        FROM lista_espera
        WHERE tema_id = ?
          AND id <> ?
          AND estado IN ('aguarda', 'contactado')
          AND data_inicio <= ?
          AND data_fim >= ?
          ${criadoEm ? 'AND criado_em < ?' : ''}
    `, criadoEm
        ? [temaId, excluirId, dataFim, dataInicio, criadoEm]
        : [temaId, excluirId, dataFim, dataInicio]);

    return Number(linhas[0].frente) + 1;
};

module.exports = {
    bloquearTema,
    datasLivres,
    distribuirDatasLivres,
    distribuirSemFalhar,
    aceitarOferta,
    cancelarPedido,
    expirarOfertas,
    calcularPosicao
};
