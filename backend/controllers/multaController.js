
const multaModel = require('../models/multaModel');

// Listar todas as multas (funcionários e administradores)
const listar = async (req, res) => {
    try {
        const multas = await multaModel.listarTodas();

        return res.status(200).json(multas);

    } catch (erro) {
        console.error('Erro ao listar multas:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar as multas.'
        });
    }
};

// Consultar uma multa pelo ID
const consultar = async (req, res) => {
    try {
        const { id } = req.params;

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                mensagem: 'ID de multa inválido.'
            });
        }

        const multa = await multaModel.procurarPorId(id);

        if (!multa) {
            return res.status(404).json({
                mensagem: 'Multa não encontrada.'
            });
        }

        // O cliente só pode consultar as suas próprias multas.
        if (
            req.utilizador.tipo === 'cliente' &&
            Number(multa.cliente_id) !== Number(req.utilizador.id)
        ) {
            return res.status(403).json({
                mensagem: 'Não tens autorização para consultar esta multa.'
            });
        }

        return res.status(200).json(multa);

    } catch (erro) {
        console.error('Erro ao consultar multa:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar a multa.'
        });
    }
};

// Consultar multas do próprio cliente
const minhasMultas = async (req, res) => {
    try {
        const multas = await multaModel.listarPorCliente(
            req.utilizador.id
        );

        return res.status(200).json(multas);

    } catch (erro) {
        console.error('Erro ao consultar multas do cliente:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao consultar as tuas multas.'
        });
    }
};

// Atualizar estado de uma multa
const atualizarEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
            return res.status(400).json({
                mensagem: 'ID de multa inválido.'
            });
        }

        if (!['paga', 'anulada'].includes(estado)) {
            return res.status(400).json({
                mensagem: 'Estado inválido. Utiliza paga ou anulada.'
            });
        }

        const multa = await multaModel.procurarPorId(id);

        if (!multa) {
            return res.status(404).json({
                mensagem: 'Multa não encontrada.'
            });
        }

        if (multa.estado !== 'pendente') {
            return res.status(400).json({
                mensagem: 'Só é possível atualizar multas pendentes.'
            });
        }

        await multaModel.atualizarEstado(id, estado);

        return res.status(200).json({
            mensagem: estado === 'paga'
                ? 'Multa marcada como paga.'
                : 'Multa anulada com sucesso.',
            multa_id: Number(id),
            estado
        });

    } catch (erro) {
        console.error('Erro ao atualizar multa:', erro);

        return res.status(500).json({
            mensagem: 'Erro ao atualizar o estado da multa.'
        });
    }
};


// Criar multas automaticamente após 48 horas de atraso
const gerarMultasAutomaticas = async () => {
    try {
        const alugueres = await multaModel.buscarAlugueresParaMulta();

        let multasCriadas = 0;

        for (const aluguer of alugueres) {
            try {
                await multaModel.criar({
                    aluguer_id: aluguer.aluguer_id,
                    motivo: 'Atraso na devolução superior a 48 horas.',
                    valor: 25
                });

                multasCriadas++;

                console.log(
                    `Multa de 25 € criada para o aluguer ${aluguer.aluguer_id}.`
                );

            } catch (erro) {
                // Ignorar duplicações protegidas pela chave UNIQUE
                if (erro.code !== 'ER_DUP_ENTRY') {
                    throw erro;
                }
            }
        }

        return multasCriadas;

    } catch (erro) {
        console.error('Erro ao gerar multas automáticas:', erro);
        throw erro;
    }
};


module.exports = {
    listar,
    consultar,
    minhasMultas,
    atualizarEstado,
    gerarMultasAutomaticas
};
