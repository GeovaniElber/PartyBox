
const notificacaoModel = require('../models/notificacaoModel');

// Listar notificações do utilizador autenticado
const minhasNotificacoes = async (req, res) => {
    try {
        const utilizadorId = req.utilizador.id;

        const notificacoes =
            await notificacaoModel.listarPorUtilizador(utilizadorId);

        res.status(200).json({
            sucesso: true,
            total: notificacoes.length,
            notificacoes
        });

    } catch (erro) {
        console.error('Erro ao listar notificações:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao listar notificações.'
        });
    }
};

// Consultar uma notificação
const consultar = async (req, res) => {
    try {
        const { id } = req.params;
        const utilizadorId = req.utilizador.id;

        const notificacao = await notificacaoModel.procurarPorId(id);

        if (!notificacao) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'Notificação não encontrada.'
            });
        }

        if (
            req.utilizador.tipo === 'cliente' &&
            notificacao.utilizador_id !== utilizadorId
        ) {
            return res.status(403).json({
                sucesso: false,
                mensagem: 'Não tens autorização para consultar esta notificação.'
            });
        }

        res.status(200).json({
            sucesso: true,
            notificacao
        });

    } catch (erro) {
        console.error('Erro ao consultar notificação:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao consultar notificação.'
        });
    }
};

// Marcar notificação como lida
const marcarComoLida = async (req, res) => {
    try {
        const { id } = req.params;
        const utilizadorId = req.utilizador.id;

        const resultado = await notificacaoModel.marcarComoLida(
            id,
            utilizadorId
        );

        if (resultado === 0) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'Notificação não encontrada.'
            });
        }

        res.status(200).json({
            sucesso: true,
            mensagem: 'Notificação marcada como lida.'
        });

    } catch (erro) {
        console.error('Erro ao marcar notificação:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao atualizar notificação.'
        });
    }
};

// Contar notificações não lidas
const contarNaoLidas = async (req, res) => {
    try {
        const utilizadorId = req.utilizador.id;

        const total = await notificacaoModel.contarNaoLidas(utilizadorId);

        res.status(200).json({
            sucesso: true,
            total
        });

    } catch (erro) {
        console.error('Erro ao contar notificações:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao contar notificações.'
        });
    }
};

// Criar notificação (funcionário/administrador)
const criar = async (req, res) => {
    try {
        const {
            utilizador_id,
            titulo,
            mensagem,
            canal,
            estado_envio
        } = req.body;

        if (!utilizador_id || !titulo || !mensagem) {
            return res.status(400).json({
                sucesso: false,
                mensagem: 'Utilizador, título e mensagem são obrigatórios.'
            });
        }

        const id = await notificacaoModel.criar({
            utilizador_id,
            titulo,
            mensagem,
            canal,
            estado_envio
        });

        res.status(201).json({
            sucesso: true,
            mensagem: 'Notificação criada com sucesso.',
            id
        });

    } catch (erro) {
        console.error('Erro ao criar notificação:', erro);

        res.status(500).json({
            sucesso: false,
            mensagem: 'Erro ao criar notificação.'
        });
    }
};

module.exports = {
    minhasNotificacoes,
    consultar,
    marcarComoLida,
    contarNaoLidas,
    criar
};
