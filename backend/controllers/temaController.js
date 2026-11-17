const temaModel = require('../models/temaModel');
const listaEspera = require('../services/listaEsperaService');
const tempoReal = require('../src/socket');
const { removerFicheiro, removerFicheirosDoPedido } = require('../middlewares/criarUpload');
const { responderErro, idValido } = require('../utils/erros');

const EQUIPA = ['funcionario', 'administrador'];

// Validar os campos do formulário do tema. Devolve { erro } ou { dados }.
const lerDadosTema = (body) => {
    const { nome, categoria, descricao, pecas, preco } = body;

    if (!nome || !String(nome).trim()) {
        return { erro: 'O nome do tema é obrigatório.' };
    }

    if (!categoria || !String(categoria).trim()) {
        return { erro: 'A categoria (faixa etária) é obrigatória.' };
    }

    const precoNumerico = Number(preco);

    if (preco === undefined || preco === '' || !Number.isFinite(precoNumerico) || precoNumerico <= 0) {
        return { erro: 'O preço por dia deve ser um valor superior a zero.' };
    }

    return {
        dados: {
            nome: String(nome).trim(),
            categoria: String(categoria).trim().slice(0, 50),
            descricao: descricao ? String(descricao).trim() : null,
            pecas: pecas ? String(pecas).trim() : null,
            preco: precoNumerico
        }
    };
};

// Listar temas. Público: visitantes veem os temas, sem disponibilidade.
const listar = async (req, res) => {
    try {
        const daEquipa = req.utilizador && EQUIPA.includes(req.utilizador.tipo);

        const temas = await temaModel.listarTodos({ incluirInativos: daEquipa });

        return res.status(200).json({
            mensagem: 'Temas carregados com sucesso!',
            total: temas.length,
            temas
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro interno ao listar temas.');
    }
};

// Consultar um tema, com a galeria. Público.
const consultar = async (req, res) => {
    try {
        const { id } = req.params;

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID do tema inválido.' });
        }

        const tema = await temaModel.procurarPorId(id);
        const daEquipa = req.utilizador && EQUIPA.includes(req.utilizador.tipo);

        if (!tema || (tema.estado === 'inativo' && !daEquipa)) {
            return res.status(404).json({ mensagem: 'Tema não encontrado.' });
        }

        const galeria = await temaModel.listarImagens(id);

        return res.status(200).json({
            mensagem: 'Tema encontrado com sucesso!',
            tema: { ...tema, galeria }
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro interno ao consultar tema.');
    }
};

// Criar tema (multipart: campos + "imagem" = imagem principal)
const criar = async (req, res) => {
    try {
        const { erro, dados } = lerDadosTema(req.body);

        if (erro) {
            removerFicheirosDoPedido(req);
            return res.status(400).json({ mensagem: erro });
        }

        const id = await temaModel.criar({
            ...dados,
            imagem: req.file ? req.file.filename : null
        });

        tempoReal.avisarAlteracao({ area: 'temas' });

        return res.status(201).json({
            mensagem: 'Tema criado com sucesso!',
            id
        });

    } catch (erro) {
        removerFicheirosDoPedido(req);
        return responderErro(res, erro, 'Erro interno ao criar tema.');
    }
};

// Atualizar tema (uma nova "imagem" substitui a imagem principal)
const atualizar = async (req, res) => {
    try {
        const { id } = req.params;

        if (!idValido(id)) {
            removerFicheirosDoPedido(req);
            return res.status(400).json({ mensagem: 'ID do tema inválido.' });
        }

        const { erro, dados } = lerDadosTema(req.body);

        if (erro) {
            removerFicheirosDoPedido(req);
            return res.status(400).json({ mensagem: erro });
        }

        const temaExistente = await temaModel.procurarPorId(id);

        if (!temaExistente) {
            removerFicheirosDoPedido(req);
            return res.status(404).json({ mensagem: 'Tema não encontrado.' });
        }

        const imagem = req.file ? req.file.filename : temaExistente.imagem;

        await temaModel.atualizar(id, { ...dados, imagem });

        if (req.file && temaExistente.imagem) {
            removerFicheiro('temas', temaExistente.imagem);
        }

        tempoReal.avisarAlteracao({ area: 'temas' });

        return res.status(200).json({
            mensagem: 'Tema atualizado com sucesso!',
            imagem
        });

    } catch (erro) {
        removerFicheirosDoPedido(req);
        return responderErro(res, erro, 'Erro interno ao atualizar tema.');
    }
};

// Alterar estado do tema: ativo, inativo ("Desativar tema") ou manutencao
const alterarEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID do tema inválido.' });
        }

        if (!['ativo', 'inativo', 'manutencao'].includes(estado)) {
            return res.status(400).json({ mensagem: 'Estado inválido. Utiliza ativo, inativo ou manutencao.' });
        }

        const tema = await temaModel.procurarPorId(id);

        if (!tema) {
            return res.status(404).json({ mensagem: 'Tema não encontrado.' });
        }

        await temaModel.alterarEstado(id, estado);

        tempoReal.avisarAlteracao({ area: 'temas', temaId: id });

        // Um tema que volta a estar ativo pode ter datas para a lista de espera
        if (estado === 'ativo') {
            listaEspera.distribuirSemFalhar(id);
        }

        return res.status(200).json({
            mensagem: 'Estado do tema atualizado com sucesso!',
            estado
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro interno ao alterar estado.');
    }
};

// Acrescentar fotografias à galeria (multipart: "imagens", até 10)
const adicionarImagens = async (req, res) => {
    try {
        const { id } = req.params;
        const ficheiros = req.files || [];

        if (!idValido(id)) {
            removerFicheirosDoPedido(req);
            return res.status(400).json({ mensagem: 'ID do tema inválido.' });
        }

        if (ficheiros.length === 0) {
            return res.status(400).json({ mensagem: 'Envia pelo menos uma fotografia.' });
        }

        const tema = await temaModel.procurarPorId(id);

        if (!tema) {
            removerFicheirosDoPedido(req);
            return res.status(404).json({ mensagem: 'Tema não encontrado.' });
        }

        const nomes = ficheiros.map((f) => f.filename);

        // Sem imagem principal, a primeira fotografia passa a ser a principal
        if (!tema.imagem) {
            await temaModel.atualizar(id, { ...tema, imagem: nomes.shift() });
        }

        if (nomes.length > 0) {
            await temaModel.adicionarImagens(id, nomes);
        }

        tempoReal.avisarAlteracao({ area: 'temas' });

        const galeria = await temaModel.listarImagens(id);
        const atualizado = await temaModel.procurarPorId(id);

        return res.status(201).json({
            mensagem: 'Fotografias adicionadas.',
            imagem: atualizado.imagem,
            galeria
        });

    } catch (erro) {
        removerFicheirosDoPedido(req);
        return responderErro(res, erro, 'Erro ao adicionar fotografias.');
    }
};

// Remover uma fotografia da galeria
const removerImagem = async (req, res) => {
    try {
        const { id, imagemId } = req.params;

        if (!idValido(id) || !idValido(imagemId)) {
            return res.status(400).json({ mensagem: 'ID inválido.' });
        }

        const imagem = await temaModel.procurarImagem(id, imagemId);

        if (!imagem) {
            return res.status(404).json({ mensagem: 'Fotografia não encontrada.' });
        }

        await temaModel.removerImagem(imagemId);
        removerFicheiro('temas', imagem.caminho);

        tempoReal.avisarAlteracao({ area: 'temas' });

        return res.status(200).json({ mensagem: 'Fotografia removida.' });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao remover a fotografia.');
    }
};

// Tornar uma fotografia da galeria a imagem principal
const definirPrincipal = async (req, res) => {
    try {
        const { id, imagemId } = req.params;

        if (!idValido(id) || !idValido(imagemId)) {
            return res.status(400).json({ mensagem: 'ID inválido.' });
        }

        const trocou = await temaModel.definirPrincipal(id, imagemId);

        if (!trocou) {
            return res.status(404).json({ mensagem: 'Fotografia não encontrada.' });
        }

        tempoReal.avisarAlteracao({ area: 'temas' });

        const tema = await temaModel.procurarPorId(id);
        const galeria = await temaModel.listarImagens(id);

        return res.status(200).json({
            mensagem: 'Imagem principal atualizada.',
            imagem: tema.imagem,
            galeria
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao definir a imagem principal.');
    }
};

module.exports = {
    listar,
    consultar,
    criar,
    atualizar,
    alterarEstado,
    adicionarImagens,
    removerImagem,
    definirPrincipal
};
