const utilizadorModel = require('../models/utilizadorModel');
const reservaModel = require('../models/reservaModel');
const aluguerModel = require('../models/aluguerModel');
const multaModel = require('../models/multaModel');
const listaEsperaModel = require('../models/listaEsperaModel');
const notificacao = require('../services/notificacaoService');
const tempoReal = require('../src/socket');
const { removerFicheiro, removerFicheirosDoPedido } = require('../middlewares/criarUpload');
const { responderErro, idValido } = require('../utils/erros');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const formatoEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validar nome, email e telefone (todos obrigatórios). Devolve uma mensagem ou null.
const validarContactos = ({ nome, email, telefone }) => {
    if (!nome || !String(nome).trim()) return 'O nome é obrigatório.';
    if (!email || !formatoEmail.test(String(email).trim())) return 'Indica um email válido.';

    if (!telefone || !notificacao.normalizarTelefone(telefone)) {
        return 'Indica um número de telemóvel válido (é usado para os avisos por WhatsApp).';
    }

    return null;
};

const normalizarEmail = (email) => String(email).trim().toLowerCase();

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const urlFrontend = () => process.env.CLIENT_URL || 'http://localhost:5173';

// Criar um link de definição de palavra-passe (recuperação ou conta nova)
const criarLinkSenha = async (utilizadorId, horasValidade) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + horasValidade * 60 * 60 * 1000);

    await utilizadorModel.guardarTokenReset(utilizadorId, hashToken(token), expira);

    return `${urlFrontend()}/redefinir-palavra-passe?token=${token}`;
};


// REGISTAR CLIENTE (todos os campos obrigatórios, incluindo a fotografia)
const registar = async (req, res) => {
    try {
        const { nome, email, senha, telefone } = req.body;

        const recusar = (status, mensagem) => {
            removerFicheirosDoPedido(req);
            return res.status(status).json({ mensagem });
        };

        const erroContactos = validarContactos({ nome, email, telefone });
        if (erroContactos) return recusar(400, erroContactos);

        if (!senha) return recusar(400, 'A palavra-passe é obrigatória.');

        if (!req.file) return recusar(400, 'A fotografia é obrigatória.');

        if (String(senha).length < 8) {
            return recusar(400, 'A palavra-passe deve ter pelo menos 8 caracteres.');
        }

        const emailNormalizado = normalizarEmail(email);

        if (await utilizadorModel.procurarPorEmail(emailNormalizado)) {
            return recusar(409, 'Este email já está registado.');
        }

        const senhaHash = await bcrypt.hash(senha, 12);

        // O registo cria sempre contas de cliente
        const id = await utilizadorModel.criar({
            nome: String(nome).trim(),
            email: emailNormalizado,
            senha_hash: senhaHash,
            tipo: 'cliente',
            telefone: String(telefone).trim(),
            foto: req.file.filename
        });

        tempoReal.avisarAlteracao({ area: 'utilizadores' });

        return res.status(201).json({
            mensagem: 'Cliente registado com sucesso!',
            utilizador: {
                id,
                nome: String(nome).trim(),
                email: emailNormalizado,
                tipo: 'cliente',
                telefone: String(telefone).trim(),
                foto: req.file.filename
            }
        });

    } catch (erro) {
        removerFicheirosDoPedido(req);
        return responderErro(res, erro, 'Erro interno ao registar utilizador.');
    }
};


// LOGIN (um só login; o tipo de conta decide para onde o frontend vai)
const login = async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ mensagem: 'Email e palavra-passe são obrigatórios.' });
        }

        const utilizador = await utilizadorModel.procurarPorEmail(normalizarEmail(email));

        if (!utilizador) {
            return res.status(401).json({ mensagem: 'Email ou palavra-passe incorretos.' });
        }

        if (!utilizador.ativo) {
            return res.status(403).json({ mensagem: 'Esta conta encontra-se inativa.' });
        }

        const senhaValida = await bcrypt.compare(senha, utilizador.senha_hash);

        if (!senhaValida) {
            return res.status(401).json({ mensagem: 'Email ou palavra-passe incorretos.' });
        }

        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET não está configurado.');
        }

        const token = jwt.sign(
            { id: utilizador.id, tipo: utilizador.tipo },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        return res.status(200).json({
            mensagem: 'Login efetuado com sucesso!',
            token,
            utilizador: {
                id: utilizador.id,
                nome: utilizador.nome,
                email: utilizador.email,
                tipo: utilizador.tipo,
                telefone: utilizador.telefone,
                foto: utilizador.foto
            }
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro interno ao efetuar login.');
    }
};


// CONSULTAR DADOS (perfil do utilizador autenticado)
const perfil = async (req, res) => {
    try {
        const utilizador = await utilizadorModel.procurarPorId(req.utilizador.id);

        if (!utilizador) {
            return res.status(404).json({ mensagem: 'Utilizador não encontrado.' });
        }

        return res.status(200).json({
            mensagem: 'Perfil carregado com sucesso!',
            utilizador
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro interno ao consultar perfil.');
    }
};


// ALTERAR DADOS: nome, email, telefone e (opcional) nova fotografia.
// A fotografia é obrigatória: pode ser trocada, mas não removida.
const atualizarPerfil = async (req, res) => {
    try {
        const { nome, email, telefone } = req.body;

        const recusar = (status, mensagem) => {
            removerFicheirosDoPedido(req);
            return res.status(status).json({ mensagem });
        };

        const erroContactos = validarContactos({ nome, email, telefone });
        if (erroContactos) return recusar(400, erroContactos);

        const atual = await utilizadorModel.procurarPorId(req.utilizador.id);
        if (!atual) return recusar(404, 'Utilizador não encontrado.');

        const emailNormalizado = normalizarEmail(email);

        if (emailNormalizado !== atual.email) {
            const outro = await utilizadorModel.procurarPorEmail(emailNormalizado);
            if (outro) return recusar(409, 'Este email já está registado noutra conta.');
        }

        const foto = req.file ? req.file.filename : atual.foto;

        await utilizadorModel.atualizarPerfil(atual.id, {
            nome: String(nome).trim(),
            email: emailNormalizado,
            telefone: String(telefone).trim(),
            foto
        });

        if (req.file && atual.foto) {
            removerFicheiro('clientes', atual.foto);
        }

        const utilizador = await utilizadorModel.procurarPorId(atual.id);

        return res.status(200).json({
            mensagem: 'Dados atualizados com sucesso.',
            utilizador
        });

    } catch (erro) {
        removerFicheirosDoPedido(req);
        return responderErro(res, erro, 'Erro ao atualizar os dados.');
    }
};


// ALTERAR PALAVRA-PASSE (com a palavra-passe atual)
const alterarSenha = async (req, res) => {
    try {
        const { senha_atual, senha_nova } = req.body;

        if (!senha_atual || !senha_nova) {
            return res.status(400).json({ mensagem: 'Indica a palavra-passe atual e a nova.' });
        }

        if (String(senha_nova).length < 8) {
            return res.status(400).json({ mensagem: 'A nova palavra-passe deve ter pelo menos 8 caracteres.' });
        }

        const conta = await utilizadorModel.procurarComSenha(req.utilizador.id);

        if (!conta || !(await bcrypt.compare(senha_atual, conta.senha_hash))) {
            return res.status(401).json({ mensagem: 'A palavra-passe atual não está correta.' });
        }

        await utilizadorModel.atualizarSenha(conta.id, await bcrypt.hash(senha_nova, 12));

        notificacao.notificarPorId(conta.id, {
            assunto: 'Palavra-passe alterada',
            mensagem: 'A palavra-passe da sua conta foi alterada. Se não foi você, contacte a loja imediatamente.'
        });

        return res.status(200).json({ mensagem: 'Palavra-passe alterada com sucesso.' });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao alterar a palavra-passe.');
    }
};


// DESCARREGAR OS MEUS DADOS (direito de acesso aos dados pessoais)
const exportarDados = async (req, res) => {
    try {
        const id = req.utilizador.id;

        const [utilizador, reservas, alugueres, multas, listaEspera] = await Promise.all([
            utilizadorModel.procurarPorId(id),
            reservaModel.listarPorCliente(id),
            aluguerModel.listarPorCliente(id),
            multaModel.listarPorCliente(id),
            listaEsperaModel.listarPorCliente(id)
        ]);

        res.setHeader('Content-Disposition', 'attachment; filename="partybox-os-meus-dados.json"');

        return res.status(200).json({
            exportado_em: new Date().toISOString(),
            utilizador,
            reservas,
            alugueres,
            multas,
            lista_espera: listaEspera
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao exportar os dados.');
    }
};


// RECUPERAR PALAVRA-PASSE: enviar um link por email (válido 1 hora).
// A resposta é sempre igual, para não revelar que emails têm conta.
const pedirRecuperacao = async (req, res) => {
    const resposta = {
        mensagem: 'Se o email tiver conta na PartyBox, enviámos um link para criar uma palavra-passe nova. O link é válido durante 1 hora.'
    };

    try {
        const { email } = req.body;

        if (!email || !formatoEmail.test(String(email).trim())) {
            return res.status(400).json({ mensagem: 'Indica um email válido.' });
        }

        const utilizador = await utilizadorModel.procurarPorEmail(normalizarEmail(email));

        if (utilizador && utilizador.ativo) {
            const url = await criarLinkSenha(utilizador.id, 1);

            notificacao.notificar(utilizador, {
                assunto: 'Recuperar palavra-passe',
                mensagem:
                    'Recebemos um pedido para criar uma palavra-passe nova. O link é válido durante 1 hora e só funciona uma vez.\n' +
                    'Se não fez este pedido, ignore este email: a sua palavra-passe não muda.',
                ligacao: { texto: 'Criar palavra-passe nova', url },
                canais: ['email']
            });
        }

        return res.status(200).json(resposta);

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao pedir a recuperação da palavra-passe.');
    }
};


// REDEFINIR PALAVRA-PASSE com o token do link
const redefinirSenha = async (req, res) => {
    try {
        const { token, senha } = req.body;

        if (!token || typeof token !== 'string') {
            return res.status(400).json({ mensagem: 'Link inválido.' });
        }

        if (!senha || String(senha).length < 8) {
            return res.status(400).json({ mensagem: 'A palavra-passe deve ter pelo menos 8 caracteres.' });
        }

        const utilizador = await utilizadorModel.procurarPorTokenReset(hashToken(token));

        if (!utilizador) {
            return res.status(400).json({ mensagem: 'O link é inválido ou já expirou. Peça um novo.' });
        }

        // Também invalida o token (só funciona uma vez)
        await utilizadorModel.atualizarSenha(utilizador.id, await bcrypt.hash(senha, 12));

        notificacao.notificar(utilizador, {
            assunto: 'Palavra-passe alterada',
            mensagem: 'Já pode entrar com a palavra-passe nova. Se não foi você, contacte a loja imediatamente.'
        });

        return res.status(200).json({ mensagem: 'Palavra-passe alterada. Já pode entrar.' });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao redefinir a palavra-passe.');
    }
};


// ---------- Gestão (administrador) ----------

// Listar clientes ou atendedores: ?tipo=cliente|funcionario&pesquisa=
const listar = async (req, res) => {
    try {
        const tipo = ['cliente', 'funcionario'].includes(req.query.tipo) ? req.query.tipo : 'cliente';
        const pesquisa = typeof req.query.pesquisa === 'string' ? req.query.pesquisa.trim() : '';

        const utilizadores = await utilizadorModel.listar({ tipo, pesquisa });

        return res.status(200).json(utilizadores);

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao listar utilizadores.');
    }
};

// Consultar um utilizador com o histórico (tela "Gerir clientes")
const consultar = async (req, res) => {
    try {
        const { id } = req.params;

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID inválido.' });
        }

        const utilizador = await utilizadorModel.procurarPorId(id);

        if (!utilizador) {
            return res.status(404).json({ mensagem: 'Utilizador não encontrado.' });
        }

        if (utilizador.tipo !== 'cliente') {
            return res.status(200).json({ utilizador });
        }

        const [reservas, alugueres, multas, listaEspera] = await Promise.all([
            reservaModel.listarPorCliente(id),
            aluguerModel.listarPorCliente(id),
            multaModel.listarPorCliente(id),
            listaEsperaModel.listarPorCliente(id)
        ]);

        return res.status(200).json({
            utilizador,
            reservas,
            alugueres,
            multas,
            lista_espera: listaEspera
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao consultar o utilizador.');
    }
};

// Criar conta pela loja (cliente ao balcão ou atendedor).
// A pessoa recebe um email para definir a palavra-passe (link válido 72 horas).
const criarConta = (tipo) => async (req, res) => {
    try {
        const { nome, email, telefone } = req.body;

        const recusar = (status, mensagem) => {
            removerFicheirosDoPedido(req);
            return res.status(status).json({ mensagem });
        };

        const erroContactos = validarContactos({ nome, email, telefone });
        if (erroContactos) return recusar(400, erroContactos);

        // A fotografia é obrigatória para clientes (confirma a identidade no levantamento)
        if (tipo === 'cliente' && !req.file) {
            return recusar(400, 'A fotografia do cliente é obrigatória.');
        }

        const emailNormalizado = normalizarEmail(email);

        if (await utilizadorModel.procurarPorEmail(emailNormalizado)) {
            return recusar(409, 'Este email já está registado.');
        }

        // Palavra-passe aleatória que ninguém conhece, até a pessoa definir a sua
        const senhaHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

        const id = await utilizadorModel.criar({
            nome: String(nome).trim(),
            email: emailNormalizado,
            senha_hash: senhaHash,
            tipo,
            telefone: String(telefone).trim(),
            foto: req.file ? req.file.filename : null
        });

        const url = await criarLinkSenha(id, 72);

        notificacao.notificar({ id, nome: String(nome).trim(), email: emailNormalizado }, {
            assunto: 'A sua conta PartyBox foi criada',
            mensagem: tipo === 'funcionario'
                ? 'A administração criou a sua conta de atendedor. Defina a sua palavra-passe para entrar. O link é válido durante 72 horas.'
                : 'A loja criou a sua conta de cliente. Defina a sua palavra-passe para ver os temas, reservar e consultar as suas reservas e multas. O link é válido durante 72 horas.',
            ligacao: { texto: 'Definir palavra-passe', url },
            canais: ['email']
        });

        tempoReal.avisarAlteracao({ area: 'utilizadores' });

        return res.status(201).json({
            mensagem: 'Conta criada. Enviámos um email para definir a palavra-passe.',
            id,
            tipo
        });

    } catch (erro) {
        removerFicheirosDoPedido(req);
        return responderErro(res, erro, 'Erro ao criar a conta.');
    }
};

// Ativar ou desativar uma conta de cliente ou atendedor { ativo: true|false }
const alterarAtivo = async (req, res) => {
    try {
        const { id } = req.params;
        const { ativo } = req.body;

        if (!idValido(id)) {
            return res.status(400).json({ mensagem: 'ID inválido.' });
        }

        if (typeof ativo !== 'boolean') {
            return res.status(400).json({ mensagem: 'Indica ativo: true ou false.' });
        }

        if (Number(id) === Number(req.utilizador.id)) {
            return res.status(400).json({ mensagem: 'Não podes desativar a tua própria conta.' });
        }

        const utilizador = await utilizadorModel.procurarPorId(id);

        if (!utilizador) {
            return res.status(404).json({ mensagem: 'Utilizador não encontrado.' });
        }

        if (utilizador.tipo === 'administrador') {
            return res.status(403).json({ mensagem: 'Não é possível desativar contas de administrador.' });
        }

        await utilizadorModel.alterarAtivo(id, ativo);

        tempoReal.avisarAlteracao({ area: 'utilizadores' });

        return res.status(200).json({
            mensagem: ativo ? 'Conta ativada.' : 'Conta desativada. Esta pessoa já não consegue entrar.',
            id: Number(id),
            ativo
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao alterar o estado da conta.');
    }
};

module.exports = {
    registar,
    login,
    perfil,
    atualizarPerfil,
    alterarSenha,
    exportarDados,
    pedirRecuperacao,
    redefinirSenha,
    listar,
    consultar,
    criarCliente: criarConta('cliente'),
    criarFuncionario: criarConta('funcionario'),
    alterarAtivo
};
