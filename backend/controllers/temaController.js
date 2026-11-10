
const temaModel = require('../models/temaModel');

// Listar todos os temas
const listar = async (req, res) => {
    try {
        const temas = await temaModel.listarTodos();

        return res.status(200).json({
            mensagem: 'Temas carregados com sucesso!',
            total: temas.length,
            temas
        });

    } catch (erro) {
        console.error('Erro ao listar temas:', erro);

        return res.status(500).json({
            mensagem: 'Erro interno ao listar temas.'
        });
    }
};

// Consultar um tema
const consultar = async (req, res) => {
    try {
        const { id } = req.params;

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                mensagem: 'ID do tema inválido.'
            });
        }

        const tema = await temaModel.procurarPorId(id);

        if (!tema) {
            return res.status(404).json({
                mensagem: 'Tema não encontrado.'
            });
        }

        return res.status(200).json({
            mensagem: 'Tema encontrado com sucesso!',
            tema
        });

    } catch (erro) {
        console.error('Erro ao consultar tema:', erro);

        return res.status(500).json({
            mensagem: 'Erro interno ao consultar tema.'
        });
    }
};

// Criar tema
const criar = async (req, res) => {
    try {
        const { nome, descricao, preco } = req.body;

        if (!nome || !String(nome).trim() ||
            preco === undefined || preco === null || preco === '') {
            return res.status(400).json({
                mensagem: 'Nome e preço são obrigatórios.'
            });
        }

        const precoNumerico = Number(preco);

        if (!Number.isFinite(precoNumerico) || precoNumerico <= 0) {
            return res.status(400).json({
                mensagem: 'O preço deve ser um valor numérico superior a zero.'
            });
        }

        const id = await temaModel.criar({
            nome: String(nome).trim(),
            descricao: descricao || null,
            preco: precoNumerico,
            imagem: null
        });

        return res.status(201).json({
            mensagem: 'Tema criado com sucesso!',
            id
        });

    } catch (erro) {
        console.error('Erro ao criar tema:', erro);

        return res.status(500).json({
            mensagem: 'Erro interno ao criar tema.'
        });
    }
};

// Atualizar tema
const atualizar = async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, descricao, preco } = req.body;

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                mensagem: 'ID do tema inválido.'
            });
        }

        if (!nome || !String(nome).trim() ||
            preco === undefined || preco === null || preco === '') {
            return res.status(400).json({
                mensagem: 'Nome e preço são obrigatórios.'
            });
        }

        const precoNumerico = Number(preco);

        if (!Number.isFinite(precoNumerico) || precoNumerico <= 0) {
            return res.status(400).json({
                mensagem: 'O preço deve ser superior a zero.'
            });
        }

        const temaExistente = await temaModel.procurarPorId(id);

        if (!temaExistente) {
            return res.status(404).json({
                mensagem: 'Tema não encontrado.'
            });
        }

        const imagem = req.body.imagem !== undefined
            ? req.body.imagem
            : temaExistente.imagem;

        await temaModel.atualizar(id, {
            nome: String(nome).trim(),
            descricao: descricao || null,
            preco: precoNumerico,
            imagem
        });

        return res.status(200).json({
            mensagem: 'Tema atualizado com sucesso!'
        });

    } catch (erro) {
        console.error('Erro ao atualizar tema:', erro);

        return res.status(500).json({
            mensagem: 'Erro interno ao atualizar tema.'
        });
    }
};

// Alterar estado do tema
const alterarEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        const estadosPermitidos = [
            'ativo',
            'inativo',
            'manutencao'
        ];

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                mensagem: 'ID do tema inválido.'
            });
        }

        if (!estadosPermitidos.includes(estado)) {
            return res.status(400).json({
                mensagem: 'Estado inválido.'
            });
        }

        const tema = await temaModel.procurarPorId(id);

        if (!tema) {
            return res.status(404).json({
                mensagem: 'Tema não encontrado.'
            });
        }

        await temaModel.alterarEstado(id, estado);

        return res.status(200).json({
            mensagem: 'Estado do tema atualizado com sucesso!',
            estado
        });

    } catch (erro) {
        console.error('Erro ao alterar estado:', erro);

        return res.status(500).json({
            mensagem: 'Erro interno ao alterar estado.'
        });
    }
};

module.exports = {
    listar,
    consultar,
    criar,
    atualizar,
    alterarEstado
};
