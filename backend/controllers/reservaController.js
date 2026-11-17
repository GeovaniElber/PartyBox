const reservaModel = require('../models/reservaModel');
const temaModel = require('../models/temaModel');
const multaModel = require('../models/multaModel');
const listaEspera = require('../services/listaEsperaService');
const notificacao = require('../services/notificacaoService');
const tempoReal = require('../src/socket');
const db = require('../src/config/database');
const { ErroNegocio, responderErro, idValido } = require('../utils/erros');
const { dataValida, hojeISO, formatarPeriodo, paraISO } = require('../utils/datas');

// Validar um período AAAA-MM-DD. Devolve uma mensagem de erro ou null.
const validarDatas = (data_inicio, data_fim, mensagemPassado) => {
    if (!dataValida(data_inicio) || !dataValida(data_fim)) {
        return 'As datas devem estar no formato AAAA-MM-DD e ser válidas.';
    }

    if (data_fim < data_inicio) {
        return 'A data de fim não pode ser anterior à data de início.';
    }

    if (data_inicio < hojeISO()) {
        return mensagemPassado;
    }

    return null;
};

// Consultar disponibilidade de um tema por período
const consultarDisponibilidade = async (req, res) => {
    try {
        const { tema_id, data_inicio, data_fim } = req.query;

        if (!tema_id || !data_inicio || !data_fim) {
            return res.status(400).json({ mensagem: 'Indica o tema, a data de início e a data de fim.' });
        }

        if (!idValido(tema_id)) {
            return res.status(400).json({ mensagem: 'ID do tema inválido.' });
        }

        const erroDatas = validarDatas(
            data_inicio,
            data_fim,
            'Não é possível consultar disponibilidade para datas passadas.'
        );

        if (erroDatas) {
            return res.status(400).json({ mensagem: erroDatas });
        }

        const tema = await temaModel.procurarPorId(tema_id);

        if (!tema) {
            return res.status(404).json({ mensagem: 'Tema não encontrado.' });
        }

        const base = {
            tema_id: Number(tema_id),
            tema_nome: tema.nome,
            data_inicio,
            data_fim
        };

        // Temas em manutenção ou inativos não podem ser reservados
        if (['manutencao', 'inativo'].includes(tema.estado)) {
            return res.status(200).json({
                ...base,
                disponivel: false,
                mensagem: tema.estado === 'manutencao'
                    ? 'Este tema encontra-se em manutenção.'
                    : 'Este tema está inativo.'
            });
        }

        const clienteId = req.utilizador.tipo === 'cliente' ? req.utilizador.id : 0;

        const existeConflito = await reservaModel.verificarConflito(
            tema_id,
            data_inicio,
            data_fim,
            db,
            clienteId
        );

        return res.status(200).json({
            ...base,
            disponivel: !existeConflito,
            mensagem: existeConflito
                ? 'Este tema já está reservado para o período selecionado. Pode entrar na lista de espera.'
                : 'O tema está disponível para o período selecionado.'
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar a disponibilidade do tema.');
    }
};

// Disponibilidade de todos os temas num dia (catálogo "Quando é a festa?")
// GET /api/reservas/disponibilidade-dia?data=AAAA-MM-DD
const disponibilidadeDoDia = async (req, res) => {
    try {
        const { data } = req.query;

        if (!dataValida(data)) {
            return res.status(400).json({ mensagem: 'Indica a data no formato AAAA-MM-DD.' });
        }

        if (data < hojeISO()) {
            return res.status(400).json({ mensagem: 'Escolhe uma data a partir de hoje.' });
        }

        const [temas, ocupados] = await Promise.all([
            temaModel.listarTodos({ incluirInativos: false }),
            reservaModel.listarTemasOcupadosNoDia(data)
        ]);

        const resultado = temas.map((t) => ({
            tema_id: t.id,
            nome: t.nome,
            livre: t.estado !== 'manutencao' && !ocupados.includes(Number(t.id))
        }));

        return res.status(200).json({ data, temas: resultado });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar a disponibilidade.');
    }
};

// Dias ocupados de um tema (calendário da tela do tema)
// GET /api/reservas/ocupacao?tema_id=1&mes=2026-11
const consultarOcupacao = async (req, res) => {
    try {
        const { tema_id, mes } = req.query;

        if (!idValido(tema_id)) {
            return res.status(400).json({ mensagem: 'ID do tema inválido.' });
        }

        if (!/^\d{4}-\d{2}$/.test(mes || '')) {
            return res.status(400).json({ mensagem: 'Indica o mês no formato AAAA-MM.' });
        }

        const [ano, numeroMes] = mes.split('-').map(Number);
        const inicio = `${mes}-01`;
        const fim = paraISO(new Date(ano, numeroMes, 0));

        const periodos = await reservaModel.listarOcupacao(tema_id, inicio, fim);

        return res.status(200).json({
            tema_id: Number(tema_id),
            mes,
            ocupados: periodos.map((p) => ({
                data_inicio: paraISO(p.data_inicio),
                data_fim: paraISO(p.data_fim),
                na_fila: Number(p.na_fila)
            }))
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar a ocupação do tema.');
    }
};

// Listar reservas (?estado=pendente para a tela "Confirmar reservas")
const listar = async (req, res) => {
    try {
        const estados = ['pendente', 'confirmada', 'recusada', 'cancelada', 'concluida'];
        const estado = estados.includes(req.query.estado) ? req.query.estado : null;

        const reservas = await reservaModel.listarTodas(estado);

        return res.status(200).json(reservas);

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar as reservas.');
    }
};

// Consultar uma reserva
const consultar = async (req, res) => {
    try {
        const { id } = req.params;

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID de reserva inválido.' });
        }

        const reserva = await reservaModel.procurarPorId(id);

        if (!reserva) {
            return res.status(404).json({ mensagem: 'Reserva não encontrada.' });
        }

        // O cliente só pode consultar as suas próprias reservas
        if (
            req.utilizador.tipo === 'cliente' &&
            Number(reserva.cliente_id) !== Number(req.utilizador.id)
        ) {
            return res.status(403).json({ mensagem: 'Não tens autorização para consultar esta reserva.' });
        }

        return res.status(200).json(reserva);

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar a reserva.');
    }
};

// Listar reservas do próprio cliente
const minhasReservas = async (req, res) => {
    try {
        const reservas = await reservaModel.listarPorCliente(req.utilizador.id);

        return res.status(200).json(reservas);

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar as tuas reservas.');
    }
};

// Criar uma reserva (fica pendente até a loja confirmar)
const criar = async (req, res) => {
    let conexao;

    try {
        const { tema_id, data_inicio, data_fim } = req.body;

        if (!tema_id || !data_inicio || !data_fim) {
            return res.status(400).json({ mensagem: 'Preenche todos os campos obrigatórios.' });
        }

        if (!idValido(tema_id)) {
            return res.status(400).json({ mensagem: 'ID do tema inválido.' });
        }

        // O cliente reserva para si; a loja indica o cliente
        const clienteId = req.utilizador.tipo === 'cliente'
            ? req.utilizador.id
            : req.body.cliente_id;

        if (!idValido(clienteId)) {
            return res.status(400).json({ mensagem: 'Indica um ID de cliente válido.' });
        }

        const erroDatas = validarDatas(data_inicio, data_fim, 'Não é possível reservar para uma data passada.');

        if (erroDatas) {
            return res.status(400).json({ mensagem: erroDatas });
        }

        conexao = await db.getConnection();
        await conexao.beginTransaction();

        // Bloquear o tema: reservas e ofertas da lista de espera do mesmo tema
        // são feitas uma de cada vez, por isso nunca há duas para o mesmo dia.
        const tema = await listaEspera.bloquearTema(conexao, tema_id);

        if (!tema) {
            throw new ErroNegocio(404, 'Tema não encontrado.');
        }

        if (['inativo', 'manutencao'].includes(tema.estado)) {
            throw new ErroNegocio(400, 'Este tema não está disponível para reserva.');
        }

        const [clientes] = await conexao.query(`
            SELECT id, nome
            FROM utilizador
            WHERE id = ?
              AND tipo = 'cliente'
              AND ativo = 1
            LIMIT 1
        `, [clienteId]);

        if (clientes.length === 0) {
            throw new ErroNegocio(404, 'Cliente não encontrado ou conta inativa.');
        }

        if (await multaModel.temMultasPendentes(clienteId, conexao)) {
            throw new ErroNegocio(
                403,
                'Este cliente tem multas pendentes. Regulariza o pagamento antes de fazer uma reserva.'
            );
        }

        const existeConflito = await reservaModel.verificarConflito(
            tema_id,
            data_inicio,
            data_fim,
            conexao,
            clienteId
        );

        if (existeConflito) {
            throw new ErroNegocio(
                409,
                'Este tema já tem uma reserva para esse período. Pode entrar na lista de espera.'
            );
        }

        const reservaId = await reservaModel.criar({
            cliente_id: clienteId,
            tema_id,
            data_inicio,
            data_fim
        }, conexao);

        await conexao.commit();

        notificacao.notificarPorId(clienteId, {
            assunto: 'Recebemos o seu pedido de reserva',
            mensagem:
                `Pedido n.º ${reservaId}: tema ${tema.nome}, ${formatarPeriodo(data_inicio, data_fim)}.\n` +
                'As datas ficam guardadas enquanto a loja confirma o pedido. Avisamos assim que estiver confirmado. ' +
                'O pagamento é feito na loja, quando levantar o tema.'
        });

        tempoReal.avisarAlteracao({ area: 'reservas', temaId: tema_id, clienteId });

        return res.status(201).json({
            mensagem: 'Reserva criada com sucesso. Aguarda confirmação da loja.',
            reserva_id: reservaId,
            cliente_id: Number(clienteId),
            estado: 'pendente'
        });

    } catch (erro) {
        if (conexao) await conexao.rollback();

        return responderErro(res, erro, 'Erro interno ao criar a reserva.');

    } finally {
        if (conexao) conexao.release();
    }
};

// Confirmar, recusar ou cancelar uma reserva (funcionários e administradores)
// PATCH /api/reservas/:id/estado  { estado: 'confirmada' | 'recusada' | 'cancelada', motivo? }
const atualizarEstado = async (req, res) => {
    let conexao;

    try {
        const { id } = req.params;
        const { estado } = req.body;
        const motivo = typeof req.body.motivo === 'string' ? req.body.motivo.trim() : '';

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID de reserva inválido.' });
        }

        if (!['confirmada', 'recusada', 'cancelada'].includes(estado)) {
            return res.status(400).json({ mensagem: 'O estado deve ser confirmada, recusada ou cancelada.' });
        }

        if (estado === 'recusada' && !motivo) {
            return res.status(400).json({ mensagem: 'Indica o motivo da recusa. É enviado ao cliente.' });
        }

        if (motivo.length > 255) {
            return res.status(400).json({ mensagem: 'O motivo pode ter no máximo 255 caracteres.' });
        }

        conexao = await db.getConnection();
        await conexao.beginTransaction();

        const [reservas] = await conexao.query(`
            SELECT
                r.*,
                u.ativo AS cliente_ativo,
                t.nome AS tema_nome,
                t.estado AS tema_estado
            FROM reserva r
            INNER JOIN utilizador u ON r.cliente_id = u.id
            INNER JOIN tema t ON r.tema_id = t.id
            WHERE r.id = ?
            FOR UPDATE
        `, [id]);

        const reserva = reservas[0];

        if (!reserva) {
            throw new ErroNegocio(404, 'Reserva não encontrada.');
        }

        if (estado === 'confirmada') {
            if (reserva.estado !== 'pendente') {
                throw new ErroNegocio(400, 'Só é possível confirmar reservas pendentes.');
            }

            if (Number(reserva.cliente_ativo) !== 1) {
                throw new ErroNegocio(400, 'Não é possível confirmar a reserva: o cliente está inativo.');
            }

            if (paraISO(reserva.data_inicio) < hojeISO()) {
                throw new ErroNegocio(400, 'Não é possível confirmar uma reserva com data de início passada.');
            }

            if (['manutencao', 'inativo'].includes(reserva.tema_estado)) {
                throw new ErroNegocio(400, 'Não é possível confirmar: o tema está em manutenção ou inativo.');
            }

            if (await multaModel.temMultasPendentes(reserva.cliente_id, conexao)) {
                throw new ErroNegocio(403, 'Este cliente tem multas pendentes e não pode ter novas reservas confirmadas.');
            }
        }

        if (estado === 'recusada' && reserva.estado !== 'pendente') {
            throw new ErroNegocio(400, 'Só é possível recusar reservas pendentes.');
        }

        if (estado === 'cancelada') {
            if (!['pendente', 'confirmada'].includes(reserva.estado)) {
                throw new ErroNegocio(400, 'Esta reserva não pode ser cancelada no estado atual.');
            }

            const [alugueres] = await conexao.query(
                'SELECT id FROM aluguer WHERE reserva_id = ? LIMIT 1',
                [id]
            );

            if (alugueres.length > 0) {
                throw new ErroNegocio(409, 'Não é possível cancelar: esta reserva já possui um aluguer associado.');
            }
        }

        await conexao.query(`
            UPDATE reserva
            SET estado = ?,
                motivo_recusa = ?,
                decidida_em = NOW()
            WHERE id = ?
        `, [estado, motivo || null, id]);

        await conexao.commit();

        const periodo = formatarPeriodo(reserva.data_inicio, reserva.data_fim);

        const avisos = {
            confirmada: {
                assunto: 'Reserva confirmada',
                mensagem:
                    `A sua reserva n.º ${id} do tema ${reserva.tema_nome} (${periodo}) está confirmada.\n` +
                    'Levante o tema na loja no primeiro dia da reserva. O pagamento é feito nesse momento.'
            },
            recusada: {
                assunto: 'Não foi possível confirmar a sua reserva',
                mensagem:
                    `O pedido n.º ${id} do tema ${reserva.tema_nome} (${periodo}) foi recusado.\n` +
                    `Motivo: ${motivo}`
            },
            cancelada: {
                assunto: 'Reserva cancelada',
                mensagem:
                    `A reserva n.º ${id} do tema ${reserva.tema_nome} (${periodo}) foi cancelada pela loja.` +
                    (motivo ? `\nMotivo: ${motivo}` : '')
            }
        };

        notificacao.notificarPorId(reserva.cliente_id, avisos[estado]);

        tempoReal.avisarAlteracao({
            area: 'reservas',
            temaId: reserva.tema_id,
            clienteId: reserva.cliente_id
        });

        // As datas ficaram livres: avisar a lista de espera
        if (estado !== 'confirmada') {
            listaEspera.distribuirSemFalhar(reserva.tema_id);
        }

        const mensagens = {
            confirmada: 'Reserva confirmada. O cliente foi avisado por email e WhatsApp.',
            recusada: 'Pedido recusado. O cliente foi avisado e as datas ficaram livres.',
            cancelada: 'Reserva cancelada. O cliente foi avisado e as datas ficaram livres.'
        };

        return res.status(200).json({
            mensagem: mensagens[estado],
            reserva_id: Number(id),
            estado
        });

    } catch (erro) {
        if (conexao) await conexao.rollback();

        return responderErro(res, erro, 'Erro ao atualizar o estado da reserva.');

    } finally {
        if (conexao) conexao.release();
    }
};

// O cliente cancela a própria reserva (antes do dia de início)
const cancelarMinha = async (req, res) => {
    let conexao;

    try {
        const { id } = req.params;

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID de reserva inválido.' });
        }

        conexao = await db.getConnection();
        await conexao.beginTransaction();

        const [reservas] = await conexao.query(`
            SELECT r.*, t.nome AS tema_nome
            FROM reserva r
            INNER JOIN tema t ON r.tema_id = t.id
            WHERE r.id = ?
            FOR UPDATE
        `, [id]);

        const reserva = reservas[0];

        if (!reserva) {
            throw new ErroNegocio(404, 'Reserva não encontrada.');
        }

        if (Number(reserva.cliente_id) !== Number(req.utilizador.id)) {
            throw new ErroNegocio(403, 'Esta reserva não te pertence.');
        }

        if (!['pendente', 'confirmada'].includes(reserva.estado)) {
            throw new ErroNegocio(400, 'Esta reserva já não pode ser cancelada.');
        }

        if (paraISO(reserva.data_inicio) <= hojeISO()) {
            throw new ErroNegocio(400, 'A reserva começa hoje ou já começou. Para cancelar, fale com a loja.');
        }

        await conexao.query(
            "UPDATE reserva SET estado = 'cancelada', decidida_em = NOW() WHERE id = ?",
            [id]
        );

        await conexao.commit();

        notificacao.notificarPorId(reserva.cliente_id, {
            assunto: 'Reserva cancelada',
            mensagem: `Cancelámos a reserva n.º ${id} do tema ${reserva.tema_nome} (${formatarPeriodo(reserva.data_inicio, reserva.data_fim)}), como pediu.`
        });

        tempoReal.avisarAlteracao({
            area: 'reservas',
            temaId: reserva.tema_id,
            clienteId: reserva.cliente_id
        });

        listaEspera.distribuirSemFalhar(reserva.tema_id);

        return res.status(200).json({
            mensagem: 'Reserva cancelada.',
            reserva_id: Number(id),
            estado: 'cancelada'
        });

    } catch (erro) {
        if (conexao) await conexao.rollback();

        return responderErro(res, erro, 'Erro ao cancelar a reserva.');

    } finally {
        if (conexao) conexao.release();
    }
};

module.exports = {
    listar,
    consultar,
    minhasReservas,
    criar,
    atualizarEstado,
    cancelarMinha,
    consultarDisponibilidade,
    disponibilidadeDoDia,
    consultarOcupacao
};
