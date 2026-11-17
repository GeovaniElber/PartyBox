const multaModel = require('../models/multaModel');
const db = require('../src/config/database');
const notificacao = require('../services/notificacaoService');
const listaEspera = require('../services/listaEsperaService');
const tempoReal = require('../src/socket');
const { responderErro, idValido } = require('../utils/erros');
const { formatarDataHora } = require('../utils/datas');

const FORMAS_PAGAMENTO = ['numerario', 'multibanco', 'mbway'];

// Valor da multa automática por atraso (configurável no .env)
const valorMultaAtraso = () => Number(process.env.VALOR_MULTA_ATRASO || 25);

const formatarEuros = (valor) => `${Number(valor).toFixed(2).replace('.', ',')} €`;

// Listar multas (funcionários e administradores). ?estado=pendente para só as por pagar.
const listar = async (req, res) => {
    try {
        const multas = req.query.estado === 'pendente'
            ? await multaModel.listarPendentes()
            : await multaModel.listarTodas();

        return res.status(200).json(multas);

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar as multas.');
    }
};

// Consultar uma multa pelo ID
const consultar = async (req, res) => {
    try {
        const { id } = req.params;

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID de multa inválido.' });
        }

        const multa = await multaModel.procurarPorId(id);

        if (!multa) {
            return res.status(404).json({ mensagem: 'Multa não encontrada.' });
        }

        // O cliente só pode consultar as suas próprias multas.
        if (
            req.utilizador.tipo === 'cliente' &&
            Number(multa.cliente_id) !== Number(req.utilizador.id)
        ) {
            return res.status(403).json({ mensagem: 'Não tens autorização para consultar esta multa.' });
        }

        return res.status(200).json(multa);

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar a multa.');
    }
};

// Consultar multas do próprio cliente
const minhasMultas = async (req, res) => {
    try {
        const multas = await multaModel.listarPorCliente(req.utilizador.id);

        return res.status(200).json(multas);

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar as tuas multas.');
    }
};

// Registar o pagamento de uma multa (funcionários e administradores)
const registarPagamento = async (req, res) => {
    try {
        const { id } = req.params;
        const { forma_pagamento } = req.body;

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID de multa inválido.' });
        }

        if (!FORMAS_PAGAMENTO.includes(forma_pagamento)) {
            return res.status(400).json({
                mensagem: 'Indica a forma de pagamento: numerario, multibanco ou mbway.'
            });
        }

        const multa = await multaModel.procurarPorId(id);

        if (!multa) {
            return res.status(404).json({ mensagem: 'Multa não encontrada.' });
        }

        const alteradas = await multaModel.registarPagamento(id, forma_pagamento);

        if (alteradas === 0) {
            return res.status(400).json({ mensagem: 'Esta multa já não está por pagar.' });
        }

        const aindaTemMultas = await multaModel.temMultasPendentes(multa.cliente_id);

        notificacao.notificarPorId(multa.cliente_id, {
            assunto: 'Multa paga',
            mensagem:
                `Registámos o pagamento de ${formatarEuros(multa.valor)} da multa do tema ${multa.tema_nome}.\n` +
                (aindaTemMultas
                    ? 'Ainda tem outra multa por pagar.'
                    : 'Já pode voltar a reservar temas e a usar a lista de espera.')
        });

        tempoReal.avisarAlteracao({ area: 'multas', clienteId: multa.cliente_id });

        // Sem multas, os lugares do cliente na lista de espera voltam a contar
        if (!aindaTemMultas) {
            const [temas] = await db.query(`
                SELECT DISTINCT tema_id
                FROM lista_espera
                WHERE cliente_id = ? AND estado = 'aguarda'
            `, [multa.cliente_id]);

            temas.forEach((t) => listaEspera.distribuirSemFalhar(t.tema_id));
        }

        return res.status(200).json({
            mensagem: 'Pagamento registado. O cliente foi desbloqueado.',
            multa_id: Number(id),
            estado: 'paga',
            forma_pagamento,
            cliente_desbloqueado: !aindaTemMultas
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao registar o pagamento da multa.');
    }
};

// Anular uma multa (apenas administrador)
const anular = async (req, res) => {
    try {
        const { id } = req.params;

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID de multa inválido.' });
        }

        const multa = await multaModel.procurarPorId(id);

        if (!multa) {
            return res.status(404).json({ mensagem: 'Multa não encontrada.' });
        }

        const alteradas = await multaModel.anular(id);

        if (alteradas === 0) {
            return res.status(400).json({ mensagem: 'Só é possível anular multas por pagar.' });
        }

        notificacao.notificarPorId(multa.cliente_id, {
            assunto: 'Multa anulada',
            mensagem: `A multa do tema ${multa.tema_nome} foi anulada pela loja.`
        });

        tempoReal.avisarAlteracao({ area: 'multas', clienteId: multa.cliente_id });

        return res.status(200).json({
            mensagem: 'Multa anulada com sucesso.',
            multa_id: Number(id),
            estado: 'anulada'
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao anular a multa.');
    }
};

// Tarefa periódica:
// 1. alugueres com o prazo ultrapassado passam a 'atrasado';
// 2. 48h depois do prazo, cria a multa automática e avisa o cliente.
const gerarMultasAutomaticas = async () => {
    await db.query(`
        UPDATE aluguer
        SET estado = 'atrasado'
        WHERE estado = 'ativo'
          AND data_devolucao_real IS NULL
          AND data_prevista_devolucao < NOW()
    `);

    const alugueres = await multaModel.buscarAlugueresParaMulta();
    const valor = valorMultaAtraso();
    let multasCriadas = 0;

    for (const aluguer of alugueres) {
        try {
            await multaModel.criar({
                aluguer_id: aluguer.aluguer_id,
                motivo: 'Atraso na devolução superior a 48 horas.',
                valor
            });

            multasCriadas++;

            notificacao.notificarPorId(aluguer.cliente_id, {
                assunto: 'Multa por atraso na devolução',
                mensagem:
                    `O tema ${aluguer.tema_nome} devia ter sido devolvido até ${formatarDataHora(aluguer.data_prevista_devolucao)}. ` +
                    `Passaram mais de 48 horas, por isso foi aplicada uma multa de ${formatarEuros(valor)}.\n` +
                    'Até a pagar na loja, não pode fazer reservas nem usar a lista de espera. Por favor, devolva o tema o mais depressa possível.'
            });

            tempoReal.avisarAlteracao({ area: 'multas', clienteId: aluguer.cliente_id });

        } catch (erro) {
            // Ignorar duplicações protegidas pela chave UNIQUE
            if (erro.code !== 'ER_DUP_ENTRY') {
                throw erro;
            }
        }
    }

    return multasCriadas;
};

module.exports = {
    listar,
    consultar,
    minhasMultas,
    registarPagamento,
    anular,
    gerarMultasAutomaticas
};
