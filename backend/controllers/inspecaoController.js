
const inspecaoModel = require('../models/inspecaoModel');
const aluguerModel = require('../models/aluguerModel');

// Listar todas as inspeções (funcionários e administradores)
const listar = async (req, res) => {
    try {
        const inspecoes = await inspecaoModel.listarTodas();

        return res.status(200).json(inspecoes);

    } catch (erro) {
        console.error('Erro ao listar inspeções:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar as inspeções.'
        });
    }
};

// Consultar inspeções de um aluguer específico
const listarPorAluguer = async (req, res) => {
    try {
        const { aluguer_id } = req.params;

        if (!Number.isInteger(Number(aluguer_id)) || Number(aluguer_id) <= 0) {
            return res.status(400).json({
                mensagem: 'ID de aluguer inválido.'
            });
        }

        const aluguer = await aluguerModel.procurarPorId(aluguer_id);

        if (!aluguer) {
            return res.status(404).json({
                mensagem: 'Aluguer não encontrado.'
            });
        }

        // O cliente só pode consultar as inspeções dos seus alugueres.
        if (
            req.utilizador.tipo === 'cliente' &&
            Number(aluguer.cliente_id) !== Number(req.utilizador.id)
        ) {
            return res.status(403).json({
                mensagem: 'Não tens autorização para consultar estas inspeções.'
            });
        }

        const inspecoes = await inspecaoModel.listarPorAluguer(aluguer_id);

        return res.status(200).json(inspecoes);

    } catch (erro) {
        console.error('Erro ao consultar inspeções do aluguer:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar as inspeções deste aluguer.'
        });
    }
};

module.exports = {
    listar,
    listarPorAluguer
};
