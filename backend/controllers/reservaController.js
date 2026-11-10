
const reservaModel = require('../models/reservaModel');
const temaModel = require('../models/temaModel');
const db = require('../src/config/database');

// Listar todas as reservas
const listar = async (req, res) => {
    try {
        const reservas = await reservaModel.listarTodas();

        return res.status(200).json(reservas);
    } catch (erro) {
        console.error('Erro ao listar reservas:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar as reservas.'
        });
    }
};

// Consultar uma reserva
const consultar = async (req, res) => {
    try {
        const { id } = req.params;

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                mensagem: 'ID de reserva inválido.'
            });
        }

        const reserva = await reservaModel.procurarPorId(id);

        if (!reserva) {
            return res.status(404).json({
                mensagem: 'Reserva não encontrada.'
            });
        }

        // O cliente só pode consultar as suas próprias reservas
        if (
            req.utilizador.tipo === 'cliente' &&
            Number(reserva.cliente_id) !== Number(req.utilizador.id)
        ) {
            return res.status(403).json({
                mensagem: 'Não tens autorização para consultar esta reserva.'
            });
        }

        return res.status(200).json(reserva);

    } catch (erro) {
        console.error('Erro ao consultar reserva:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar a reserva.'
        });
    }
};

// Listar reservas do próprio cliente
const minhasReservas = async (req, res) => {
    try {
        const reservas = await reservaModel.listarPorCliente(
            req.utilizador.id
        );

        return res.status(200).json(reservas);

    } catch (erro) {
        console.error('Erro ao consultar reservas do cliente:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar as tuas reservas.'
        });
    }
};

// Criar uma reserva
const criar = async (req, res) => {
    try {
        const { tema_id, data_inicio, data_fim } = req.body;

        // Validar campos obrigatórios
        if (!tema_id || !data_inicio || !data_fim) {
            return res.status(400).json({
                mensagem: 'Preenche todos os campos obrigatórios.'
            });
        }

        // Validar ID do tema
        if (!Number.isInteger(Number(tema_id)) || Number(tema_id) <= 0) {
            return res.status(400).json({
                mensagem: 'ID do tema inválido.'
            });
        }

        // Identificar o cliente da reserva
        let clienteId;

        if (req.utilizador.tipo === 'cliente') {
            // Cliente só pode reservar para si próprio
            clienteId = req.utilizador.id;
        } else {
            // Funcionário e administrador indicam o cliente
            clienteId = req.body.cliente_id;

            if (
                clienteId === undefined ||
                clienteId === null ||
                !Number.isInteger(Number(clienteId)) ||
                Number(clienteId) <= 0
            ) {
                return res.status(400).json({
                    mensagem: 'Indica um ID de cliente válido.'
                });
            }
        }

        // Confirmar que o cliente existe e está ativo
        const [clientes] = await db.query(`
            SELECT id
            FROM utilizador
            WHERE id = ?
              AND tipo = 'cliente'
              AND ativo = 1
            LIMIT 1
        `, [clienteId]);

        if (clientes.length === 0) {
            return res.status(404).json({
                mensagem: 'Cliente não encontrado ou conta inativa.'
            });
        }

        // Validar formato das datas
        const formatoData = /^\d{4}-\d{2}-\d{2}$/;

        const dataValida = (data) => {
            if (typeof data !== 'string' || !formatoData.test(data)) {
                return false;
            }

            const [ano, mes, dia] = data.split('-').map(Number);

            const dataObjeto = new Date(
                Date.UTC(ano, mes - 1, dia)
            );

            return (
                dataObjeto.getUTCFullYear() === ano &&
                dataObjeto.getUTCMonth() === mes - 1 &&
                dataObjeto.getUTCDate() === dia
            );
        };

        if (!dataValida(data_inicio) || !dataValida(data_fim)) {
            return res.status(400).json({
                mensagem: 'As datas devem estar no formato AAAA-MM-DD e ser válidas.'
            });
        }

        // Validar período
        if (data_fim < data_inicio) {
            return res.status(400).json({
                mensagem: 'A data de fim não pode ser anterior à data de início.'
            });
        }

        // Impedir reservas para datas passadas
        const hoje = new Date().toLocaleDateString('en-CA', {
            timeZone: 'Europe/Lisbon'
        });

        if (data_inicio < hoje) {
            return res.status(400).json({
                mensagem: 'Não é possível reservar para uma data passada.'
            });
        }

        // Verificar multas pendentes do cliente
        const [multas] = await db.query(`
            SELECT m.id
            FROM multa m
            INNER JOIN aluguer a ON m.aluguer_id = a.id
            INNER JOIN reserva r ON a.reserva_id = r.id
            WHERE r.cliente_id = ?
              AND m.estado = 'pendente'
            LIMIT 1
        `, [clienteId]);

        if (multas.length > 0) {
            return res.status(403).json({
                mensagem: 'Este cliente tem multas pendentes. Regulariza o pagamento antes de fazer uma reserva.'
            });
        }

        // Verificar se o tema existe
        const tema = await temaModel.procurarPorId(tema_id);

        if (!tema) {
            return res.status(404).json({
                mensagem: 'Tema não encontrado.'
            });
        }

        // Só temas ativos podem ser reservados
        if (tema.estado !== 'ativo') {
            return res.status(400).json({
                mensagem: 'Este tema não está disponível para reserva.'
            });
        }

        // Verificar conflitos de datas
        const existeConflito = await reservaModel.verificarConflito(
            tema_id,
            data_inicio,
            data_fim
        );

        if (existeConflito) {
            return res.status(409).json({
                mensagem: 'Este tema já tem uma reserva ou pedido de reserva para esse período.'
            });
        }

        // Criar reserva
        const reservaId = await reservaModel.criar({
            cliente_id: clienteId,
            tema_id,
            data_inicio,
            data_fim
        });

        return res.status(201).json({
            mensagem: 'Reserva criada com sucesso. Aguarda confirmação da loja.',
            reserva_id: reservaId,
            cliente_id: clienteId,
            estado: 'pendente'
        });

    } catch (erro) {
        console.error('Erro ao criar reserva:', erro);

        return res.status(500).json({
            mensagem: 'Erro interno ao criar a reserva.'
        });
    }
};


// Confirmar ou cancelar uma reserva
const atualizarEstado = async (req, res) => {
    let conexao;

    try {
        const { id } = req.params;
        const { estado } = req.body;

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                mensagem: 'ID de reserva inválido.'
            });
        }

        if (!['confirmada', 'cancelada'].includes(estado)) {
            return res.status(400).json({
                mensagem: 'O estado deve ser confirmada ou cancelada.'
            });
        }

        conexao = await db.getConnection();
        await conexao.beginTransaction();

        // Procurar e bloquear a reserva
        const [reservas] = await conexao.query(`
            SELECT
                r.id,
                r.cliente_id,
                r.tema_id,
                r.data_inicio,
                r.data_fim,
                r.estado,
                u.ativo AS cliente_ativo,
                t.estado AS tema_estado
            FROM reserva r
            INNER JOIN utilizador u ON r.cliente_id = u.id
            INNER JOIN tema t ON r.tema_id = t.id
            WHERE r.id = ?
            FOR UPDATE
        `, [id]);

        if (reservas.length === 0) {
            await conexao.rollback();

            return res.status(404).json({
                mensagem: 'Reserva não encontrada.'
            });
        }

        const reserva = reservas[0];

        // Só reservas pendentes podem ser confirmadas
        if (estado === 'confirmada') {

            if (reserva.estado !== 'pendente') {
                await conexao.rollback();

                return res.status(400).json({
                    mensagem: 'Só é possível confirmar reservas pendentes.'
                });
            }

            // Confirmar que o cliente continua ativo
            if (Number(reserva.cliente_ativo) !== 1) {
                await conexao.rollback();

                return res.status(400).json({
                    mensagem: 'Não é possível confirmar a reserva: o cliente está inativo.'
                });
            }

            // Não confirmar reservas com início no passado
            const [datas] = await conexao.query(`
                SELECT DATE(?) < CURDATE() AS data_passada
            `, [reserva.data_inicio]);

            if (Number(datas[0].data_passada) === 1) {
                await conexao.rollback();

                return res.status(400).json({
                    mensagem: 'Não é possível confirmar uma reserva com data de início passada.'
                });
            }

            // Verificar se o tema está em condições de ser reservado
            if (['manutencao', 'inativo'].includes(reserva.tema_estado)) {
                await conexao.rollback();

                return res.status(400).json({
                    mensagem: 'Não é possível confirmar: o tema está em manutenção ou inativo.'
                });
            }

            // Verificar multas pendentes do cliente
            const [multas] = await conexao.query(`
                SELECT id
                FROM multa
                WHERE estado = 'pendente'
                  AND aluguer_id IN (
                      SELECT a.id
                      FROM aluguer a
                      INNER JOIN reserva r ON a.reserva_id = r.id
                      WHERE r.cliente_id = ?
                  )
                LIMIT 1
            `, [reserva.cliente_id]);

            if (multas.length > 0) {
                await conexao.rollback();

                return res.status(403).json({
                    mensagem: 'Este cliente tem multas pendentes e não pode ter novas reservas confirmadas.'
                });
            }

            // Verificar conflitos, considerando as datas inclusivas
            const [conflitos] = await conexao.query(`
                SELECT id
                FROM reserva
                WHERE tema_id = ?
                  AND id <> ?
                  AND estado IN ('pendente', 'confirmada')
                  AND data_inicio <= ?
                  AND data_fim >= ?
                LIMIT 1
            `, [
                reserva.tema_id,
                id,
                reserva.data_fim,
                reserva.data_inicio
            ]);

            if (conflitos.length > 0) {
                await conexao.rollback();

                return res.status(409).json({
                    mensagem: 'Não é possível confirmar: o tema já tem outra reserva para esse período.'
                });
            }
        }

        // Não permitir cancelar uma reserva que já originou um aluguer
        if (estado === 'cancelada') {

            if (!['pendente', 'confirmada'].includes(reserva.estado)) {
                await conexao.rollback();

                return res.status(400).json({
                    mensagem: 'Esta reserva não pode ser cancelada no estado atual.'
                });
            }

            const [alugueres] = await conexao.query(`
                SELECT id
                FROM aluguer
                WHERE reserva_id = ?
                LIMIT 1
            `, [id]);

            if (alugueres.length > 0) {
                await conexao.rollback();

                return res.status(409).json({
                    mensagem: 'Não é possível cancelar: esta reserva já possui um aluguer associado.'
                });
            }
        }

        // Atualizar estado
        await conexao.query(`
            UPDATE reserva
            SET estado = ?
            WHERE id = ?
        `, [estado, id]);

        await conexao.commit();

        return res.status(200).json({
            mensagem: estado === 'confirmada'
                ? 'Reserva confirmada com sucesso.'
                : 'Reserva cancelada com sucesso.',
            reserva_id: Number(id),
            estado
        });

    } catch (erro) {
        if (conexao) await conexao.rollback();

        console.error('Erro ao atualizar estado da reserva:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao atualizar o estado da reserva.'
        });

    } finally {
        if (conexao) conexao.release();
    }
};


module.exports = {
    listar,
    consultar,
    minhasReservas,
    criar,
    atualizarEstado
};
