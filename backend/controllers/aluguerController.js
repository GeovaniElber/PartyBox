
const aluguerModel = require('../models/aluguerModel');
const db = require('../src/config/database');
const notificacao = require('../services/notificacaoService');
const tempoReal = require('../src/socket');
const { removerFicheirosDoPedido } = require('../middlewares/criarUpload');
const { paraISO, formatarDataHora, formatarPeriodo } = require('../utils/datas');

const FORMAS_PAGAMENTO = ['numerario', 'multibanco', 'mbway'];
const ESTADOS_INSPECAO = ['bom', 'danificado', 'incompleto'];

// Hora limite de devolução no último dia da reserva (configurável no .env)
const HORA_DEVOLUCAO = process.env.HORA_DEVOLUCAO || '18:00';

const formatarEuros = (valor) => `${Number(valor).toFixed(2).replace('.', ',')} €`;

// Nomes das fotografias enviadas na inspeção (ou null)
const fotosDoPedido = (req) => {
    const nomes = (req.files || []).map((f) => f.filename);
    return nomes.length > 0 ? JSON.stringify(nomes) : null;
};

// Verificar permissões
const verificarPermissao = (utilizador) => {
    return utilizador &&
        ['funcionario', 'administrador'].includes(utilizador.tipo);
};

// Validar data e hora
const validarDataHora = (data) => {
    if (typeof data !== 'string') return false;

    const formato = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;

    if (!formato.test(data)) return false;

    const normalizada = data.replace('T', ' ');
    const [dataParte, horaParte] = normalizada.split(' ');

    const [ano, mes, dia] = dataParte.split('-').map(Number);
    const [hora, minuto, segundo = 0] = horaParte.split(':').map(Number);

    const objeto = new Date(Date.UTC(
        ano, mes - 1, dia, hora, minuto, segundo
    ));

    return (
        objeto.getUTCFullYear() === ano &&
        objeto.getUTCMonth() === mes - 1 &&
        objeto.getUTCDate() === dia &&
        objeto.getUTCHours() === hora &&
        objeto.getUTCMinutes() === minuto &&
        objeto.getUTCSeconds() === segundo
    );
};

// Atualizar disponibilidade do tema após libertar um aluguer
const atualizarDisponibilidadeTema = async (
    conexao,
    temaId,
    reservaAtualId
) => {
    const [reservasFuturas] = await conexao.query(`
        SELECT id
        FROM reserva
        WHERE tema_id = ?
          AND id <> ?
          AND estado = 'confirmada'
          AND DATE(data_fim) >= CURDATE()
        LIMIT 1
    `, [temaId, reservaAtualId]);

    const novoEstado = reservasFuturas.length > 0
        ? 'reservado'
        : 'ativo';

    await conexao.query(`
        UPDATE tema
        SET estado = ?
        WHERE id = ?
    `, [novoEstado, temaId]);

    return novoEstado;
};

// Listar todos os alugueres
const listar = async (req, res) => {
    try {
        if (!verificarPermissao(req.utilizador)) {
            return res.status(403).json({
                mensagem: 'Não tens autorização para consultar todos os alugueres.'
            });
        }

        const alugueres = await aluguerModel.listarTodas();

        return res.status(200).json(alugueres);

    } catch (erro) {
        console.error('Erro ao listar alugueres:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar os alugueres.'
        });
    }
};

// Consultar um aluguer específico
const consultar = async (req, res) => {
    try {
        const { id } = req.params;

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                mensagem: 'ID de aluguer inválido.'
            });
        }

        const aluguer = await aluguerModel.procurarPorId(id);

        if (!aluguer) {
            return res.status(404).json({
                mensagem: 'Aluguer não encontrado.'
            });
        }

        if (
            req.utilizador.tipo === 'cliente' &&
            Number(aluguer.cliente_id) !== Number(req.utilizador.id)
        ) {
            return res.status(403).json({
                mensagem: 'Não tens autorização para consultar este aluguer.'
            });
        }

        return res.status(200).json(aluguer);

    } catch (erro) {
        console.error('Erro ao consultar aluguer:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar o aluguer.'
        });
    }
};

// Consultar alugueres do próprio cliente
const meusAlugueres = async (req, res) => {
    try {
        const alugueres = await aluguerModel.listarPorCliente(
            req.utilizador.id
        );

        return res.status(200).json(alugueres);

    } catch (erro) {
        console.error('Erro ao consultar alugueres do cliente:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar os teus alugueres.'
        });
    }
};

// Listar alugueres ativos
const listarAtivos = async (req, res) => {
    try {
        if (!verificarPermissao(req.utilizador)) {
            return res.status(403).json({
                mensagem: 'Não tens autorização para consultar os alugueres ativos.'
            });
        }

        const alugueres = await aluguerModel.listarAtivos();

        return res.status(200).json(alugueres);

    } catch (erro) {
        console.error('Erro ao listar alugueres ativos:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar os alugueres ativos.'
        });
    }
};

// Criar aluguer a partir de uma reserva confirmada
const criar = async (req, res) => {
    let conexao;

    try {
        if (!verificarPermissao(req.utilizador)) {
            return res.status(403).json({
                mensagem: 'Apenas funcionários e administradores podem criar alugueres.'
            });
        }

        const {
            reserva_id,
            data_prevista_devolucao
        } = req.body;

        if (!reserva_id) {
            return res.status(400).json({
                mensagem: 'Indica o ID da reserva.'
            });
        }

        if (
            !Number.isInteger(Number(reserva_id)) ||
            Number(reserva_id) <= 0
        ) {
            return res.status(400).json({
                mensagem: 'ID de reserva inválido.'
            });
        }

        // A data prevista é opcional: por omissão, último dia da reserva à HORA_DEVOLUCAO
        if (data_prevista_devolucao && !validarDataHora(data_prevista_devolucao)) {
            return res.status(400).json({
                mensagem: 'A data prevista deve estar no formato AAAA-MM-DD HH:mm:ss.'
            });
        }

        let dataPrevista = data_prevista_devolucao
            ? data_prevista_devolucao.replace('T', ' ')
            : null;

        conexao = await db.getConnection();
        await conexao.beginTransaction();

        // Procurar e bloquear a reserva
        const [reservas] = await conexao.query(`
            SELECT
                r.*,
                u.tipo AS cliente_tipo,
                u.ativo AS cliente_ativo,
                t.estado AS tema_estado
            FROM reserva r
            INNER JOIN utilizador u ON r.cliente_id = u.id
            INNER JOIN tema t ON r.tema_id = t.id
            WHERE r.id = ?
            FOR UPDATE
        `, [reserva_id]);

        if (reservas.length === 0) {
            await conexao.rollback();

            return res.status(404).json({
                mensagem: 'Reserva não encontrada.'
            });
        }

        const reserva = reservas[0];

        if (!dataPrevista) {
            dataPrevista = `${paraISO(reserva.data_fim)} ${HORA_DEVOLUCAO}:00`;
        }

        if (reserva.estado !== 'confirmada') {
            await conexao.rollback();

            return res.status(400).json({
                mensagem: 'Só é possível criar alugueres de reservas confirmadas.'
            });
        }

        // Verificar se o cliente está ativo
        if (
            reserva.cliente_tipo !== 'cliente' ||
            Number(reserva.cliente_ativo) !== 1
        ) {
            await conexao.rollback();

            return res.status(400).json({
                mensagem: 'O cliente está inativo ou não é válido.'
            });
        }

        // O tema pode estar ativo ou reservado.
        // Não pode estar alugado, em manutenção ou inativo.
        if (!['ativo', 'reservado'].includes(reserva.tema_estado)) {
            await conexao.rollback();

            return res.status(400).json({
                mensagem: 'Este tema não está disponível para iniciar o aluguer.'
            });
        }

        // Verificar multas pendentes do cliente
        const [multas] = await conexao.query(`
            SELECT m.id
            FROM multa m
            INNER JOIN aluguer a ON m.aluguer_id = a.id
            INNER JOIN reserva r ON a.reserva_id = r.id
            WHERE r.cliente_id = ?
              AND m.estado = 'pendente'
            LIMIT 1
        `, [reserva.cliente_id]);

        if (multas.length > 0) {
            await conexao.rollback();

            return res.status(403).json({
                mensagem: 'Este cliente tem multas pendentes. Regulariza a situação antes de iniciar um novo aluguer.'
            });
        }

        // Verificar se a reserva já tem aluguer
        const [aluguerExistente] = await conexao.query(`
            SELECT id
            FROM aluguer
            WHERE reserva_id = ?
            LIMIT 1
        `, [reserva_id]);

        if (aluguerExistente.length > 0) {
            await conexao.rollback();

            return res.status(409).json({
                mensagem: 'Esta reserva já possui um aluguer.'
            });
        }

        // Validar as datas
        const [validacaoDatas] = await conexao.query(`
            SELECT
                CURDATE() = DATE(?) AS hoje_entrega,
                DATE(?) = DATE(?) AS devolucao_valida,
                CAST(? AS DATETIME) > NOW() AS devolucao_futura
        `, [
            reserva.data_inicio,
            dataPrevista,
            reserva.data_fim,
            dataPrevista
        ]);

        const datas = validacaoDatas[0];

        if (
            Number(datas.hoje_entrega) !== 1 ||
            Number(datas.devolucao_valida) !== 1 ||
            Number(datas.devolucao_futura) !== 1
        ) {
            await conexao.rollback();

            return res.status(400).json({
                mensagem: 'O aluguer só pode ser criado no dia de início da reserva. A devolução deve corresponder ao último dia reservado e ser futura.'
            });
        }

        // Criar aluguer à espera da inspeção obrigatória
        const [resultado] = await conexao.query(`
            INSERT INTO aluguer (
                reserva_id,
                data_entrega,
                data_prevista_devolucao
            )
            VALUES (?, NOW(), ?)
        `, [reserva_id, dataPrevista]);

        // Manter o tema reservado até à aprovação da inspeção
        await conexao.query(`
            UPDATE tema
            SET estado = 'reservado'
            WHERE id = ?
        `, [reserva.tema_id]);

        await conexao.commit();

        return res.status(201).json({
            mensagem: 'Aluguer criado. Aguarda a inspeção obrigatória de entrega.',
            aluguer_id: resultado.insertId,
            reserva_id: Number(reserva_id),
            data_prevista_devolucao: dataPrevista,
            estado: 'aguarda_inspecao'
        });

    } catch (erro) {
        if (conexao) await conexao.rollback();

        console.error('Erro ao criar aluguer:', erro);

        return res.status(500).json({
            mensagem: 'Erro interno ao criar o aluguer.'
        });

    } finally {
        if (conexao) conexao.release();
    }
};

// Levantamentos de hoje (tela "Registar aluguer"):
// reservas confirmadas que começam hoje e ainda não foram entregues.
const levantamentosHoje = async (req, res) => {
    try {
        const [linhas] = await db.query(`
            SELECT
                r.id AS reserva_id,
                r.data_inicio,
                r.data_fim,
                r.cliente_id,
                u.nome AS cliente_nome,
                u.email AS cliente_email,
                u.telefone AS cliente_telefone,
                u.foto AS cliente_foto,
                t.id AS tema_id,
                t.nome AS tema_nome,
                t.imagem AS tema_imagem,
                t.pecas AS tema_pecas,
                (DATEDIFF(r.data_fim, r.data_inicio) + 1) * t.preco AS valor_previsto,
                a.id AS aluguer_id,
                a.estado AS aluguer_estado,
                EXISTS (
                    SELECT 1
                    FROM multa m
                    INNER JOIN aluguer a2 ON m.aluguer_id = a2.id
                    INNER JOIN reserva r2 ON a2.reserva_id = r2.id
                    WHERE r2.cliente_id = r.cliente_id
                      AND m.estado = 'pendente'
                ) AS tem_multa
            FROM reserva r
            INNER JOIN utilizador u ON r.cliente_id = u.id
            INNER JOIN tema t ON r.tema_id = t.id
            LEFT JOIN aluguer a ON a.reserva_id = r.id
            WHERE r.estado = 'confirmada'
              AND r.data_inicio = CURDATE()
              AND (a.id IS NULL OR a.estado = 'aguarda_inspecao')
            ORDER BY u.nome ASC
        `);

        return res.status(200).json(linhas.map((l) => ({
            ...l,
            tem_multa: Boolean(Number(l.tem_multa)),
            devolucao_ate: `${paraISO(l.data_fim)} ${HORA_DEVOLUCAO}:00`
        })));

    } catch (erro) {
        console.error('Erro ao listar levantamentos:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar os levantamentos de hoje.'
        });
    }
};

// Registar inspeção obrigatória de entrega e o pagamento.
// multipart: estado_inspecao, observacoes, forma_pagamento, fotos[]
// Inspeção aprovada -> recebe o pagamento e o tema é entregue.
const registarInspecaoEntrega = async (req, res) => {
    let conexao;

    try {
        if (!verificarPermissao(req.utilizador)) {
            removerFicheirosDoPedido(req);
            return res.status(403).json({
                mensagem: 'Apenas funcionários e administradores podem registar inspeções.'
            });
        }

        const { id } = req.params;
        const { estado_inspecao, observacoes, forma_pagamento } = req.body;

        const recusar = (status, mensagem) => {
            removerFicheirosDoPedido(req);
            return res.status(status).json({ mensagem });
        };

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return recusar(400, 'ID de aluguer inválido.');
        }

        if (!ESTADOS_INSPECAO.includes(estado_inspecao)) {
            return recusar(400, 'O estado da inspeção deve ser bom, danificado ou incompleto.');
        }

        if (observacoes !== undefined && observacoes !== null && typeof observacoes !== 'string') {
            return recusar(400, 'As observações devem ser texto.');
        }

        // O tema só sai da loja depois de pago
        if (estado_inspecao === 'bom' && !FORMAS_PAGAMENTO.includes(forma_pagamento)) {
            return recusar(400, 'Indica a forma de pagamento: numerario, multibanco ou mbway.');
        }

        conexao = await db.getConnection();
        await conexao.beginTransaction();

        const [alugueres] = await conexao.query(`
            SELECT
                a.id,
                a.estado,
                a.data_prevista_devolucao,
                r.id AS reserva_id,
                r.cliente_id,
                r.tema_id,
                r.data_inicio,
                r.data_fim,
                t.nome AS tema_nome,
                (DATEDIFF(r.data_fim, r.data_inicio) + 1) * t.preco AS valor_total
            FROM aluguer a
            INNER JOIN reserva r ON a.reserva_id = r.id
            INNER JOIN tema t ON r.tema_id = t.id
            WHERE a.id = ?
            FOR UPDATE
        `, [id]);

        if (alugueres.length === 0) {
            await conexao.rollback();
            return recusar(404, 'Aluguer não encontrado.');
        }

        const aluguer = alugueres[0];

        if (aluguer.estado !== 'aguarda_inspecao') {
            await conexao.rollback();
            return recusar(400, 'Este aluguer não está à espera de inspeção de entrega.');
        }

        await conexao.query(`
            INSERT INTO inspecao (
                aluguer_id,
                funcionario_id,
                momento,
                estado,
                observacoes,
                fotos
            )
            VALUES (?, ?, 'entrega', ?, ?, ?)
        `, [
            id,
            req.utilizador.id,
            estado_inspecao,
            observacoes ? observacoes.trim() : null,
            fotosDoPedido(req)
        ]);

        if (estado_inspecao === 'bom') {
            // Inspeção aprovada: pagamento recebido e tema entregue
            await conexao.query(`
                UPDATE aluguer
                SET estado = 'ativo',
                    valor_total = ?,
                    forma_pagamento = ?
                WHERE id = ?
            `, [aluguer.valor_total, forma_pagamento, id]);

            await conexao.query(`
                UPDATE tema
                SET estado = 'alugado'
                WHERE id = ?
            `, [aluguer.tema_id]);

            await conexao.commit();

            notificacao.notificarPorId(aluguer.cliente_id, {
                assunto: 'Aluguer registado',
                mensagem:
                    `Recebemos o pagamento de ${formatarEuros(aluguer.valor_total)} e entregámos o tema ${aluguer.tema_nome}.\n` +
                    `Devolução até ${formatarDataHora(aluguer.data_prevista_devolucao)}. ` +
                    'Se a devolução atrasar mais de 48 horas, é aplicada uma multa automática. Boa festa!'
            });

            tempoReal.avisarAlteracao({ area: 'alugueres', clienteId: aluguer.cliente_id });

            return res.status(200).json({
                mensagem: 'Pagamento recebido e tema alugado. O cliente recebeu o recibo por email e WhatsApp.',
                aluguer_id: Number(id),
                estado: 'ativo',
                estado_tema: 'alugado',
                estado_inspecao,
                valor_total: Number(aluguer.valor_total),
                forma_pagamento,
                data_prevista_devolucao: aluguer.data_prevista_devolucao
            });
        }

        // Inspeção reprovada: o tema não pode sair. Cancelar o aluguer e a reserva.
        await conexao.query(`
            UPDATE aluguer
            SET estado = 'cancelado'
            WHERE id = ?
        `, [id]);

        await conexao.query(`
            UPDATE reserva
            SET estado = 'cancelada', decidida_em = NOW()
            WHERE id = ?
        `, [aluguer.reserva_id]);

        // O tema fica indisponível até ser reparado
        await conexao.query(`
            UPDATE tema
            SET estado = 'manutencao'
            WHERE id = ?
        `, [aluguer.tema_id]);

        await conexao.commit();

        notificacao.notificarPorId(aluguer.cliente_id, {
            assunto: 'Não foi possível entregar o tema',
            mensagem:
                `Na verificação antes da festa, o tema ${aluguer.tema_nome} não estava em condições de ser entregue. ` +
                `Pedimos desculpa: a reserva de ${formatarPeriodo(aluguer.data_inicio, aluguer.data_fim)} foi cancelada e não pagou nada. ` +
                'Fale connosco para encontrarmos outro tema.'
        });

        tempoReal.avisarAlteracao({
            area: 'alugueres',
            temaId: aluguer.tema_id,
            clienteId: aluguer.cliente_id
        });

        return res.status(200).json({
            mensagem: 'Inspeção reprovada. O aluguer e a reserva foram cancelados. O tema ficou em manutenção.',
            aluguer_id: Number(id),
            reserva_id: Number(aluguer.reserva_id),
            estado: 'cancelado',
            estado_tema: 'manutencao',
            estado_inspecao
        });

    } catch (erro) {
        if (conexao) await conexao.rollback();
        removerFicheirosDoPedido(req);

        console.error('Erro na inspeção de entrega:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao registar a inspeção de entrega.'
        });

    } finally {
        if (conexao) conexao.release();
    }
};

// Registar devolução e inspeção obrigatória.
// multipart: estado_inspecao, observacoes, fotos[], valor_multa, motivo_multa
// Com danos ou peças em falta, pode ser aplicada uma multa (valor_multa > 0).
const registarDevolucao = async (req, res) => {
    let conexao;

    try {
        if (!verificarPermissao(req.utilizador)) {
            removerFicheirosDoPedido(req);
            return res.status(403).json({
                mensagem: 'Apenas funcionários e administradores podem registar devoluções.'
            });
        }

        const { id } = req.params;
        const { estado_inspecao, observacoes } = req.body;
        const valorMulta = req.body.valor_multa ? Number(req.body.valor_multa) : 0;

        const recusar = (status, mensagem) => {
            removerFicheirosDoPedido(req);
            return res.status(status).json({ mensagem });
        };

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return recusar(400, 'ID de aluguer inválido.');
        }

        if (!ESTADOS_INSPECAO.includes(estado_inspecao)) {
            return recusar(400, 'O estado da inspeção deve ser bom, danificado ou incompleto.');
        }

        if (observacoes !== undefined && observacoes !== null && typeof observacoes !== 'string') {
            return recusar(400, 'As observações devem ser texto.');
        }

        if (!Number.isFinite(valorMulta) || valorMulta < 0) {
            return recusar(400, 'O valor da multa deve ser um número igual ou superior a zero.');
        }

        if (estado_inspecao === 'bom' && valorMulta > 0) {
            return recusar(400, 'Só é possível aplicar multa quando o tema volta com danos ou incompleto.');
        }

        if (estado_inspecao !== 'bom' && !(observacoes && observacoes.trim())) {
            return recusar(400, 'Descreve os danos ou as peças em falta nas observações.');
        }

        conexao = await db.getConnection();
        await conexao.beginTransaction();

        const [alugueres] = await conexao.query(`
            SELECT
                a.id,
                a.estado,
                a.data_prevista_devolucao,
                a.data_devolucao_real,
                r.id AS reserva_id,
                r.cliente_id,
                r.tema_id,
                t.nome AS tema_nome
            FROM aluguer a
            INNER JOIN reserva r ON a.reserva_id = r.id
            INNER JOIN tema t ON r.tema_id = t.id
            WHERE a.id = ?
            FOR UPDATE
        `, [id]);

        if (alugueres.length === 0) {
            await conexao.rollback();
            return recusar(404, 'Aluguer não encontrado.');
        }

        const aluguer = alugueres[0];

        if (!['ativo', 'atrasado'].includes(aluguer.estado)) {
            await conexao.rollback();
            return recusar(400, 'Só é possível registar a devolução de alugueres ativos ou atrasados.');
        }

        if (aluguer.data_devolucao_real) {
            await conexao.rollback();
            return recusar(400, 'Este aluguer já tem uma devolução registada.');
        }

        await conexao.query(`
            INSERT INTO inspecao (
                aluguer_id,
                funcionario_id,
                momento,
                estado,
                observacoes,
                fotos
            )
            VALUES (?, ?, 'devolucao', ?, ?, ?)
        `, [
            id,
            req.utilizador.id,
            estado_inspecao,
            observacoes ? observacoes.trim() : null,
            fotosDoPedido(req)
        ]);

        await conexao.query(`
            UPDATE aluguer
            SET
                data_devolucao_real = NOW(),
                estado = 'devolvido'
            WHERE id = ?
        `, [id]);

        await conexao.query(`
            UPDATE reserva
            SET estado = 'concluida'
            WHERE id = ?
        `, [aluguer.reserva_id]);

        // Multa por danos ou peças em falta.
        // Cada aluguer tem no máximo uma multa: se já existir (atraso), o valor é somado.
        let multaAplicada = null;

        if (valorMulta > 0) {
            const motivo = estado_inspecao === 'danificado'
                ? `Danos no tema: ${observacoes.trim()}`
                : `Peças em falta: ${observacoes.trim()}`;

            const [multas] = await conexao.query(
                'SELECT id, estado, valor, motivo FROM multa WHERE aluguer_id = ? FOR UPDATE',
                [id]
            );

            if (multas.length === 0) {
                await conexao.query(
                    'INSERT INTO multa (aluguer_id, motivo, valor) VALUES (?, ?, ?)',
                    [id, motivo.slice(0, 255), valorMulta]
                );

                multaAplicada = valorMulta;

            } else if (multas[0].estado === 'pendente') {
                const total = Number(multas[0].valor) + valorMulta;

                await conexao.query(
                    'UPDATE multa SET valor = ?, motivo = ? WHERE id = ?',
                    [total, `${multas[0].motivo} ${motivo}`.slice(0, 255), multas[0].id]
                );

                multaAplicada = total;

            } else {
                await conexao.rollback();
                return recusar(409, 'A multa deste aluguer já foi paga ou anulada. Fala com o administrador.');
            }
        }

        let estadoTema;
        let mensagem;

        if (estado_inspecao === 'bom') {
            estadoTema = await atualizarDisponibilidadeTema(
                conexao,
                aluguer.tema_id,
                aluguer.reserva_id
            );

            mensagem = 'Devolução registada. A inspeção foi aprovada e o tema está novamente disponível.';

        } else {
            await conexao.query(`
                UPDATE tema
                SET estado = 'manutencao'
                WHERE id = ?
            `, [aluguer.tema_id]);

            estadoTema = 'manutencao';

            mensagem = 'Devolução registada. O tema ficou em manutenção até ser reparado.' +
                (multaAplicada ? ' Foi aplicada uma multa ao cliente.' : '');
        }

        await conexao.commit();

        notificacao.notificarPorId(aluguer.cliente_id, {
            assunto: 'Devolução registada',
            mensagem:
                `Recebemos o tema ${aluguer.tema_nome}. Obrigado!` +
                (multaAplicada
                    ? `\nNa verificação depois da festa encontrámos um problema: ${observacoes.trim()}. ` +
                      `Foi aplicada uma multa de ${formatarEuros(multaAplicada)}. ` +
                      'Até a pagar na loja, não pode fazer reservas nem usar a lista de espera.'
                    : '')
        });

        tempoReal.avisarAlteracao({
            area: 'alugueres',
            temaId: aluguer.tema_id,
            clienteId: aluguer.cliente_id
        });

        return res.status(200).json({
            mensagem,
            aluguer_id: Number(id),
            reserva_id: Number(aluguer.reserva_id),
            estado: 'devolvido',
            estado_inspecao,
            estado_tema: estadoTema,
            multa: multaAplicada
        });

    } catch (erro) {
        if (conexao) await conexao.rollback();
        removerFicheirosDoPedido(req);

        console.error('Erro ao registar devolução:', erro);

        return res.status(500).json({
            mensagem: 'Erro interno ao registar a devolução.'
        });

    } finally {
        if (conexao) conexao.release();
    }
};

module.exports = {
    listar,
    consultar,
    meusAlugueres,
    listarAtivos,
    levantamentosHoje,
    criar,
    registarInspecaoEntrega,
    registarDevolucao
};
