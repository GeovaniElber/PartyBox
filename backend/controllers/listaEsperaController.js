const listaEsperaModel = require('../models/listaEsperaModel');
const reservaModel = require('../models/reservaModel');
const temaModel = require('../models/temaModel');
const multaModel = require('../models/multaModel');
const listaEspera = require('../services/listaEsperaService');
const notificacao = require('../services/notificacaoService');
const tempoReal = require('../src/socket');
const db = require('../src/config/database');
const { responderErro, idValido } = require('../utils/erros');
const { dataValida, hojeISO, formatarPeriodo } = require('../utils/datas');

// Validar tema e período recebidos (query ou body). Devolve uma mensagem de erro ou null.
const validarPeriodo = ({ tema_id, data_inicio, data_fim }) => {
    if (!tema_id || !data_inicio || !data_fim) {
        return 'Indica o tema, a data de início e a data de fim.';
    }

    if (!idValido(tema_id)) return 'ID do tema inválido.';

    if (!dataValida(data_inicio) || !dataValida(data_fim)) {
        return 'As datas devem estar no formato AAAA-MM-DD e ser válidas.';
    }

    if (data_fim < data_inicio) return 'A data de fim não pode ser anterior à data de início.';

    if (data_inicio < hojeISO()) return 'Não é possível usar a lista de espera para datas passadas.';

    return null;
};

// Listar todos os pedidos (funcionários e administradores)
const listar = async (req, res) => {
    try {
        const pedidos = await listaEsperaModel.listarTodas();

        return res.status(200).json(pedidos);

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar a lista de espera.');
    }
};

// Listar pedidos do próprio cliente, com o lugar na fila dos pedidos ativos
const minhasEntradas = async (req, res) => {
    try {
        const pedidos = await listaEsperaModel.listarPorCliente(req.utilizador.id);

        const comPosicao = await Promise.all(pedidos.map(async (p) => ({
            ...p,
            posicao: p.estado === 'aguarda'
                ? await listaEspera.calcularPosicao({
                    temaId: p.tema_id,
                    dataInicio: p.data_inicio,
                    dataFim: p.data_fim,
                    criadoEm: p.criado_em,
                    excluirId: p.id
                })
                : null
        })));

        return res.status(200).json(comPosicao);

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar os teus pedidos.');
    }
};

// Antes de entrar: em que lugar ficaria o cliente para estes dias?
// GET /api/lista-espera/posicao?tema_id=&data_inicio=&data_fim=
const consultarPosicao = async (req, res) => {
    try {
        const erroValidacao = validarPeriodo(req.query);

        if (erroValidacao) {
            return res.status(400).json({ mensagem: erroValidacao });
        }

        const { tema_id, data_inicio, data_fim } = req.query;

        const posicao = await listaEspera.calcularPosicao({
            temaId: tema_id,
            dataInicio: data_inicio,
            dataFim: data_fim
        });

        return res.status(200).json({
            tema_id: Number(tema_id),
            data_inicio,
            data_fim,
            pedidos_a_frente: posicao - 1,
            posicao
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar a posição na fila.');
    }
};

// Consultar um pedido específico
const consultar = async (req, res) => {
    try {
        const { id } = req.params;

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID do pedido inválido.' });
        }

        const pedido = await listaEsperaModel.procurarPorId(id);

        if (!pedido) {
            return res.status(404).json({ mensagem: 'Pedido não encontrado.' });
        }

        // O cliente só pode consultar os próprios pedidos
        if (
            req.utilizador.tipo === 'cliente' &&
            Number(pedido.cliente_id) !== Number(req.utilizador.id)
        ) {
            return res.status(403).json({ mensagem: 'Não tens autorização para consultar este pedido.' });
        }

        return res.status(200).json(pedido);

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar o pedido.');
    }
};

// Entrar na lista de espera (cliente)
const criar = async (req, res) => {
    try {
        const erroValidacao = validarPeriodo(req.body);

        if (erroValidacao) {
            return res.status(400).json({ mensagem: erroValidacao });
        }

        const { tema_id, data_inicio, data_fim } = req.body;
        const clienteId = req.utilizador.id;

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
            return res.status(404).json({ mensagem: 'Cliente não encontrado ou conta inativa.' });
        }

        // Clientes com multa não podem entrar na fila
        if (await multaModel.temMultasPendentes(clienteId)) {
            return res.status(403).json({
                mensagem: 'Tens multas pendentes. Regulariza-as antes de entrar na lista de espera.'
            });
        }

        const tema = await temaModel.procurarPorId(tema_id);

        if (!tema) {
            return res.status(404).json({ mensagem: 'Tema não encontrado.' });
        }

        if (['manutencao', 'inativo'].includes(tema.estado)) {
            return res.status(400).json({
                mensagem: 'Este tema está em manutenção ou inativo e não aceita pedidos de espera.'
            });
        }

        // A lista de espera só se usa quando as datas estão ocupadas
        // (por uma reserva ou por uma oferta da lista de espera feita a outro cliente)
        const existeConflito = await reservaModel.verificarConflito(
            tema_id,
            data_inicio,
            data_fim,
            db,
            clienteId
        );

        if (!existeConflito) {
            return res.status(409).json({
                mensagem: 'Este tema está disponível para o período selecionado. Podes criar uma reserva diretamente.'
            });
        }

        // Impedir pedidos duplicados para dias em comum
        if (await listaEsperaModel.existePedidoAtivo(clienteId, tema_id, data_inicio, data_fim)) {
            return res.status(409).json({
                mensagem: 'Já tens um pedido ativo na lista de espera para estes dias.'
            });
        }

        const pedidoId = await listaEsperaModel.criar({
            cliente_id: clienteId,
            tema_id,
            data_inicio,
            data_fim
        });

        const pedido = await listaEsperaModel.procurarPorId(pedidoId);

        const posicao = await listaEspera.calcularPosicao({
            temaId: tema_id,
            dataInicio: data_inicio,
            dataFim: data_fim,
            criadoEm: pedido.criado_em,
            excluirId: pedidoId
        });

        notificacao.notificarPorId(clienteId, {
            assunto: 'Está na lista de espera',
            mensagem:
                `Tema ${tema.nome}, ${formatarPeriodo(data_inicio, data_fim)}: está em ${posicao}.º lugar.\n` +
                'Se estas datas ficarem livres e for a sua vez, avisamos por email e WhatsApp. ' +
                'Nessa altura tem 24 horas para confirmar.'
        });

        tempoReal.avisarAlteracao({ area: 'lista_espera', temaId: tema_id, clienteId });

        return res.status(201).json({
            mensagem: 'Entraste na lista de espera com sucesso.',
            pedido_id: pedidoId,
            cliente_id: clienteId,
            tema_id: Number(tema_id),
            estado: 'aguarda',
            posicao
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro interno ao entrar na lista de espera.');
    }
};

// O cliente confirma a oferta ("Confirmar reserva")
const aceitar = async (req, res) => {
    try {
        const { id } = req.params;

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID do pedido inválido.' });
        }

        const { reservaId } = await listaEspera.aceitarOferta(id, req.utilizador.id);

        return res.status(201).json({
            mensagem: 'Reserva criada. Aguarda a confirmação da loja.',
            pedido_id: Number(id),
            reserva_id: reservaId,
            estado: 'convertido'
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao confirmar a oferta.');
    }
};

// O cliente recusa a oferta ("Não quero") ou sai da fila.
// Funcionários e administradores também podem retirar um pedido.
const cancelar = async (req, res) => {
    try {
        const { id } = req.params;

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID do pedido inválido.' });
        }

        const clienteId = req.utilizador.tipo === 'cliente' ? req.utilizador.id : null;
        const pedido = await listaEspera.cancelarPedido(id, clienteId);

        return res.status(200).json({
            mensagem: pedido.estado === 'contactado'
                ? 'Oferta recusada. As datas passaram para a pessoa seguinte da fila.'
                : 'Saíste da lista de espera.',
            pedido_id: Number(id),
            estado: 'cancelado'
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao cancelar o pedido.');
    }
};

module.exports = {
    listar,
    minhasEntradas,
    consultarPosicao,
    consultar,
    criar,
    aceitar,
    cancelar
};
