const jwt = require('jsonwebtoken');
const utilizadorModel = require('../models/utilizadorModel');

// Verificar autenticação JWT
const autenticar = async (req, res, next) => {
    try {
        const authorization = req.headers.authorization;

        if (!authorization || !authorization.startsWith('Bearer ')) {
            return res.status(401).json({
                mensagem: 'Acesso não autorizado. Token não fornecido.'
            });
        }

        const token = authorization.split(' ')[1];

        // Validar token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Confirmar que o utilizador continua ativo
        const utilizador = await utilizadorModel.procurarPorId(decoded.id);

        if (!utilizador || !utilizador.ativo) {
            return res.status(401).json({
                mensagem: 'Utilizador inexistente ou conta inativa.'
            });
        }

        req.utilizador = {
            id: utilizador.id,
            nome: utilizador.nome,
            email: utilizador.email,
            tipo: utilizador.tipo
        };

        next();

    } catch (erro) {
        if (
            erro.name === 'JsonWebTokenError' ||
            erro.name === 'TokenExpiredError'
        ) {
            return res.status(401).json({
                mensagem: 'Token inválido ou expirado.'
            });
        }

        console.error('Erro na autenticação:', erro);

        return res.status(500).json({
            mensagem: 'Erro interno na autenticação.'
        });
    }
};


// Autenticação opcional: identifica o utilizador se enviar um token válido,
// mas deixa passar visitantes sem token (rotas públicas, como o catálogo de temas).
const autenticarOpcional = async (req, res, next) => {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
        req.utilizador = null;
        return next();
    }

    return autenticar(req, res, next);
};


// Verificar permissões por tipo de utilizador
const autorizar = (...tiposPermitidos) => {
    return (req, res, next) => {

        if (!req.utilizador) {
            return res.status(401).json({
                mensagem: 'Autenticação necessária.'
            });
        }

        if (!tiposPermitidos.includes(req.utilizador.tipo)) {
            return res.status(403).json({
                mensagem: 'Não tens permissão para realizar esta operação.'
            });
        }

        next();
    };
};


module.exports = {
    autenticar,
    autenticarOpcional,
    autorizar
};
