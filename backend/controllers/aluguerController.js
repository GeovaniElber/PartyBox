
const aluguerModel = require('../models/aluguerModel');
const db = require('../src/config/database');

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

        if (!reserva_id || !data_prevista_devolucao) {
            return res.status(400).json({
                mensagem: 'Preenche o ID da reserva e a data prevista de devolução.'
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

        if (!validarDataHora(data_prevista_devolucao)) {
            return res.status(400).json({
                mensagem: 'A data prevista deve estar no formato AAAA-MM-DD HH:mm:ss.'
            });
        }

        const dataPrevista = data_prevista_devolucao.replace('T', ' ');

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

// Registar inspeção obrigatória de entrega
const registarInspecaoEntrega = async (req, res) => {
    let conexao;

    try {
        if (!verificarPermissao(req.utilizador)) {
            return res.status(403).json({
                mensagem: 'Apenas funcionários e administradores podem registar inspeções.'
            });
        }

        const { id } = req.params;
        const { estado_inspecao, observacoes } = req.body;

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                mensagem: 'ID de aluguer inválido.'
            });
        }

        if (!['bom', 'danificado'].includes(estado_inspecao)) {
            return res.status(400).json({
                mensagem: 'O estado da inspeção deve ser bom ou danificado.'
            });
        }

        if (
            observacoes !== undefined &&
            observacoes !== null &&
            typeof observacoes !== 'string'
        ) {
            return res.status(400).json({
                mensagem: 'As observações devem ser texto.'
            });
        }

        conexao = await db.getConnection();
        await conexao.beginTransaction();

        // Bloquear o aluguer
        const [alugueres] = await conexao.query(`
            SELECT
                a.id,
                a.estado,
                r.id AS reserva_id,
                r.tema_id
            FROM aluguer a
            INNER JOIN reserva r ON a.reserva_id = r.id
            WHERE a.id = ?
            FOR UPDATE
        `, [id]);

        if (alugueres.length === 0) {
            await conexao.rollback();

            return res.status(404).json({
                mensagem: 'Aluguer não encontrado.'
            });
        }

        const aluguer = alugueres[0];

        if (aluguer.estado !== 'aguarda_inspecao') {
            await conexao.rollback();

            return res.status(400).json({
                mensagem: 'Este aluguer não está à espera de inspeção de entrega.'
            });
        }

        // Registar inspeção
        await conexao.query(`
            INSERT INTO inspecao (
                aluguer_id,
                funcionario_id,
                momento,
                estado,
                observacoes
            )
            VALUES (?, ?, 'entrega', ?, ?)
        `, [
            id,
            req.utilizador.id,
            estado_inspecao,
            observacoes ? observacoes.trim() : null
        ]);

        if (estado_inspecao === 'bom') {
            // Inspeção aprovada: o tema passa a alugado
            await conexao.query(`
                UPDATE aluguer
                SET estado = 'ativo'
                WHERE id = ?
            `, [id]);

            await conexao.query(`
                UPDATE tema
                SET estado = 'alugado'
                WHERE id = ?
            `, [aluguer.tema_id]);

            await conexao.commit();

            return res.status(200).json({
                mensagem: 'Inspeção aprovada. O aluguer está ativo e o tema pode ser entregue ao cliente.',
                aluguer_id: Number(id),
                estado: 'ativo',
                estado_tema: 'alugado',
                estado_inspecao
            });
        }

        // Inspeção reprovada: cancelar o aluguer e a reserva
        await conexao.query(`
            UPDATE aluguer
            SET estado = 'cancelado'
            WHERE id = ?
        `, [id]);

        await conexao.query(`
            UPDATE reserva
            SET estado = 'cancelada'
            WHERE id = ?
        `, [aluguer.reserva_id]);

        // O tema fica indisponível até ser reparado
        await conexao.query(`
            UPDATE tema
            SET estado = 'manutencao'
            WHERE id = ?
        `, [aluguer.tema_id]);

        await conexao.commit();

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

        console.error('Erro na inspeção de entrega:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao registar a inspeção de entrega.'
        });

    } finally {
        if (conexao) conexao.release();
    }
};

// Registar devolução e inspeção obrigatória
const registarDevolucao = async (req, res) => {
    let conexao;

    try {
        if (!verificarPermissao(req.utilizador)) {
            return res.status(403).json({
                mensagem: 'Apenas funcionários e administradores podem registar devoluções.'
            });
        }

        const { id } = req.params;
        const { estado_inspecao, observacoes } = req.body;

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                mensagem: 'ID de aluguer inválido.'
            });
        }

        if (!['bom', 'danificado'].includes(estado_inspecao)) {
            return res.status(400).json({
                mensagem: 'O estado da inspeção deve ser bom ou danificado.'
            });
        }

        if (
            observacoes !== undefined &&
            observacoes !== null &&
            typeof observacoes !== 'string'
        ) {
            return res.status(400).json({
                mensagem: 'As observações devem ser texto.'
            });
        }

        conexao = await db.getConnection();
        await conexao.beginTransaction();

        // Bloquear o aluguer e obter o tema e a reserva
        const [alugueres] = await conexao.query(`
            SELECT
                a.id,
                a.estado,
                a.data_prevista_devolucao,
                a.data_devolucao_real,
                r.id AS reserva_id,
                r.tema_id
            FROM aluguer a
            INNER JOIN reserva r ON a.reserva_id = r.id
            WHERE a.id = ?
            FOR UPDATE
        `, [id]);

        if (alugueres.length === 0) {
            await conexao.rollback();

            return res.status(404).json({
                mensagem: 'Aluguer não encontrado.'
            });
        }

        const aluguer = alugueres[0];

        if (!['ativo', 'atrasado'].includes(aluguer.estado)) {
            await conexao.rollback();

            return res.status(400).json({
                mensagem: 'Só é possível registar a devolução de alugueres ativos ou atrasados.'
            });
        }

        if (aluguer.data_devolucao_real) {
            await conexao.rollback();

            return res.status(400).json({
                mensagem: 'Este aluguer já tem uma devolução registada.'
            });
        }

        // Registar inspeção de devolução
        await conexao.query(`
            INSERT INTO inspecao (
                aluguer_id,
                funcionario_id,
                momento,
                estado,
                observacoes
            )
            VALUES (?, ?, 'devolucao', ?, ?)
        `, [
            id,
            req.utilizador.id,
            estado_inspecao,
            observacoes ? observacoes.trim() : null
        ]);

        // Registar devolução e concluir o aluguer
        await conexao.query(`
            UPDATE aluguer
            SET
                data_devolucao_real = NOW(),
                estado = 'devolvido'
            WHERE id = ?
        `, [id]);

        // Concluir a reserva que originou este aluguer
        await conexao.query(`
            UPDATE reserva
            SET estado = 'concluida'
            WHERE id = ?
        `, [aluguer.reserva_id]);

        let estadoTema;
        let mensagem;

        if (estado_inspecao === 'bom') {
            // O tema só fica ativo se não houver outras reservas futuras
            estadoTema = await atualizarDisponibilidadeTema(
                conexao,
                aluguer.tema_id,
                aluguer.reserva_id
            );

            mensagem = estadoTema === 'reservado'
                ? 'Devolução registada. A inspeção foi aprovada e o tema ficou reservado para outra reserva.'
                : 'Devolução registada. A inspeção foi aprovada e o tema está novamente disponível.';

        } else {
            // Tema danificado: fica em manutenção
            await conexao.query(`
                UPDATE tema
                SET estado = 'manutencao'
                WHERE id = ?
            `, [aluguer.tema_id]);

            estadoTema = 'manutencao';

            mensagem = 'Devolução registada, mas o tema apresenta danos. Ficou em manutenção e não pode ser reservado até ser reparado.';
        }

        await conexao.commit();

        return res.status(200).json({
            mensagem,
            aluguer_id: Number(id),
            reserva_id: Number(aluguer.reserva_id),
            estado: 'devolvido',
            estado_inspecao,
            estado_tema: estadoTema
        });

    } catch (erro) {
        if (conexao) await conexao.rollback();

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
    criar,
    registarInspecaoEntrega,
    registarDevolucao
};
